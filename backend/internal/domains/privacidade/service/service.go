// Package service — LGPD na prática: registro do consentimento (art. 8º e art. 14, dados de crianças),
// cópia dos meus dados (art. 18, II e V) e exclusão da conta (art. 18, VI).
package service

import (
	"context"

	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/avisos"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/regras"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/repositorio"
	"github.com/logdrive023/vanaaki/backend/internal/core"
	syncsvc "github.com/logdrive023/vanaaki/backend/internal/domains/sincronizacao/service"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

// VersaoPolitica muda quando a Política de Privacidade muda: todos aceitam de novo (o app pede sozinho).
const VersaoPolitica = "2026-11-13"

type MeusDados struct {
	GeradoEm       string                 `json:"geradoEm"`
	VersaoPolitica string                 `json:"versaoPolitica"`
	Conta          models.Usuario         `json:"conta"`
	Consentimentos []models.Consentimento `json:"consentimentos"`
	Dados          syncsvc.Pacote         `json:"dados"`
}

type Service interface {
	Consentir(ctx context.Context, e models.Escopo, versao string) error
	MeusDados(ctx context.Context, e models.Escopo) (MeusDados, error)
	ExcluirConta(ctx context.Context, e models.Escopo) error
}

type service struct {
	repo *repositorio.Repo
	av   *avisos.Avisos
	sync syncsvc.Service
}

func New(r *repositorio.Repo, av *avisos.Avisos, s syncsvc.Service) Service {
	return &service{repo: r, av: av, sync: s}
}

func (s *service) Consentir(ctx context.Context, e models.Escopo, versao string) error {
	if versao != VersaoPolitica {
		return core.Invalido("A política mudou. Atualize o app e leia a versão nova.")
	}
	return s.repo.Consentir(ctx, e.Usuario.ID, versao)
}

func (s *service) MeusDados(ctx context.Context, e models.Escopo) (MeusDados, error) {
	p, err := s.sync.Pacote(ctx, e)
	if err != nil {
		return MeusDados{}, err
	}
	if e.Usuario.Perfil == models.PerfilPais || e.Usuario.Perfil == models.PerfilAluno {
		// só o que é desta família: os colegas (apelido e pontos do ranking) não entram na cópia
		var al []models.Aluno
		for _, a := range p.Alunos {
			if e.TemAluno(a.ID) {
				al = append(al, a)
			}
		}
		var pts []models.EventoPontos
		for _, x := range p.Pontos {
			if e.TemAluno(x.AlunoID) {
				pts = append(pts, x)
			}
		}
		p.Alunos, p.Pontos = al, pts
	}
	cons, err := s.repo.Consentimentos(ctx, e.Usuario.ID)
	if err != nil {
		return MeusDados{}, err
	}
	return MeusDados{GeradoEm: models.AgoraIso(), VersaoPolitica: VersaoPolitica, Conta: e.Usuario, Consentimentos: cons, Dados: p}, nil
}

func (s *service) ExcluirConta(ctx context.Context, e models.Escopo) error {
	if e.Usuario.Demo {
		return core.Invalido("Na demonstração não dá para excluir a conta.")
	}
	switch e.Usuario.Perfil {
	case models.PerfilMotorista, models.PerfilEscola:
		// a conta guarda dados de outras famílias e trajetos que precisam ficar pelo prazo legal
		return core.Invalido("Esta conta guarda dados de outras famílias. Peça a exclusão pelo contato de privacidade: respondemos em até 15 dias.")
	case models.PerfilPais:
		for _, id := range e.AlunoIDs {
			if a, err := s.repo.Aluno(ctx, id); err == nil {
				_ = s.av.Motorista(ctx, a.VanID, "🔒", "Família saiu do app", "A família de "+regras.PrimeiroNome(a.Nome)+" excluiu a conta. O cadastro do aluno continua com você.")
			}
		}
	}
	return s.repo.ExcluirUsuario(ctx, e.Usuario.ID)
}
