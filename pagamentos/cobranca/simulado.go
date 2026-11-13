package cobranca

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/logdrive023/vanaaki/pagamentos/asaas"
)

// Simulado faz o papel do Asaas sem internet nem chave: para desenvolver e testar.
// O "Pix" dele NÃO é um Pix de verdade (o copia e cola começa com SIMULADO).
type Simulado struct {
	mu        sync.Mutex
	pagadores map[string]asaas.Pagador
	cobrancas map[string]asaas.Cobranca
	seq       int
}

func NovoSimulado() *Simulado {
	return &Simulado{pagadores: map[string]asaas.Pagador{}, cobrancas: map[string]asaas.Cobranca{}}
}

func (g *Simulado) proximo(prefixo string) string {
	g.seq++
	return fmt.Sprintf("%s_sim%06d", prefixo, g.seq)
}

func (g *Simulado) PagadorPorReferencia(_ context.Context, ref string) (*asaas.Pagador, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	for _, p := range g.pagadores {
		if p.ReferenciaExterna == ref {
			c := p
			return &c, nil
		}
	}
	return nil, nil
}

func (g *Simulado) CriarPagador(_ context.Context, n asaas.NovoPagador) (asaas.Pagador, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	p := asaas.Pagador{ID: g.proximo("cus"), Nome: n.Nome, ReferenciaExterna: n.ReferenciaExterna}
	g.pagadores[p.ID] = p
	return p, nil
}

func (g *Simulado) CriarCobranca(_ context.Context, n asaas.NovaCobranca) (asaas.Cobranca, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	c := asaas.Cobranca{ID: g.proximo("pay"), Status: "PENDING", Valor: n.Valor, ValorLiquido: n.Valor - 0.99, Vencimento: n.Vencimento, ReferenciaExterna: n.ReferenciaExterna}
	g.cobrancas[c.ID] = c
	return c, nil
}

func (g *Simulado) QRCodePix(_ context.Context, id string) (asaas.QRCodePix, error) {
	return asaas.QRCodePix{CopiaECola: "SIMULADO-PIX-" + id, ExpiraEm: time.Now().Add(24 * time.Hour).Format("2006-01-02 15:04:05")}, nil
}

func (g *Simulado) Cobranca(_ context.Context, id string) (asaas.Cobranca, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	c, ok := g.cobrancas[id]
	if !ok {
		return c, &asaas.Erro{Status: 404, Descricao: "cobrança não encontrada"}
	}
	return c, nil
}

// Pagar marca como recebida e devolve o evento que o Asaas mandaria no webhook.
func (g *Simulado) Pagar(id string) (EventoWebhook, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	c, ok := g.cobrancas[id]
	if !ok {
		return EventoWebhook{}, &asaas.Erro{Status: 404, Descricao: "cobrança não encontrada"}
	}
	c.Status = "RECEIVED"
	g.cobrancas[id] = c
	return EventoWebhook{ID: "evt_" + id, Evento: "PAYMENT_RECEIVED", Criado: time.Now().Format("2006-01-02 15:04:05"), Payment: c}, nil
}
