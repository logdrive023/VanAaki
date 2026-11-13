// Package container monta as dependências (repositório → services → controllers → rotas).
package container

import (
	"database/sql"

	"github.com/gorilla/mux"
	"github.com/logdrive023/vanaaki/backend/internal/authentication"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/avisos"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/repositorio"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/transmissao"
	"github.com/logdrive023/vanaaki/backend/internal/config"
	conformidadectl "github.com/logdrive023/vanaaki/backend/internal/domains/conformidade/controller"
	conformidadehttp "github.com/logdrive023/vanaaki/backend/internal/domains/conformidade/http"
	conformidadesvc "github.com/logdrive023/vanaaki/backend/internal/domains/conformidade/service"
	comunicacaohttp "github.com/logdrive023/vanaaki/backend/internal/domains/comunicacao/http"
	comunicacaosvc "github.com/logdrive023/vanaaki/backend/internal/domains/comunicacao/service"
	contactl "github.com/logdrive023/vanaaki/backend/internal/domains/conta/controller"
	contahttp "github.com/logdrive023/vanaaki/backend/internal/domains/conta/http"
	contasvc "github.com/logdrive023/vanaaki/backend/internal/domains/conta/service"
	demohttp "github.com/logdrive023/vanaaki/backend/internal/domains/demo/http"
	demosvc "github.com/logdrive023/vanaaki/backend/internal/domains/demo/service"
	escolactl "github.com/logdrive023/vanaaki/backend/internal/domains/escola/controller"
	escolahttp "github.com/logdrive023/vanaaki/backend/internal/domains/escola/http"
	escolasvc "github.com/logdrive023/vanaaki/backend/internal/domains/escola/service"
	financeirohttp "github.com/logdrive023/vanaaki/backend/internal/domains/financeiro/http"
	financeirosvc "github.com/logdrive023/vanaaki/backend/internal/domains/financeiro/service"
	gamificacaohttp "github.com/logdrive023/vanaaki/backend/internal/domains/gamificacao/http"
	gamificacaosvc "github.com/logdrive023/vanaaki/backend/internal/domains/gamificacao/service"
	synchttp "github.com/logdrive023/vanaaki/backend/internal/domains/sincronizacao/http"
	syncsvc "github.com/logdrive023/vanaaki/backend/internal/domains/sincronizacao/service"
	vanctl "github.com/logdrive023/vanaaki/backend/internal/domains/van/controller"
	vanhttp "github.com/logdrive023/vanaaki/backend/internal/domains/van/http"
	vansvc "github.com/logdrive023/vanaaki/backend/internal/domains/van/service"
	viagemctl "github.com/logdrive023/vanaaki/backend/internal/domains/viagem/controller"
	viagemhttp "github.com/logdrive023/vanaaki/backend/internal/domains/viagem/http"
	viagemsvc "github.com/logdrive023/vanaaki/backend/internal/domains/viagem/service"
	"github.com/logdrive023/vanaaki/backend/internal/realtime"
	"github.com/logdrive023/vanaaki/backend/pkg/osrm"
)

// Registravel = domínio com rotas protegidas (precisam de login).
type Registravel interface{ Register(api *mux.Router) }

type Container struct {
	Cfg     config.Config
	Hub     *realtime.Hub
	Tokens  *authentication.Tokens
	Conta   contasvc.Service
	Viagens viagemsvc.Service
	Demo    *demosvc.Service
	// PL 1240/2026: histórico dos trajetos e link de fiscalização
	Conformidade *conformidadesvc.Service

	FiscalRouter *conformidadehttp.Router

	ContaRouter *contahttp.Router
	DemoRouter  *demohttp.Router
	Protegidas  []Registravel
}

func New(cfg config.Config, db *sql.DB) *Container {
	repo := repositorio.New(db)
	hub := realtime.New()
	tx := transmissao.New(repo, hub)
	av := avisos.New(repo)
	tokens := authentication.New(cfg.JWTSegredo)
	rotas := osrm.New(cfg.OSRM)

	conta := contasvc.New(repo, tokens, av, tx, cfg.Demo)
	viagens := viagemsvc.New(repo, av, tx, rotas)
	van := vansvc.New(repo, av, tx, viagens)
	demo := demosvc.New(repo, tx)
	conformidade := conformidadesvc.New(repo)
	fiscal := conformidadehttp.NewRouter(conformidadectl.New(conformidade))

	return &Container{
		Cfg: cfg, Hub: hub, Tokens: tokens, Conta: conta, Viagens: viagens, Demo: demo, Conformidade: conformidade, FiscalRouter: fiscal,
		ContaRouter: contahttp.NewRouter(contactl.New(conta)),
		DemoRouter:  demohttp.NewRouter(demo),
		Protegidas: []Registravel{
			contahttp.NewRouter(contactl.New(conta)),
			synchttp.NewRouter(syncsvc.New(repo, tx), hub, cfg.Nominatim),
			viagemhttp.NewRouter(viagemctl.New(viagens)),
			vanhttp.NewRouter(vanctl.New(van)),
			escolahttp.NewRouter(escolactl.New(escolasvc.New(repo, av, tx))),
			financeirohttp.NewRouter(financeirosvc.New(repo, av, tx)),
			comunicacaohttp.NewRouter(comunicacaosvc.New(repo, av, tx, hub)),
			gamificacaohttp.NewRouter(gamificacaosvc.New(repo, av, tx)),
			fiscal,
		},
	}
}
