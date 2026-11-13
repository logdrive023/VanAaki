package http

import (
	"context"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/logdrive023/vanaaki/backend/internal/domains/privacidade/service"
	"github.com/logdrive023/vanaaki/backend/internal/httpx"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

type Router struct{ s service.Service }

func NewRouter(s service.Service) *Router { return &Router{s: s} }

type consentimentoReq struct {
	Versao string `json:"versao"`
}

func (rt *Router) consentir(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, q consentimentoReq) (any, error) {
		return nil, rt.s.Consentir(ctx, e, q.Versao)
	})
}

func (rt *Router) meusDados(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, _ httpx.Vazio) (any, error) { return rt.s.MeusDados(ctx, e) })
}

func (rt *Router) excluir(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, _ httpx.Vazio) (any, error) {
		return nil, rt.s.ExcluirConta(ctx, e)
	})
}

// Register: qualquer perfil logado (cada um só mexe na própria conta).
func (rt *Router) Register(api *mux.Router) {
	api.HandleFunc("/privacidade/consentimento", rt.consentir).Methods("POST")
	api.HandleFunc("/privacidade/meus-dados", rt.meusDados).Methods("GET")
	api.HandleFunc("/privacidade/conta", rt.excluir).Methods("DELETE")
}
