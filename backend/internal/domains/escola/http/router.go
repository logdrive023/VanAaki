package http

import (
	"github.com/gorilla/mux"
	"github.com/logdrive023/vanaaki/backend/internal/domains/escola/controller"
	"github.com/logdrive023/vanaaki/backend/internal/middleware"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

type Router struct{ ct *controller.Controller }

func NewRouter(ct *controller.Controller) *Router { return &Router{ct: ct} }

func (rt *Router) Register(api *mux.Router) {
	tio := api.NewRoute().Subrouter()
	tio.Use(middleware.Perfis(models.PerfilMotorista))
	tio.HandleFunc("/escolas", rt.ct.Salvar).Methods("POST")

	ambos := api.NewRoute().Subrouter()
	ambos.Use(middleware.Perfis(models.PerfilMotorista, models.PerfilEscola))
	ambos.HandleFunc("/escolas/{id}", rt.ct.Salvar).Methods("PUT")

	escola := api.NewRoute().Subrouter()
	escola.Use(middleware.Perfis(models.PerfilEscola))
	escola.HandleFunc("/escola/confirma-entrada", rt.ct.ConfirmaEntrada).Methods("PUT")
	escola.HandleFunc("/escola/credenciar", rt.ct.Credenciar).Methods("PUT")
}
