package http

import (
	"context"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/logdrive023/vanaaki/backend/internal/domains/gamificacao/service"
	"github.com/logdrive023/vanaaki/backend/internal/httpx"
	"github.com/logdrive023/vanaaki/backend/internal/middleware"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

type Router struct{ s service.Service }

func NewRouter(s service.Service) *Router { return &Router{s: s} }

type pontosReq struct {
	AlunoID    string `json:"alunoId"`
	Tipo       string `json:"tipo"`
	Observacao string `json:"observacao"`
}
type resgatarReq struct {
	AlunoID      string `json:"alunoId"`
	RecompensaID string `json:"recompensaId"`
}
type decidirReq struct {
	Aprovar bool `json:"aprovar"`
}

func (rt *Router) pontos(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, q pontosReq) (any, error) {
		return nil, rt.s.DarPontos(ctx, e, q.AlunoID, q.Tipo, q.Observacao)
	})
}

func (rt *Router) recompensa(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, q models.Recompensa) (any, error) {
		if id := httpx.Param(r, "id"); id != "" {
			q.ID = id
		}
		return rt.s.SalvarRecompensa(ctx, e, q)
	})
}

func (rt *Router) resgatar(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, q resgatarReq) (any, error) {
		return nil, rt.s.Resgatar(ctx, e, q.AlunoID, q.RecompensaID)
	})
}

func (rt *Router) decidir(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, q decidirReq) (any, error) {
		return nil, rt.s.Decidir(ctx, e, httpx.Param(r, "id"), q.Aprovar)
	})
}

func (rt *Router) Register(api *mux.Router) {
	tio := api.NewRoute().Subrouter()
	tio.Use(middleware.Perfis(models.PerfilMotorista))
	tio.HandleFunc("/pontos", rt.pontos).Methods("POST")
	tio.HandleFunc("/recompensas", rt.recompensa).Methods("POST")
	tio.HandleFunc("/recompensas/{id}", rt.recompensa).Methods("PUT")
	tio.HandleFunc("/resgates/{id}/decidir", rt.decidir).Methods("POST")

	familia := api.NewRoute().Subrouter()
	familia.Use(middleware.Perfis(models.PerfilAluno, models.PerfilPais))
	familia.HandleFunc("/resgates", rt.resgatar).Methods("POST")
}
