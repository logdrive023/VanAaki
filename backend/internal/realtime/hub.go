// Package realtime avisa os aparelhos conectados (Server-Sent Events) quando algo muda.
//
// Cada conexão guarda o escopo do usuário (van, alunos, escola). Um evento vai só para quem
// tem a ver com ele, e a viagem é montada por pessoa (a família recebe a versão com privacidade).
package realtime

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/logdrive023/vanaaki/backend/internal/models"
)

// Alvo = de quem é o acontecimento.
type Alvo struct {
	VanID     string
	EscolaIDs []string
	AlunoIDs  []string
}

type Cliente struct {
	Escopo models.Escopo
	fila   chan []byte
}

type Hub struct {
	mu       sync.RWMutex
	clientes map[*Cliente]struct{}
}

func New() *Hub { return &Hub{clientes: map[*Cliente]struct{}{}} }

// Interessa diz se o acontecimento é da conta desse usuário.
func Interessa(e models.Escopo, a Alvo) bool {
	switch e.Usuario.Perfil {
	case models.PerfilMotorista:
		return a.VanID != "" && e.TemVan(a.VanID)
	case models.PerfilPais, models.PerfilAluno:
		if a.VanID != "" && e.TemVan(a.VanID) {
			return true
		}
		for _, id := range a.AlunoIDs {
			if e.TemAluno(id) {
				return true
			}
		}
	case models.PerfilEscola:
		return models.Contem(a.EscolaIDs, e.EscolaID)
	}
	return false
}

func quadro(evento string, dados any) []byte {
	b, _ := json.Marshal(dados)
	return []byte(fmt.Sprintf("event: %s\ndata: %s\n\n", evento, b))
}

func (h *Hub) enviar(c *Cliente, msg []byte) {
	select {
	case c.fila <- msg:
	default: // aparelho lento: descarta (ele vai receber o próximo "sync")
	}
}

// Sincronizar pede para os interessados buscarem os dados de novo.
func (h *Hub) Sincronizar(a Alvo) {
	msg := quadro("sync", map[string]any{"em": models.AgoraIso()})
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clientes {
		if Interessa(c.Escopo, a) {
			h.enviar(c, msg)
		}
	}
}

// PorCliente manda um evento montado para cada interessado (ex.: a viagem filtrada).
// montar devolve ok=false para não mandar nada a esse cliente.
func (h *Hub) PorCliente(a Alvo, evento string, montar func(models.Escopo) (any, bool)) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clientes {
		if !Interessa(c.Escopo, a) {
			continue
		}
		if dados, ok := montar(c.Escopo); ok {
			h.enviar(c, quadro(evento, dados))
		}
	}
}

// Servir mantém a conexão SSE aberta até o aparelho sair.
func (h *Hub) Servir(w http.ResponseWriter, r *http.Request, e models.Escopo) {
	fl, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "sem streaming", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	c := &Cliente{Escopo: e, fila: make(chan []byte, 64)}
	h.mu.Lock()
	h.clientes[c] = struct{}{}
	h.mu.Unlock()
	defer func() {
		h.mu.Lock()
		delete(h.clientes, c)
		h.mu.Unlock()
	}()

	_, _ = w.Write(quadro("ola", map[string]any{"perfil": e.Usuario.Perfil}))
	fl.Flush()
	pulso := time.NewTicker(20 * time.Second)
	defer pulso.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case msg := <-c.fila:
			if _, err := w.Write(msg); err != nil {
				return
			}
			fl.Flush()
		case <-pulso.C:
			if _, err := w.Write([]byte(": pulso\n\n")); err != nil {
				return
			}
			fl.Flush()
		}
	}
}

// Conectados = quantos aparelhos estão ouvindo (para o /saude).
func (h *Hub) Conectados() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clientes)
}
