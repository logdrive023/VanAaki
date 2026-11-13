package cobranca

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func pedido() Pedido {
	var p Pedido
	p.MensalidadeID, p.Valor, p.Vencimento = "mens-lucas-2026-12", 420, "2026-12-10"
	p.Pagador.ID, p.Pagador.Nome, p.Pagador.CpfCnpj = "resp-rafael", "Rafael Andrade", "123.456.789-09"
	return p
}

func TestCobrarValidaECriaUmaVezSo(t *testing.T) {
	ctx := context.Background()
	g := NovoSimulado()
	s := Novo(g, "tok", "", "")

	ruim := pedido()
	ruim.Pagador.CpfCnpj = "123"
	if _, err := s.Cobrar(ctx, ruim); !errors.Is(err, ErrInvalido) {
		t.Fatalf("CPF curto deveria ser recusado: %v", err)
	}
	r1, err := s.Cobrar(ctx, pedido())
	if err != nil || r1.CobrancaID == "" || r1.CopiaECola == "" || r1.Pago {
		t.Fatalf("cobrança: %+v %v", r1, err)
	}
	r2, _ := s.Cobrar(ctx, pedido())
	if r2.CobrancaID != r1.CobrancaID {
		t.Fatal("a mesma mensalidade não pode gerar duas cobranças")
	}
	if len(g.pagadores) != 1 {
		t.Fatalf("pagador duplicado: %d", len(g.pagadores))
	}
}

func TestWebhookTokenRepeticaoEAviso(t *testing.T) {
	ctx := context.Background()
	var avisos atomic.Int32
	var falhar atomic.Bool
	vanaaki := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Pagamentos-Segredo") != "seg" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if falhar.Load() {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		var a Aviso
		_ = json.NewDecoder(r.Body).Decode(&a)
		if a.MensalidadeID != "mens-lucas-2026-12" {
			t.Errorf("aviso sem a mensalidade: %+v", a)
		}
		avisos.Add(1)
	}))
	defer vanaaki.Close()

	g := NovoSimulado()
	s := Novo(g, "tok", vanaaki.URL, "seg")
	r, _ := s.Cobrar(ctx, pedido())
	ev, _ := g.Pagar(r.CobrancaID)

	if _, err := s.Webhook(ctx, "outro", ev); !errors.Is(err, ErrNaoAutorizado) {
		t.Fatalf("token errado deveria ser recusado: %v", err)
	}
	// VanAaki fora do ar: erro (o Asaas reenvia) e o evento fica livre para o reenvio
	falhar.Store(true)
	if _, err := s.Webhook(ctx, "tok", ev); err == nil {
		t.Fatal("aviso que falhou deveria devolver erro")
	}
	falhar.Store(false)
	novo, err := s.Webhook(ctx, "tok", ev)
	if err != nil || !novo {
		t.Fatalf("reenvio deveria avisar: %v %v", novo, err)
	}
	// o Asaas entrega "pelo menos uma vez": o repetido não avisa de novo
	if novo, _ := s.Webhook(ctx, "tok", ev); novo {
		t.Fatal("evento repetido avisou duas vezes")
	}
	if avisos.Load() != 1 {
		t.Fatalf("avisos = %d, esperado 1", avisos.Load())
	}
	if sit, _ := s.Situacao(ctx, r.CobrancaID); !sit.Pago {
		t.Fatal("cobrança deveria constar como paga")
	}
	// evento que não é pagamento é aceito e ignorado
	if novo, err := s.Webhook(ctx, "tok", EventoWebhook{ID: "evt_x", Evento: "PAYMENT_OVERDUE"}); err != nil || novo {
		t.Fatalf("evento de vencimento: %v %v", novo, err)
	}
}
