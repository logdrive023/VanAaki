package http

import (
	"github.com/gorilla/mux"
	"github.com/logdrive023/vanaaki/backend/internal/domains/van/controller"
	"github.com/logdrive023/vanaaki/backend/internal/middleware"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

type Router struct{ ct *controller.Controller }

func NewRouter(ct *controller.Controller) *Router { return &Router{ct: ct} }

func (rt *Router) Register(api *mux.Router) {
	tio := api.NewRoute().Subrouter()
	tio.Use(middleware.Perfis(models.PerfilMotorista))
	tio.HandleFunc("/van", rt.ct.AtualizarVan).Methods("PUT")
	tio.HandleFunc("/van/turnos", rt.ct.Turnos).Methods("PUT")
	tio.HandleFunc("/van/rota-fixa", rt.ct.RotaFixa).Methods("PUT")
	tio.HandleFunc("/alunos", rt.ct.SalvarAluno).Methods("POST")
	tio.HandleFunc("/alunos/{id}", rt.ct.SalvarAluno).Methods("PUT")
	tio.HandleFunc("/alunos/{id}/ativo", rt.ct.Arquivar).Methods("PUT")

	// pais e tio mudam o combinado do dia
	ambos := api.NewRoute().Subrouter()
	ambos.Use(middleware.Perfis(models.PerfilMotorista, models.PerfilPais))
	ambos.HandleFunc("/presencas", rt.ct.Presenca).Methods("PUT")
}
