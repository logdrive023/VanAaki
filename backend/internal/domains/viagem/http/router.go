package http

import (
	"github.com/gorilla/mux"
	"github.com/logdrive023/vanaaki/backend/internal/domains/viagem/controller"
	"github.com/logdrive023/vanaaki/backend/internal/middleware"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

// Router: rotas da viagem (o tio dirige; o aluno avisa que está no portão; a escola confirma a entrada).
type Router struct{ ct *controller.Controller }

func NewRouter(ct *controller.Controller) *Router { return &Router{ct: ct} }

func (rt *Router) Register(api *mux.Router) {
	tio := api.NewRoute().Subrouter()
	tio.Use(middleware.Perfis(models.PerfilMotorista))
	tio.HandleFunc("/viagens", rt.ct.Iniciar).Methods("POST")
	tio.HandleFunc("/viagens/{id}/parada", rt.ct.MarcarParada).Methods("POST")
	tio.HandleFunc("/viagens/{id}/encerrar", rt.ct.Encerrar).Methods("POST")
	tio.HandleFunc("/viagens/{id}/config", rt.ct.Configurar).Methods("PATCH")
	tio.HandleFunc("/viagens/{id}/posicao", rt.ct.Posicao).Methods("POST")

	familia := api.NewRoute().Subrouter()
	familia.Use(middleware.Perfis(models.PerfilAluno, models.PerfilPais))
	familia.HandleFunc("/viagens/pronto", rt.ct.Pronto).Methods("POST")

	escola := api.NewRoute().Subrouter()
	escola.Use(middleware.Perfis(models.PerfilEscola))
	escola.HandleFunc("/viagens/{id}/entrada", rt.ct.ConfirmarEntrada).Methods("POST")
}
