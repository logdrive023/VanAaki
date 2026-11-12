// Package server monta o roteador HTTP (gorilla/mux) com os middlewares e as rotas dos domínios.
package server

import (
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/logdrive023/vanaaki/backend/internal/container"
	"github.com/logdrive023/vanaaki/backend/internal/core"
	"github.com/logdrive023/vanaaki/backend/internal/middleware"
)

func New(c *container.Container) *http.Server {
	r := mux.NewRouter()
	r.Use(middleware.Recuperar, middleware.Log, middleware.CORS(c.Cfg.Origens))

	r.HandleFunc("/saude", func(w http.ResponseWriter, _ *http.Request) {
		core.Responder{W: w}.OK(map[string]any{"ok": true, "conectados": c.Hub.Conectados(), "demo": c.Cfg.Demo})
	}).Methods("GET")

	api := r.PathPrefix("/api").Subrouter()
	c.ContaRouter.Publicas(api)
	if c.Cfg.Demo {
		c.DemoRouter.Publicas(api)
	}

	protegida := api.NewRoute().Subrouter()
	protegida.Use(middleware.Autenticar(c.Tokens, c.Conta))
	for _, d := range c.Protegidas {
		d.Register(protegida)
	}

	// pré-flight do CORS e 404 com o mesmo formato de resposta
	r.Methods("OPTIONS").HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	r.NotFoundHandler = middleware.CORS(c.Cfg.Origens)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		core.Responder{W: w}.Erro(core.ErrNaoEncontrado)
	}))
	r.MethodNotAllowedHandler = r.NotFoundHandler

	return &http.Server{
		Addr:              ":" + c.Cfg.Porta,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		// sem WriteTimeout: o SSE (/api/eventos) fica aberto
		IdleTimeout: 120 * time.Second,
	}
}
