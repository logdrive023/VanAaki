package http

import (
	"context"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/logdrive023/vanaaki/backend/internal/domains/financeiro/service"
	"github.com/logdrive023/vanaaki/backend/internal/httpx"
	"github.com/logdrive023/vanaaki/backend/internal/middleware"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

// Controller + rotas do financeiro (domínio pequeno: ficam juntos).
type Router struct{ s service.Service }

func NewRouter(s service.Service) *Router { return &Router{s: s} }

type pagarReq struct {
	Metodo string `json:"metodo"`
}
type cobrancasReq struct {
	Mes string `json:"mes"`
}

func (rt *Router) pagar(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, q pagarReq) (any, error) {
		return nil, rt.s.Pagar(ctx, e, httpx.Param(r, "id"), q.Metodo)
	})
}

func (rt *Router) desfazer(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, _ httpx.Vazio) (any, error) {
		return nil, rt.s.Desfazer(ctx, e, httpx.Param(r, "id"))
	})
}

func (rt *Router) gerar(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, q cobrancasReq) (any, error) {
		n, err := rt.s.GerarCobrancas(ctx, e, q.Mes)
		return map[string]int{"criadas": n}, err
	})
}

func (rt *Router) Register(api *mux.Router) {
	ambos := api.NewRoute().Subrouter()
	ambos.Use(middleware.Perfis(models.PerfilMotorista, models.PerfilPais))
	ambos.HandleFunc("/pagamentos/{id}/pagar", rt.pagar).Methods("POST")

	tio := api.NewRoute().Subrouter()
	tio.Use(middleware.Perfis(models.PerfilMotorista))
	tio.HandleFunc("/pagamentos/{id}/desfazer", rt.desfazer).Methods("POST")
	tio.HandleFunc("/pagamentos/gerar", rt.gerar).Methods("POST")
}
