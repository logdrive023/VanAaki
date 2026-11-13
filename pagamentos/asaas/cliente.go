// Package asaas é um cliente mínimo da API v3 do Asaas (https://docs.asaas.com):
// cliente, cobrança Pix, QR Code e consulta. Só a biblioteca padrão.
package asaas

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	URLSandbox  = "https://api-sandbox.asaas.com"
	URLProducao = "https://api.asaas.com"
)

type Cliente struct {
	base  string
	chave string
	http  *http.Client
}

// Novo: ambiente "producao" usa a API real; qualquer outro valor, o sandbox.
func Novo(chave, ambiente string) *Cliente {
	base := URLSandbox
	if ambiente == "producao" {
		base = URLProducao
	}
	return NovoComURL(chave, base)
}

// NovoComURL serve para testes (aponta para um servidor falso).
func NovoComURL(chave, base string) *Cliente {
	return &Cliente{base: strings.TrimRight(base, "/"), chave: chave, http: &http.Client{Timeout: 20 * time.Second}}
}

// Erro devolvido pelo Asaas ({"errors":[{"code","description"}]}).
type Erro struct {
	Status    int
	Descricao string
}

func (e *Erro) Error() string { return fmt.Sprintf("asaas %d: %s", e.Status, e.Descricao) }

func (c *Cliente) chamar(ctx context.Context, metodo, caminho string, corpo, saida any) error {
	var r io.Reader
	if corpo != nil {
		b, err := json.Marshal(corpo)
		if err != nil {
			return err
		}
		r = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, metodo, c.base+caminho, r)
	if err != nil {
		return err
	}
	req.Header.Set("access_token", c.chave)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "VanAaki-Pagamentos/1.0")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		var e struct {
			Errors []struct{ Description string } `json:"errors"`
		}
		_ = json.Unmarshal(b, &e)
		d := strings.TrimSpace(string(b))
		if len(e.Errors) > 0 {
			d = e.Errors[0].Description
		}
		return &Erro{Status: resp.StatusCode, Descricao: d}
	}
	if saida == nil {
		return nil
	}
	return json.Unmarshal(b, saida)
}

// ---------------- clientes (quem paga) ----------------

type NovoPagador struct {
	Nome                 string `json:"name"`
	CpfCnpj              string `json:"cpfCnpj"`
	Email                string `json:"email,omitempty"`
	Celular              string `json:"mobilePhone,omitempty"`
	ReferenciaExterna    string `json:"externalReference,omitempty"`
	NotificacaoDesligada bool   `json:"notificationDisabled"`
}

type Pagador struct {
	ID                string `json:"id"`
	Nome              string `json:"name"`
	ReferenciaExterna string `json:"externalReference"`
}

func (c *Cliente) CriarPagador(ctx context.Context, p NovoPagador) (Pagador, error) {
	var out Pagador
	return out, c.chamar(ctx, http.MethodPost, "/v3/customers", p, &out)
}

// PagadorPorReferencia busca pelo id do nosso sistema (o Asaas aceita clientes duplicados: evitamos isso aqui).
func (c *Cliente) PagadorPorReferencia(ctx context.Context, ref string) (*Pagador, error) {
	var out struct {
		Data []Pagador `json:"data"`
	}
	if err := c.chamar(ctx, http.MethodGet, "/v3/customers?externalReference="+url.QueryEscape(ref), nil, &out); err != nil {
		return nil, err
	}
	if len(out.Data) == 0 {
		return nil, nil
	}
	return &out.Data[0], nil
}

// ---------------- cobranças ----------------

type Split struct {
	WalletID        string  `json:"walletId"`
	ValorFixo       float64 `json:"fixedValue,omitempty"`
	ValorPercentual float64 `json:"percentualValue,omitempty"`
}

type NovaCobranca struct {
	Pagador           string  `json:"customer"`
	Tipo              string  `json:"billingType"` // PIX | BOLETO | UNDEFINED
	Valor             float64 `json:"value"`
	Vencimento        string  `json:"dueDate"` // AAAA-MM-DD
	Descricao         string  `json:"description,omitempty"`
	ReferenciaExterna string  `json:"externalReference,omitempty"`
	Split             []Split `json:"split,omitempty"`
}

type Cobranca struct {
	ID                string  `json:"id"`
	Status            string  `json:"status"` // PENDING, RECEIVED, CONFIRMED, OVERDUE…
	Valor             float64 `json:"value"`
	ValorLiquido      float64 `json:"netValue"`
	Vencimento        string  `json:"dueDate"`
	ReferenciaExterna string  `json:"externalReference"`
	Fatura            string  `json:"invoiceUrl"`
}

func (c *Cliente) CriarCobranca(ctx context.Context, n NovaCobranca) (Cobranca, error) {
	var out Cobranca
	return out, c.chamar(ctx, http.MethodPost, "/v3/payments", n, &out)
}

func (c *Cliente) Cobranca(ctx context.Context, id string) (Cobranca, error) {
	var out Cobranca
	return out, c.chamar(ctx, http.MethodGet, "/v3/payments/"+url.PathEscape(id), nil, &out)
}

// QRCodePix: imagem (base64), copia e cola e validade.
type QRCodePix struct {
	ImagemBase64 string `json:"encodedImage"`
	CopiaECola   string `json:"payload"`
	ExpiraEm     string `json:"expirationDate"`
}

func (c *Cliente) QRCodePix(ctx context.Context, cobrancaID string) (QRCodePix, error) {
	var out QRCodePix
	return out, c.chamar(ctx, http.MethodGet, "/v3/payments/"+url.PathEscape(cobrancaID)+"/pixQrCode", nil, &out)
}

// Pago = status que significa dinheiro recebido.
func Pago(status string) bool {
	return status == "RECEIVED" || status == "CONFIRMED" || status == "RECEIVED_IN_CASH"
}
