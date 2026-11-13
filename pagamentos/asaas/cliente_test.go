package asaas

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCobrancaPixContraServidorFalso(t *testing.T) {
	var corpo NovaCobranca
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("access_token") != "chave-teste" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if r.Header.Get("User-Agent") == "" {
			t.Error("User-Agent é obrigatório no Asaas")
		}
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v3/payments":
			_ = json.NewDecoder(r.Body).Decode(&corpo)
			_, _ = w.Write([]byte(`{"id":"pay_1","status":"PENDING","value":420,"externalReference":"mens-1"}`))
		case r.Method == http.MethodGet && r.URL.Path == "/v3/payments/pay_1/pixQrCode":
			_, _ = w.Write([]byte(`{"encodedImage":"aW1n","payload":"000201...","expirationDate":"2026-12-10 23:59:59"}`))
		case r.URL.Path == "/v3/customers" && r.URL.Query().Get("externalReference") == "resp 1":
			_, _ = w.Write([]byte(`{"data":[{"id":"cus_9","name":"Ana","externalReference":"resp 1"}]}`))
		default:
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"errors":[{"code":"invalid","description":"O campo cpfCnpj é obrigatório"}]}`))
		}
	}))
	defer srv.Close()
	c := NovoComURL("chave-teste", srv.URL)
	ctx := context.Background()

	cob, err := c.CriarCobranca(ctx, NovaCobranca{Pagador: "cus_9", Tipo: "PIX", Valor: 420, Vencimento: "2026-12-10", ReferenciaExterna: "mens-1"})
	if err != nil || cob.ID != "pay_1" || cob.Status != "PENDING" {
		t.Fatalf("cobrança: %+v %v", cob, err)
	}
	if corpo.Tipo != "PIX" || corpo.Valor != 420 || corpo.ReferenciaExterna != "mens-1" {
		t.Fatalf("corpo enviado errado: %+v", corpo)
	}
	qr, err := c.QRCodePix(ctx, "pay_1")
	if err != nil || qr.CopiaECola != "000201..." || qr.ImagemBase64 != "aW1n" {
		t.Fatalf("qr: %+v %v", qr, err)
	}
	p, err := c.PagadorPorReferencia(ctx, "resp 1") // espaço precisa ir escapado na URL
	if err != nil || p == nil || p.ID != "cus_9" {
		t.Fatalf("pagador por referência: %+v %v", p, err)
	}
	_, err = c.CriarPagador(ctx, NovoPagador{Nome: "Sem CPF"})
	if e, ok := err.(*Erro); !ok || e.Status != 400 || e.Descricao != "O campo cpfCnpj é obrigatório" {
		t.Fatalf("erro do Asaas não foi lido: %v", err)
	}
	if _, err := NovoComURL("errada", srv.URL).Cobranca(ctx, "pay_1"); err == nil {
		t.Fatal("chave errada deveria falhar")
	}
}

func TestPago(t *testing.T) {
	for st, quer := range map[string]bool{"RECEIVED": true, "CONFIRMED": true, "RECEIVED_IN_CASH": true, "PENDING": false, "OVERDUE": false, "REFUNDED": false} {
		if Pago(st) != quer {
			t.Errorf("Pago(%s) = %v", st, !quer)
		}
	}
}
