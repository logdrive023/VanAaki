// Package service — gamificação: elogios e ocorrências do tio, loja de prêmios e pedidos dos alunos.
package service

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/avisos"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/regras"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/repositorio"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/transmissao"
	"github.com/logdrive023/vanaaki/backend/internal/core"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

type Service interface {
	DarPontos(ctx context.Context, e models.Escopo, alunoID, tipo, obs string) error
	SalvarRecompensa(ctx context.Context, e models.Escopo, r models.Recompensa) (models.Recompensa, error)
	Resgatar(ctx context.Context, e models.Escopo, alunoID, recompensaID string) error
	Decidir(ctx context.Context, e models.Escopo, resgateID string, aprovar bool) error
}

type service struct {
	repo *repositorio.Repo
	av   *avisos.Avisos
	tx   *transmissao.T
}

func New(r *repositorio.Repo, av *avisos.Avisos, tx *transmissao.T) Service {
	return &service{repo: r, av: av, tx: tx}
}

func (s *service) DarPontos(ctx context.Context, e models.Escopo, alunoID, tipo, obs string) error {
	t := regras.TipoDe(tipo)
	if t == nil || t.Grupo == "auto" {
		return core.Invalido("Escolha um elogio ou uma ocorrência.")
	}
	a, err := s.repo.Aluno(ctx, alunoID)
	if err != nil {
		return err
	}
	if !e.TemVan(a.VanID) {
		return core.ErrProibido
	}
	obs = strings.TrimSpace(obs)
	if len([]rune(obs)) > 200 {
		obs = string([]rune(obs)[:200])
	}
	if err := s.av.DarPontos(ctx, a, tipo, "motorista", obs, ""); err != nil {
		return err
	}
	s.tx.Van(ctx, a.VanID)
	return nil
}

func (s *service) SalvarRecompensa(ctx context.Context, e models.Escopo, r models.Recompensa) (models.Recompensa, error) {
	r.Nome = strings.TrimSpace(r.Nome)
	if r.Nome == "" {
		return r, core.Invalido("Dê um nome ao prêmio.")
	}
	if r.Custo < 5 {
		r.Custo = 5
	}
	if r.Icone == "" {
		r.Icone = "🎉"
	}
	if r.ID == "" {
		r.ID, r.Ativo = uuid.NewString(), true
	} else if atual, err := s.repo.Recompensa(ctx, r.ID); err != nil || atual.VanID != e.VanIDs[0] {
		return r, core.ErrProibido
	}
	r.VanID = e.VanIDs[0]
	if err := s.repo.SalvarRecompensa(ctx, r); err != nil {
		return r, err
	}
	s.tx.Van(ctx, r.VanID)
	return r, nil
}

// Resgatar: o aluno (ou os pais) pede um prêmio; precisa ter saldo.
func (s *service) Resgatar(ctx context.Context, e models.Escopo, alunoID, recompensaID string) error {
	if !e.TemAluno(alunoID) {
		return core.ErrProibido
	}
	a, err := s.repo.Aluno(ctx, alunoID)
	if err != nil {
		return err
	}
	r, err := s.repo.Recompensa(ctx, recompensaID)
	if err != nil || r.VanID != a.VanID || !r.Ativo {
		return core.Invalido("Prêmio indisponível.")
	}
	ev, err := s.repo.PontosDosAlunos(ctx, []string{a.ID})
	if err != nil {
		return err
	}
	rs, err := s.repo.Resgates(ctx, []string{a.ID})
	if err != nil {
		return err
	}
	if regras.SaldoDe(ev, rs) < r.Custo {
		return core.Invalido("Ainda faltam pontos para esse prêmio.")
	}
	if err := s.repo.SalvarResgate(ctx, models.Resgate{ID: uuid.NewString(), AlunoID: a.ID, RecompensaID: r.ID, Nome: r.Nome, Icone: r.Icone,
		Custo: r.Custo, Status: "pendente", CriadoEm: models.AgoraIso()}); err != nil {
		return err
	}
	_ = s.av.Motorista(ctx, a.VanID, "🎁", "Pedido de prêmio", regras.PrimeiroNome(a.Nome)+" quer \""+r.Nome+"\" ("+itoa(r.Custo)+" ⭐)")
	s.tx.Van(ctx, a.VanID)
	return nil
}

func (s *service) Decidir(ctx context.Context, e models.Escopo, resgateID string, aprovar bool) error {
	x, err := s.repo.Resgate(ctx, resgateID)
	if err != nil {
		return err
	}
	a, err := s.repo.Aluno(ctx, x.AlunoID)
	if err != nil || !e.TemVan(a.VanID) {
		return core.ErrProibido
	}
	if x.Status != "pendente" {
		return nil
	}
	x.Status, x.DecididoEm = "recusado", models.AgoraIso()
	ic, tit, txt := "😕", "Prêmio recusado: "+x.Nome, "Os pontos voltaram para o seu saldo."
	if aprovar {
		x.Status, ic, tit, txt = "aprovado", "🎉", "Prêmio aprovado: "+x.Nome, "Combine com o tio quando vai usar!"
	}
	if err := s.repo.SalvarResgate(ctx, x); err != nil {
		return err
	}
	_ = s.av.Familia(ctx, a.ID, ic, tit, txt, false)
	s.tx.Van(ctx, a.VanID)
	return nil
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	s := ""
	for ; n > 0; n /= 10 {
		s = string(rune('0'+n%10)) + s
	}
	return s
}
