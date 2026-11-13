// Serviço de pagamentos do VanAaki (Asaas): mensalidade → cobrança Pix → baixa automática pelo webhook.
//
//	cd pagamentos && go run ./cmd/servidor        (sem ASAAS_API_KEY roda em modo simulado)
package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/logdrive023/vanaaki/pagamentos/asaas"
	"github.com/logdrive023/vanaaki/pagamentos/cobranca"
)

func main() {
	carregarEnv(".env")
	chave := os.Getenv("ASAAS_API_KEY")
	token := os.Getenv("ASAAS_WEBHOOK_TOKEN")
	porta := valor(os.Getenv("PORTA"), "8095")

	var gw cobranca.Gateway
	sim := (*cobranca.Simulado)(nil)
	if chave == "" {
		sim = cobranca.NovoSimulado()
		gw = sim
		log.Print("MODO SIMULADO (sem ASAAS_API_KEY): nenhum dinheiro de verdade")
		if token == "" {
			token = cobranca.NovoToken()
			log.Printf("token do webhook gerado para esta execução: %s", token)
		}
	} else {
		amb := valor(os.Getenv("ASAAS_AMBIENTE"), "sandbox")
		gw = asaas.Novo(chave, amb)
		if token == "" {
			log.Fatal("defina ASAAS_WEBHOOK_TOKEN (o mesmo cadastrado no webhook do painel do Asaas)")
		}
		log.Printf("Asaas: ambiente %s", amb)
	}
	s := cobranca.Novo(gw, token, os.Getenv("VANAAKI_AVISO_URL"), os.Getenv("VANAAKI_AVISO_SEGREDO"))

	mux := http.NewServeMux()
	mux.HandleFunc("GET /saude", func(w http.ResponseWriter, _ *http.Request) {
		responder(w, http.StatusOK, map[string]any{"ok": true, "simulado": sim != nil})
	})
	// o VanAaki pede a cobrança Pix de uma mensalidade
	mux.HandleFunc("POST /cobrancas", func(w http.ResponseWriter, r *http.Request) {
		var p cobranca.Pedido
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&p); err != nil {
			erro(w, http.StatusBadRequest, "JSON inválido")
			return
		}
		resp, err := s.Cobrar(r.Context(), p)
		if err != nil {
			erroDe(w, err)
			return
		}
		responder(w, http.StatusOK, resp)
	})
	mux.HandleFunc("GET /cobrancas/{id}", func(w http.ResponseWriter, r *http.Request) {
		resp, err := s.Situacao(r.Context(), r.PathValue("id"))
		if err != nil {
			erroDe(w, err)
			return
		}
		responder(w, http.StatusOK, resp)
	})
	// o Asaas avisa: pago, vencido, estornado…
	mux.HandleFunc("POST /webhooks/asaas", func(w http.ResponseWriter, r *http.Request) {
		var ev cobranca.EventoWebhook
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&ev); err != nil {
			erro(w, http.StatusBadRequest, "JSON inválido")
			return
		}
		if _, err := s.Webhook(r.Context(), r.Header.Get("asaas-access-token"), ev); err != nil {
			erroDe(w, err)
			return
		}
		responder(w, http.StatusOK, map[string]bool{"recebido": true})
	})
	// só no modo simulado: "a família pagou"
	if sim != nil {
		mux.HandleFunc("POST /simulado/pagar/{id}", func(w http.ResponseWriter, r *http.Request) {
			ev, err := sim.Pagar(r.PathValue("id"))
			if err != nil {
				erroDe(w, err)
				return
			}
			novo, err := s.Webhook(r.Context(), token, ev)
			if err != nil {
				erroDe(w, err)
				return
			}
			responder(w, http.StatusOK, map[string]any{"pago": true, "avisado": novo})
		})
	}
	log.Printf("pagamentos ouvindo em :%s", porta)
	log.Fatal(http.ListenAndServe(":"+porta, mux))
}

func responder(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func erro(w http.ResponseWriter, status int, msg string) {
	responder(w, status, map[string]string{"erro": msg})
}

func erroDe(w http.ResponseWriter, err error) {
	var ea *asaas.Erro
	switch {
	case errors.Is(err, cobranca.ErrNaoAutorizado):
		erro(w, http.StatusUnauthorized, err.Error())
	case errors.Is(err, cobranca.ErrInvalido):
		erro(w, http.StatusBadRequest, err.Error())
	case errors.As(err, &ea) && ea.Status < 500:
		erro(w, ea.Status, ea.Descricao)
	default:
		log.Printf("erro: %v", err)
		erro(w, http.StatusBadGateway, "o gateway de pagamento não respondeu, tente de novo")
	}
}

func valor(v, padrao string) string {
	if v == "" {
		return padrao
	}
	return v
}

// carregarEnv lê CHAVE=valor de um arquivo .env (se existir), sem sobrescrever o ambiente.
func carregarEnv(caminho string) {
	f, err := os.Open(caminho)
	if err != nil {
		return
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		l := strings.TrimSpace(sc.Text())
		if l == "" || strings.HasPrefix(l, "#") {
			continue
		}
		k, v, ok := strings.Cut(l, "=")
		if ok && os.Getenv(strings.TrimSpace(k)) == "" {
			_ = os.Setenv(strings.TrimSpace(k), strings.Trim(strings.TrimSpace(v), `"`))
		}
	}
}
