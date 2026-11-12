package http

import (
	"github.com/gorilla/mux"
	"github.com/logdrive023/vanaaki/backend/internal/domains/conta/controller"
	"github.com/logdrive023/vanaaki/backend/internal/middleware"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

type Router struct{ ct *controller.Controller }

func NewRouter(ct *controller.Controller) *Router { return &Router{ct: ct} }

// Publicas = login e cadastros (com limite de tentativas por IP).
func (rt *Router) Publicas(api *mux.Router) {
	r := api.PathPrefix("/auth").Subrouter()
	r.Use(middleware.Limitar(30))
	r.HandleFunc("/entrar", rt.ct.Entrar).Methods("POST")
	r.HandleFunc("/aluno", rt.ct.EntrarAluno).Methods("POST")
	r.HandleFunc("/cadastro/motorista", rt.ct.CadastroMotorista).Methods("POST")
	r.HandleFunc("/cadastro/familia", rt.ct.CadastroFamilia).Methods("POST")
	r.HandleFunc("/cadastro/escola", rt.ct.CadastroEscola).Methods("POST")
	r.HandleFunc("/demo", rt.ct.Demo).Methods("POST")
}

func (rt *Router) Register(api *mux.Router) {
	api.HandleFunc("/eu", rt.ct.Eu).Methods("GET")
	pais := api.NewRoute().Subrouter()
	pais.Use(middleware.Perfis(models.PerfilPais))
	pais.HandleFunc("/familia/vincular", rt.ct.VincularFilho).Methods("POST")
}
