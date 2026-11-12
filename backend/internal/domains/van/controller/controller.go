package controller

import (
	"context"
	"net/http"

	"github.com/logdrive023/vanaaki/backend/internal/domains/van/entities"
	"github.com/logdrive023/vanaaki/backend/internal/domains/van/service"
	"github.com/logdrive023/vanaaki/backend/internal/httpx"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

type Controller struct{ s service.Service }

func New(s service.Service) *Controller { return &Controller{s: s} }

func (ct *Controller) AtualizarVan(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, q entities.VanRequest) (any, error) { return ct.s.AtualizarVan(ctx, e, q) })
}

func (ct *Controller) Turnos(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, q entities.TurnosRequest) (any, error) {
		return ct.s.AtualizarTurnos(ctx, e, q)
	})
}

func (ct *Controller) RotaFixa(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, q entities.RotaFixaRequest) (any, error) { return nil, ct.s.RotaFixa(ctx, e, q) })
}

func (ct *Controller) SalvarAluno(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, a models.Aluno) (any, error) {
		if id := httpx.Param(r, "id"); id != "" {
			a.ID = id
		}
		return ct.s.SalvarAluno(ctx, e, a)
	})
}

func (ct *Controller) Arquivar(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, q entities.ArquivarRequest) (any, error) {
		return nil, ct.s.Arquivar(ctx, e, httpx.Param(r, "id"), q.Ativo)
	})
}

func (ct *Controller) Presenca(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, q entities.PresencaRequest) (any, error) { return nil, ct.s.DefinirPresenca(ctx, e, q) })
}
