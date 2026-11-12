package controller

import (
	"context"
	"net/http"

	"github.com/logdrive023/vanaaki/backend/internal/domains/escola/service"
	"github.com/logdrive023/vanaaki/backend/internal/httpx"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

type Controller struct{ s service.Service }

func New(s service.Service) *Controller { return &Controller{s: s} }

type confirmaReq struct {
	Confirma bool `json:"confirma"`
}

type credenciarReq struct {
	VanID    string `json:"vanId"`
	Situacao string `json:"situacao"`
}

func (ct *Controller) Salvar(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, q service.EscolaRequest) (any, error) {
		return ct.s.Salvar(ctx, e, httpx.Param(r, "id"), q)
	})
}

func (ct *Controller) ConfirmaEntrada(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, q confirmaReq) (any, error) {
		return nil, ct.s.ConfirmaEntrada(ctx, e, q.Confirma)
	})
}

func (ct *Controller) Credenciar(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, q credenciarReq) (any, error) {
		return nil, ct.s.Credenciar(ctx, e, q.VanID, q.Situacao)
	})
}
