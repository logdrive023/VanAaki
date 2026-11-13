package http

import (
	"context"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/logdrive023/vanaaki/backend/internal/domains/documentos/service"
	"github.com/logdrive023/vanaaki/backend/internal/httpx"
	"github.com/logdrive023/vanaaki/backend/internal/middleware"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

type Router struct{ s service.Service }

func NewRouter(s service.Service) *Router { return &Router{s: s} }

func (rt *Router) salvar(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, q service.DocumentoRequest) (any, error) {
		return nil, rt.s.Salvar(ctx, e, q)
	})
}

func (rt *Router) excluir(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, _ httpx.Vazio) (any, error) {
		return nil, rt.s.Excluir(ctx, e, httpx.Param(r, "tipo"))
	})
}

func (rt *Router) Register(api *mux.Router) {
	tio := api.NewRoute().Subrouter()
	tio.Use(middleware.Perfis(models.PerfilMotorista))
	tio.HandleFunc("/van/documentos", rt.salvar).Methods("PUT")
	tio.HandleFunc("/van/documentos/{tipo}", rt.excluir).Methods("DELETE")
}
