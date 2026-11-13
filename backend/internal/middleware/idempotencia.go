package middleware

import (
	"bytes"
	"context"
	"log"
	"net/http"

	"github.com/logdrive023/vanaaki/backend/internal/httpx"
)

// Operacoes guarda as respostas das ações já feitas (repositório).
type Operacoes interface {
	BuscarOperacao(ctx context.Context, usuarioID, chave string) (int, []byte, bool, error)
	GuardarOperacao(ctx context.Context, usuarioID, chave string, status int, corpo []byte) error
}

// copiaResposta copia a resposta para poder guardá-la.
type copiaResposta struct {
	http.ResponseWriter
	status int
	corpo  bytes.Buffer
}

func (g *copiaResposta) WriteHeader(s int) { g.status = s; g.ResponseWriter.WriteHeader(s) }
func (g *copiaResposta) Write(b []byte) (int, error) {
	if g.status == 0 {
		g.status = http.StatusOK
	}
	g.corpo.Write(b)
	return g.ResponseWriter.Write(b)
}

// Idempotencia: ação com o cabeçalho Idempotency-Key é feita UMA vez só.
// Internet ruim: o app reenvia a mesma ação (mesma chave) e recebe a resposta guardada, sem duplicar.
// Erro 5xx não é guardado (o app tenta de novo e o servidor faz de verdade).
func Idempotencia(ops Operacoes) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			chave := r.Header.Get("Idempotency-Key")
			if chave == "" || r.Method == http.MethodGet || r.Method == http.MethodOptions || len(chave) > 100 {
				next.ServeHTTP(w, r)
				return
			}
			usuario := httpx.Escopo(r).Usuario.ID
			if status, corpo, achou, err := ops.BuscarOperacao(r.Context(), usuario, chave); err == nil && achou {
				w.Header().Set("Content-Type", "application/json; charset=utf-8")
				w.Header().Set("Idempotent-Replay", "true")
				w.WriteHeader(status)
				_, _ = w.Write(corpo)
				return
			}
			g := &copiaResposta{ResponseWriter: w}
			next.ServeHTTP(g, r)
			if g.status != 0 && g.status < 500 {
				if err := ops.GuardarOperacao(context.WithoutCancel(r.Context()), usuario, chave, g.status, g.corpo.Bytes()); err != nil {
					log.Printf("idempotência: %v", err)
				}
			}
		})
	}
}
