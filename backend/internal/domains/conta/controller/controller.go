package controller

import (
	"net/http"

	"github.com/logdrive023/vanaaki/backend/internal/core"
	"github.com/logdrive023/vanaaki/backend/internal/domains/conta/entities"
	"github.com/logdrive023/vanaaki/backend/internal/domains/conta/service"
	"github.com/logdrive023/vanaaki/backend/internal/httpx"
)

type Controller struct{ service service.Service }

func New(s service.Service) *Controller { return &Controller{service: s} }

// sessao lê o corpo em req, chama f e responde a sessão (token + usuário).
func sessao[T any](w http.ResponseWriter, r *http.Request, f func(T) (entities.Sessao, error)) {
	var req T
	if err := httpx.Bind(r, &req); err != nil {
		core.Responder{W: w}.Erro(err)
		return
	}
	s, err := f(req)
	if err != nil {
		core.Responder{W: w}.Erro(err)
		return
	}
	core.Responder{W: w}.OK(s)
}

func (ct *Controller) Entrar(w http.ResponseWriter, r *http.Request) {
	sessao(w, r, func(q entities.EntrarRequest) (entities.Sessao, error) { return ct.service.Entrar(r.Context(), q) })
}

func (ct *Controller) CadastroMotorista(w http.ResponseWriter, r *http.Request) {
	sessao(w, r, func(q entities.CadastroMotoristaRequest) (entities.Sessao, error) {
		return ct.service.CadastroMotorista(r.Context(), q)
	})
}

func (ct *Controller) CadastroFamilia(w http.ResponseWriter, r *http.Request) {
	sessao(w, r, func(q entities.CadastroComCodigoRequest) (entities.Sessao, error) {
		return ct.service.CadastroFamilia(r.Context(), q)
	})
}

func (ct *Controller) CadastroEscola(w http.ResponseWriter, r *http.Request) {
	sessao(w, r, func(q entities.CadastroComCodigoRequest) (entities.Sessao, error) {
		return ct.service.CadastroEscola(r.Context(), q)
	})
}

func (ct *Controller) EntrarAluno(w http.ResponseWriter, r *http.Request) {
	sessao(w, r, func(q entities.CodigoRequest) (entities.Sessao, error) {
		return ct.service.EntrarAluno(r.Context(), q.Codigo)
	})
}

func (ct *Controller) Demo(w http.ResponseWriter, r *http.Request) {
	sessao(w, r, func(q entities.DemoRequest) (entities.Sessao, error) { return ct.service.Demo(r.Context(), q.Perfil) })
}

func (ct *Controller) VincularFilho(w http.ResponseWriter, r *http.Request) {
	var q entities.CodigoRequest
	if err := httpx.Bind(r, &q); err != nil {
		core.Responder{W: w}.Erro(err)
		return
	}
	if err := ct.service.VincularFilho(r.Context(), httpx.Escopo(r), q.Codigo); err != nil {
		core.Responder{W: w}.Erro(err)
		return
	}
	core.Responder{W: w}.OK(nil)
}

func (ct *Controller) Eu(w http.ResponseWriter, r *http.Request) {
	core.Responder{W: w}.OK(httpx.Escopo(r).Usuario)
}
