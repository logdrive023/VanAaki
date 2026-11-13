package http

import (
	"github.com/gorilla/mux"
	"github.com/logdrive023/vanaaki/backend/internal/domains/conformidade/controller"
	"github.com/logdrive023/vanaaki/backend/internal/middleware"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

// Router: PL 1240/2026 — histórico dos trajetos (motorista) e o link de fiscalização (público).
type Router struct{ ct *controller.Controller }

func NewRouter(ct *controller.Controller) *Router { return &Router{ct: ct} }

func (rt *Router) Register(api *mux.Router) {
	tio := api.NewRoute().Subrouter()
	tio.Use(middleware.Perfis(models.PerfilMotorista))
	tio.HandleFunc("/conformidade", rt.ct.Resumo).Methods("GET")
	tio.HandleFunc("/conformidade/historico", rt.ct.Historico).Methods("GET")
	tio.HandleFunc("/conformidade/historico.csv", rt.ct.CSV).Methods("GET")
	tio.HandleFunc("/conformidade/viagens/{id}/trajeto", rt.ct.Trajeto).Methods("GET")
	tio.HandleFunc("/conformidade/acessos", rt.ct.CriarAcesso).Methods("POST")
	tio.HandleFunc("/conformidade/acessos/{token}", rt.ct.Revogar).Methods("DELETE")
}

// Publicas: o link que o motorista entrega ao poder público (sem login, com limite por IP).
func (rt *Router) Publicas(api *mux.Router) {
	r := api.PathPrefix("/publico/fiscal").Subrouter()
	r.Use(middleware.Limitar(60))
	r.HandleFunc("/{token}", rt.ct.Fiscal).Methods("GET")
	r.HandleFunc("/{token}/viagens/{id}/trajeto", rt.ct.FiscalTrajeto).Methods("GET")
}
