// Package service — conversa entre a família e o tio (por aluno) e as notificações lidas.
package service

import (
	"context"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/avisos"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/repositorio"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/transmissao"
	"github.com/logdrive023/vanaaki/backend/internal/core"
	"github.com/logdrive023/vanaaki/backend/internal/models"
	"github.com/logdrive023/vanaaki/backend/internal/realtime"
)

type Service interface {
	Enviar(ctx context.Context, e models.Escopo, alunoID, texto string) error
	Ler(ctx context.Context, e models.Escopo, alunoID string) error
	LerNotificacoes(ctx context.Context, e models.Escopo) error
}

type service struct {
	repo *repositorio.Repo
	av   *avisos.Avisos
	tx   *transmissao.T
	hub  *realtime.Hub
}

func New(r *repositorio.Repo, av *avisos.Avisos, tx *transmissao.T, h *realtime.Hub) Service {
	return &service{repo: r, av: av, tx: tx, hub: h}
}

// lado = de quem é a mensagem (pais | motorista), conferindo o acesso ao aluno.
func (s *service) lado(ctx context.Context, e models.Escopo, alunoID string) (string, models.Aluno, error) {
	a, err := s.repo.Aluno(ctx, alunoID)
	if err != nil {
		return "", a, err
	}
	switch {
	case e.Usuario.Perfil == models.PerfilMotorista && e.TemVan(a.VanID):
		return "motorista", a, nil
	case e.Usuario.Perfil == models.PerfilPais && e.TemAluno(a.ID):
		return "pais", a, nil
	}
	return "", a, core.ErrProibido
}

func (s *service) Enviar(ctx context.Context, e models.Escopo, alunoID, texto string) error {
	t := strings.TrimSpace(texto)
	if t == "" {
		return core.Invalido("Escreva a mensagem.")
	}
	if utf8.RuneCountInString(t) > 1000 {
		return core.Invalido("Mensagem muito grande.")
	}
	de, a, err := s.lado(ctx, e, alunoID)
	if err != nil {
		return err
	}
	if err := s.repo.InserirMensagem(ctx, models.Mensagem{ID: uuid.NewString(), AlunoID: a.ID, De: de, Texto: t, CriadoEm: models.AgoraIso()}); err != nil {
		return err
	}
	resumo := t
	if utf8.RuneCountInString(resumo) > 90 {
		resumo = string([]rune(resumo)[:90]) + "…"
	}
	if de == "pais" {
		_ = s.av.Motorista(ctx, a.VanID, "💬", "Mensagem de "+a.Responsavel, resumo)
	} else {
		_ = s.av.Pais(ctx, a.ID, "💬", "Mensagem do tio", resumo)
	}
	s.tx.Van(ctx, a.VanID)
	return nil
}

func (s *service) Ler(ctx context.Context, e models.Escopo, alunoID string) error {
	de, a, err := s.lado(ctx, e, alunoID)
	if err != nil {
		return err
	}
	outra := "pais"
	if de == "pais" {
		outra = "motorista"
	}
	if err := s.repo.LerMensagens(ctx, alunoID, outra); err != nil {
		return err
	}
	s.tx.Van(ctx, a.VanID)
	return nil
}

func (s *service) LerNotificacoes(ctx context.Context, e models.Escopo) error {
	if err := s.repo.MarcarNotificacoesLidas(ctx, string(e.Usuario.Perfil), e.AlunoIDs, vansDoPerfil(e), e.EscolaID); err != nil {
		return err
	}
	s.hub.Sincronizar(realtime.Alvo{VanID: firstOr(e.VanIDs), EscolaIDs: []string{e.EscolaID}, AlunoIDs: e.AlunoIDs})
	return nil
}

// só o tio recebe notificação "da van"; a família recebe pelas crianças
func vansDoPerfil(e models.Escopo) []string {
	if e.Usuario.Perfil == models.PerfilMotorista {
		return e.VanIDs
	}
	return []string{}
}

func firstOr(l []string) string {
	if len(l) > 0 {
		return l[0]
	}
	return ""
}
