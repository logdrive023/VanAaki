// Package cobranca: a mensalidade da van vira uma cobrança Pix no gateway, e o aviso de pagamento
// (webhook) vira a baixa automática — sem o tio conferir extrato.
package cobranca

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/logdrive023/vanaaki/pagamentos/asaas"
)

// Gateway = o que o serviço precisa do Asaas (o modo simulado implementa o mesmo).
type Gateway interface {
	PagadorPorReferencia(ctx context.Context, ref string) (*asaas.Pagador, error)
	CriarPagador(ctx context.Context, p asaas.NovoPagador) (asaas.Pagador, error)
	CriarCobranca(ctx context.Context, n asaas.NovaCobranca) (asaas.Cobranca, error)
	QRCodePix(ctx context.Context, cobrancaID string) (asaas.QRCodePix, error)
	Cobranca(ctx context.Context, id string) (asaas.Cobranca, error)
}

// Pedido: o VanAaki pede a cobrança de uma mensalidade.
type Pedido struct {
	MensalidadeID string  `json:"mensalidadeId"` // id da mensalidade no VanAaki (vira externalReference)
	Valor         float64 `json:"valor"`         // em reais
	Vencimento    string  `json:"vencimento"`    // AAAA-MM-DD
	Descricao     string  `json:"descricao"`
	Pagador       struct {
		ID      string `json:"id"` // id do responsável no VanAaki
		Nome    string `json:"nome"`
		CpfCnpj string `json:"cpfCnpj"`
		Email   string `json:"email"`
		Celular string `json:"celular"`
	} `json:"pagador"`
}

// Resposta: o que a família precisa para pagar.
type Resposta struct {
	CobrancaID    string `json:"cobrancaId"`
	MensalidadeID string `json:"mensalidadeId"`
	Status        string `json:"status"`
	Pago          bool   `json:"pago"`
	CopiaECola    string `json:"pixCopiaECola,omitempty"`
	QRCodeBase64  string `json:"qrCodeBase64,omitempty"`
	ExpiraEm      string `json:"expiraEm,omitempty"`
	Fatura        string `json:"fatura,omitempty"`
}

// Aviso: o que vai para o VanAaki quando a mensalidade é paga.
type Aviso struct {
	MensalidadeID string  `json:"mensalidadeId"`
	CobrancaID    string  `json:"cobrancaId"`
	Valor         float64 `json:"valor"`
	ValorLiquido  float64 `json:"valorLiquido"`
	PagoEm        string  `json:"pagoEm"`
	Evento        string  `json:"evento"`
}

type Servico struct {
	gw            Gateway
	tokenWebhook  string
	avisoURL      string
	avisoSegredo  string
	http          *http.Client
	mu            sync.Mutex
	eventosVistos map[string]time.Time // idempotência: o Asaas entrega "pelo menos uma vez"
	cobrancas     map[string]Resposta  // mensalidadeId → última cobrança (evita duas cobranças da mesma mensalidade)
}

func Novo(gw Gateway, tokenWebhook, avisoURL, avisoSegredo string) *Servico {
	return &Servico{gw: gw, tokenWebhook: tokenWebhook, avisoURL: avisoURL, avisoSegredo: avisoSegredo,
		http: &http.Client{Timeout: 15 * time.Second}, eventosVistos: map[string]time.Time{}, cobrancas: map[string]Resposta{}}
}

var ErrInvalido = errors.New("pedido inválido")

// Cobrar cria (ou devolve a já criada) a cobrança Pix da mensalidade.
func (s *Servico) Cobrar(ctx context.Context, p Pedido) (Resposta, error) {
	p.Pagador.CpfCnpj = soDigitos(p.Pagador.CpfCnpj)
	switch {
	case p.MensalidadeID == "" || p.Pagador.ID == "" || strings.TrimSpace(p.Pagador.Nome) == "":
		return Resposta{}, fmt.Errorf("%w: faltam mensalidadeId, pagador.id ou pagador.nome", ErrInvalido)
	case len(p.Pagador.CpfCnpj) != 11 && len(p.Pagador.CpfCnpj) != 14:
		return Resposta{}, fmt.Errorf("%w: o Asaas exige CPF ou CNPJ de quem paga", ErrInvalido)
	case p.Valor < 5:
		return Resposta{}, fmt.Errorf("%w: valor mínimo de R$ 5,00", ErrInvalido)
	}
	if _, err := time.Parse("2006-01-02", p.Vencimento); err != nil {
		return Resposta{}, fmt.Errorf("%w: vencimento no formato AAAA-MM-DD", ErrInvalido)
	}
	s.mu.Lock()
	ja, existe := s.cobrancas[p.MensalidadeID]
	s.mu.Unlock()
	if existe && !ja.Pago {
		return ja, nil
	}

	pag, err := s.gw.PagadorPorReferencia(ctx, p.Pagador.ID)
	if err != nil {
		return Resposta{}, err
	}
	if pag == nil {
		novo, err := s.gw.CriarPagador(ctx, asaas.NovoPagador{Nome: p.Pagador.Nome, CpfCnpj: p.Pagador.CpfCnpj, Email: p.Pagador.Email,
			Celular: soDigitos(p.Pagador.Celular), ReferenciaExterna: p.Pagador.ID, NotificacaoDesligada: true})
		if err != nil {
			return Resposta{}, err
		}
		pag = &novo
	}
	desc := p.Descricao
	if desc == "" {
		desc = "Mensalidade do transporte escolar"
	}
	c, err := s.gw.CriarCobranca(ctx, asaas.NovaCobranca{Pagador: pag.ID, Tipo: "PIX", Valor: p.Valor, Vencimento: p.Vencimento,
		Descricao: desc, ReferenciaExterna: p.MensalidadeID})
	if err != nil {
		return Resposta{}, err
	}
	qr, err := s.gw.QRCodePix(ctx, c.ID)
	if err != nil {
		return Resposta{}, err
	}
	r := Resposta{CobrancaID: c.ID, MensalidadeID: p.MensalidadeID, Status: c.Status, Pago: asaas.Pago(c.Status),
		CopiaECola: qr.CopiaECola, QRCodeBase64: qr.ImagemBase64, ExpiraEm: qr.ExpiraEm, Fatura: c.Fatura}
	s.mu.Lock()
	s.cobrancas[p.MensalidadeID] = r
	s.mu.Unlock()
	return r, nil
}

// Situacao consulta o gateway (para quando o webhook atrasar).
func (s *Servico) Situacao(ctx context.Context, cobrancaID string) (Resposta, error) {
	c, err := s.gw.Cobranca(ctx, cobrancaID)
	if err != nil {
		return Resposta{}, err
	}
	return Resposta{CobrancaID: c.ID, MensalidadeID: c.ReferenciaExterna, Status: c.Status, Pago: asaas.Pago(c.Status), Fatura: c.Fatura}, nil
}

// EventoWebhook: o corpo que o Asaas manda.
type EventoWebhook struct {
	ID      string         `json:"id"`
	Evento  string         `json:"event"`
	Criado  string         `json:"dateCreated"`
	Payment asaas.Cobranca `json:"payment"`
}

var ErrNaoAutorizado = errors.New("token do webhook inválido")

// Webhook valida o token, ignora repetidos e, se a mensalidade foi paga, avisa o VanAaki.
// Devolve true quando era um pagamento novo.
func (s *Servico) Webhook(ctx context.Context, token string, ev EventoWebhook) (bool, error) {
	if s.tokenWebhook == "" || token != s.tokenWebhook {
		return false, ErrNaoAutorizado
	}
	if ev.ID == "" {
		return false, fmt.Errorf("%w: evento sem id", ErrInvalido)
	}
	s.mu.Lock()
	if _, visto := s.eventosVistos[ev.ID]; visto {
		s.mu.Unlock()
		return false, nil
	}
	s.eventosVistos[ev.ID] = time.Now()
	s.limparVistos()
	s.mu.Unlock()

	if ev.Evento != "PAYMENT_RECEIVED" && ev.Evento != "PAYMENT_CONFIRMED" {
		return false, nil
	}
	s.mu.Lock()
	if r, ok := s.cobrancas[ev.Payment.ReferenciaExterna]; ok {
		r.Pago, r.Status = true, ev.Payment.Status
		s.cobrancas[ev.Payment.ReferenciaExterna] = r
	}
	s.mu.Unlock()
	aviso := Aviso{MensalidadeID: ev.Payment.ReferenciaExterna, CobrancaID: ev.Payment.ID, Valor: ev.Payment.Valor,
		ValorLiquido: ev.Payment.ValorLiquido, PagoEm: ev.Criado, Evento: ev.Evento}
	log.Printf("pagamento recebido: mensalidade %s (cobrança %s) R$ %.2f", aviso.MensalidadeID, aviso.CobrancaID, aviso.Valor)
	if err := s.avisar(ctx, aviso); err != nil {
		// o VanAaki não recebeu: solta o evento para o reenvio do Asaas (o handler responde erro)
		s.mu.Lock()
		delete(s.eventosVistos, ev.ID)
		s.mu.Unlock()
		return false, err
	}
	return true, nil
}

// avisar manda a baixa para o VanAaki (se configurado). Falhou? Devolve erro: o Asaas tenta de novo.
func (s *Servico) avisar(ctx context.Context, a Aviso) error {
	if s.avisoURL == "" {
		return nil
	}
	b, _ := json.Marshal(a)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.avisoURL, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Pagamentos-Segredo", s.avisoSegredo)
	req.Header.Set("Idempotency-Key", "pag-"+a.CobrancaID)
	resp, err := s.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("VanAaki respondeu %d", resp.StatusCode)
	}
	return nil
}

func (s *Servico) limparVistos() {
	limite := time.Now().Add(-15 * 24 * time.Hour) // o Asaas guarda eventos por 14 dias
	for id, em := range s.eventosVistos {
		if em.Before(limite) {
			delete(s.eventosVistos, id)
		}
	}
}

func soDigitos(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// NovoToken gera um segredo aleatório (para o webhook ou o aviso).
func NovoToken() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
