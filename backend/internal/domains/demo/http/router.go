package http

import (
	"net/http"

	"github.com/gorilla/mux"
	"github.com/logdrive023/vanaaki/backend/internal/core"
	"github.com/logdrive023/vanaaki/backend/internal/domains/demo/service"
	"github.com/logdrive023/vanaaki/backend/internal/middleware"
)

type Router struct{ s *service.Service }

func NewRouter(s *service.Service) *Router { return &Router{s: s} }

func (rt *Router) restaurar(w http.ResponseWriter, r *http.Request) {
	if err := rt.s.Restaurar(r.Context()); err != nil {
		core.Responder{W: w}.Erro(err)
		return
	}
	core.Responder{W: w}.OK(nil)
}

func (rt *Router) contas(w http.ResponseWriter, _ *http.Request) {
	core.Responder{W: w}.OK(map[string]any{"senha": service.SenhaDemo, "contas": service.Contas, "codigoAluno": "LUQUI1", "codigoFamilia": "LUCAS1", "codigoEscola": "SMARIA"})
}

// Publicas (só com DEMO=true): restaurar os dados de exemplo e ver as contas de teste.
func (rt *Router) Publicas(api *mux.Router) {
	r := api.PathPrefix("/demo").Subrouter()
	r.Use(middleware.Limitar(10))
	r.HandleFunc("/restaurar", rt.restaurar).Methods("POST")
	r.HandleFunc("/contas", rt.contas).Methods("GET")
}
