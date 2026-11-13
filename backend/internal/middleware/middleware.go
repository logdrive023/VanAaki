// Package middleware: CORS, log, proteção contra pânico, autenticação e permissão por perfil.
package middleware

import (
	"context"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/logdrive023/vanaaki/backend/internal/authentication"
	"github.com/logdrive023/vanaaki/backend/internal/core"
	"github.com/logdrive023/vanaaki/backend/internal/httpx"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

// CORS libera o app (que pode estar em outro domínio, ex.: GitHub Pages) a chamar a API.
func CORS(origens []string) func(http.Handler) http.Handler {
	todas := len(origens) == 0 || (len(origens) == 1 && origens[0] == "*")
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			o := r.Header.Get("Origin")
			if o != "" && (todas || models.Contem(origens, o)) {
				w.Header().Set("Access-Control-Allow-Origin", o)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Max-Age", "600")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

type gravador struct {
	http.ResponseWriter
	status int
}

func (g *gravador) WriteHeader(s int) { g.status = s; g.ResponseWriter.WriteHeader(s) }

// Flush repassa (necessário para o SSE funcionar atrás do log).
func (g *gravador) Flush() {
	if f, ok := g.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Log registra método, caminho, status e tempo (sem corpo nem token).
func Log(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t := time.Now()
		g := &gravador{ResponseWriter: w, status: 200}
		next.ServeHTTP(g, r)
		if r.URL.Path != "/api/eventos" {
			log.Printf("%s %s %d %s", r.Method, r.URL.Path, g.status, time.Since(t).Round(time.Millisecond))
		}
	})
}

// Recuperar evita que um erro derrube o servidor.
func Recuperar(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if e := recover(); e != nil {
				log.Printf("pânico em %s: %v", r.URL.Path, e)
				core.Responder{W: w}.Erro(core.NovoErro(500, "Algo deu errado."))
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// Resolvedor calcula o escopo (vans, alunos, escola) do usuário a partir do banco.
type Resolvedor interface {
	Escopo(ctx context.Context, usuarioID string) (models.Escopo, error)
}

// Autenticar exige o token (cabeçalho Authorization: Bearer, ou ?token= para o EventSource).
func Autenticar(tk *authentication.Tokens, res Resolvedor) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
			if token == "" {
				token = r.URL.Query().Get("token")
			}
			c, err := tk.Validar(token)
			if err != nil {
				core.Responder{W: w}.Erro(core.ErrNaoAutorizado)
				return
			}
			e, err := res.Escopo(r.Context(), c.Subject)
			if err != nil {
				core.Responder{W: w}.Erro(core.ErrNaoAutorizado)
				return
			}
			next.ServeHTTP(w, r.WithContext(httpx.ComEscopo(r.Context(), e)))
		})
	}
}

// Perfis deixa passar só os perfis listados.
func Perfis(ps ...models.Perfil) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			e := httpx.Escopo(r)
			for _, p := range ps {
				if e.Usuario.Perfil == p {
					next.ServeHTTP(w, r)
					return
				}
			}
			core.Responder{W: w}.Erro(core.ErrProibido)
		})
	}
}

// Limitar = limite simples por IP (login e cadastro), para evitar tentativa de senha em massa.
func Limitar(porMinuto int) func(http.Handler) http.Handler {
	var mu sync.Mutex
	contagem := map[string][]time.Time{}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := r.Header.Get("X-Forwarded-For")
			if ip == "" {
				ip = r.RemoteAddr
				if i := strings.LastIndex(ip, ":"); i > 0 {
					ip = ip[:i]
				}
			}
			agora := time.Now()
			mu.Lock()
			l := contagem[ip][:0]
			for _, t := range contagem[ip] {
				if agora.Sub(t) < time.Minute {
					l = append(l, t)
				}
			}
			l = append(l, agora)
			contagem[ip] = l
			n := len(l)
			mu.Unlock()
			if n > porMinuto {
				core.Responder{W: w}.Erro(core.NovoErro(http.StatusTooManyRequests, "Muitas tentativas. Espere um minuto."))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
