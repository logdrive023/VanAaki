package http

import (
	"context"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/logdrive023/vanaaki/backend/internal/domains/comunicacao/service"
	"github.com/logdrive023/vanaaki/backend/internal/httpx"
	"github.com/logdrive023/vanaaki/backend/internal/middleware"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

type Router struct{ s service.Service }

func NewRouter(s service.Service) *Router { return &Router{s: s} }

type mensagemReq struct {
	AlunoID string `json:"alunoId"`
	Texto   string `json:"texto"`
}

func (rt *Router) enviar(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, q mensagemReq) (any, error) {
		return nil, rt.s.Enviar(ctx, e, q.AlunoID, q.Texto)
	})
}

func (rt *Router) ler(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, q mensagemReq) (any, error) {
		return nil, rt.s.Ler(ctx, e, q.AlunoID)
	})
}

func (rt *Router) lerNotificacoes(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, _ httpx.Vazio) (any, error) {
		return nil, rt.s.LerNotificacoes(ctx, e)
	})
}

func (rt *Router) Register(api *mux.Router) {
	api.HandleFunc("/notificacoes/lidas", rt.lerNotificacoes).Methods("POST")
	conv := api.NewRoute().Subrouter()
	conv.Use(middleware.Perfis(models.PerfilMotorista, models.PerfilPais))
	conv.HandleFunc("/mensagens", rt.enviar).Methods("POST")
	conv.HandleFunc("/mensagens/lidas", rt.ler).Methods("POST")
}
