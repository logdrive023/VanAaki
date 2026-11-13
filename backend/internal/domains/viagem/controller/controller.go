package controller

import (
	"net/http"

	"github.com/logdrive023/vanaaki/backend/internal/core"
	"github.com/logdrive023/vanaaki/backend/internal/domains/viagem/entities"
	"github.com/logdrive023/vanaaki/backend/internal/domains/viagem/service"
	"github.com/logdrive023/vanaaki/backend/internal/httpx"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

type Controller struct{ service service.Service }

func New(s service.Service) *Controller { return &Controller{service: s} }

func (ct *Controller) Iniciar(w http.ResponseWriter, r *http.Request) {
	var req entities.IniciarRequest
	if err := httpx.Bind(r, &req); err != nil {
		core.Responder{W: w}.Erro(err)
		return
	}
	v, err := ct.service.Iniciar(r.Context(), httpx.Escopo(r), req)
	if err != nil {
		core.Responder{W: w}.Erro(err)
		return
	}
	core.Responder{W: w}.Criado(v)
}

func (ct *Controller) MarcarParada(w http.ResponseWriter, r *http.Request) {
	var req entities.ParadaRequest
	if err := httpx.Bind(r, &req); err != nil {
		core.Responder{W: w}.Erro(err)
		return
	}
	responder(w, ct.service.MarcarParada(r.Context(), httpx.Escopo(r), httpx.Param(r, "id"), req.Status))
}

func (ct *Controller) Pronto(w http.ResponseWriter, r *http.Request) {
	var req entities.ProntoRequest
	if err := httpx.Bind(r, &req); err != nil {
		core.Responder{W: w}.Erro(err)
		return
	}
	responder(w, ct.service.MarcarPronto(r.Context(), httpx.Escopo(r), req.AlunoID))
}

func (ct *Controller) Encerrar(w http.ResponseWriter, r *http.Request) {
	responder(w, ct.service.Encerrar(r.Context(), httpx.Escopo(r), httpx.Param(r, "id")))
}

func (ct *Controller) Configurar(w http.ResponseWriter, r *http.Request) {
	var req entities.ConfigurarRequest
	if err := httpx.Bind(r, &req); err != nil {
		core.Responder{W: w}.Erro(err)
		return
	}
	responder(w, ct.service.Configurar(r.Context(), httpx.Escopo(r), httpx.Param(r, "id"), req))
}

func (ct *Controller) Posicao(w http.ResponseWriter, r *http.Request) {
	var req entities.PosicaoRequest
	if err := httpx.Bind(r, &req); err != nil {
		core.Responder{W: w}.Erro(err)
		return
	}
	if req.Lat < -90 || req.Lat > 90 || req.Lng < -180 || req.Lng > 180 {
		core.Responder{W: w}.Erro(core.Invalido("Posição inválida."))
		return
	}
	responder(w, ct.service.Posicao(r.Context(), httpx.Escopo(r), httpx.Param(r, "id"), models.LatLng{Lat: req.Lat, Lng: req.Lng}))
}

func (ct *Controller) Posicoes(w http.ResponseWriter, r *http.Request) {
	var req entities.PosicoesRequest
	if err := httpx.Bind(r, &req); err != nil {
		core.Responder{W: w}.Erro(err)
		return
	}
	responder(w, ct.service.PosicoesLote(r.Context(), httpx.Escopo(r), httpx.Param(r, "id"), req.Pontos))
}

func (ct *Controller) ConfirmarEntrada(w http.ResponseWriter, r *http.Request) {
	var req entities.EntradaRequest
	if err := httpx.Bind(r, &req); err != nil {
		core.Responder{W: w}.Erro(err)
		return
	}
	responder(w, ct.service.ConfirmarEntrada(r.Context(), httpx.Escopo(r), httpx.Param(r, "id"), req.AlunoIDs))
}

func responder(w http.ResponseWriter, err error) {
	if err != nil {
		core.Responder{W: w}.Erro(err)
		return
	}
	core.Responder{W: w}.OK(nil)
}
