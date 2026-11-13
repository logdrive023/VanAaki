package controller

import (
	"context"
	"net/http"
	"strconv"

	"github.com/logdrive023/vanaaki/backend/internal/core"
	"github.com/logdrive023/vanaaki/backend/internal/domains/conformidade/service"
	"github.com/logdrive023/vanaaki/backend/internal/httpx"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

type Controller struct{ s *service.Service }

func New(s *service.Service) *Controller { return &Controller{s: s} }

type AcessoRequest struct {
	Nome string `json:"nome"`
	Dias int    `json:"dias"`
}

func dias(r *http.Request) int { n, _ := strconv.Atoi(httpx.Query(r, "dias")); return n }

func (ct *Controller) Resumo(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, _ httpx.Vazio) (any, error) { return ct.s.Resumo(ctx, e) })
}

func (ct *Controller) Historico(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, _ httpx.Vazio) (any, error) {
		return ct.s.Historico(ctx, e, dias(r))
	})
}

func (ct *Controller) Trajeto(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, _ httpx.Vazio) (any, error) {
		return ct.s.Trajeto(ctx, e, httpx.Param(r, "id"))
	})
}

// CSV devolve a planilha como arquivo (não no formato {sucesso, dados}).
func (ct *Controller) CSV(w http.ResponseWriter, r *http.Request) {
	b, nome, err := ct.s.CSV(r.Context(), httpx.Escopo(r), dias(r))
	if err != nil {
		core.Responder{W: w}.Erro(err)
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+nome+`"`)
	_, _ = w.Write(b)
}

func (ct *Controller) CriarAcesso(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, q AcessoRequest) (any, error) {
		return ct.s.CriarAcesso(ctx, e, q.Nome, q.Dias)
	})
}

func (ct *Controller) Revogar(w http.ResponseWriter, r *http.Request) {
	httpx.Acao(w, r, func(ctx context.Context, e models.Escopo, _ httpx.Vazio) (any, error) {
		return nil, ct.s.Revogar(ctx, e, httpx.Param(r, "token"))
	})
}

// ---------------- públicas (link de fiscalização) ----------------

func (ct *Controller) Fiscal(w http.ResponseWriter, r *http.Request) {
	f, err := ct.s.Fiscal(r.Context(), httpx.Param(r, "token"))
	if err != nil {
		core.Responder{W: w}.Erro(err)
		return
	}
	core.Responder{W: w}.OK(f)
}

func (ct *Controller) FiscalTrajeto(w http.ResponseWriter, r *http.Request) {
	l, err := ct.s.FiscalTrajeto(r.Context(), httpx.Param(r, "token"), httpx.Param(r, "id"))
	if err != nil {
		core.Responder{W: w}.Erro(err)
		return
	}
	core.Responder{W: w}.OK(l)
}
