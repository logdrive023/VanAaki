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
	// recados entre o tio e a escola
	EnviarRecado(ctx context.Context, e models.Escopo, vanID, escolaID, texto string) error
	LerRecados(ctx context.Context, e models.Escopo, vanID, escolaID string) error
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

// ---------------- recados tio ↔ escola ----------------

// conversaRecado confere quem está falando: o tio (com uma escola que ele atende) ou a escola (com uma van dela).
func (s *service) conversaRecado(ctx context.Context, e models.Escopo, vanID, escolaID string) (de string, van models.Van, escola models.Escola, err error) {
	switch e.Usuario.Perfil {
	case models.PerfilMotorista:
		if len(e.VanIDs) == 0 {
			return "", van, escola, core.ErrProibido
		}
		vanID, de = e.VanIDs[0], "motorista"
	case models.PerfilEscola:
		escolaID, de = e.EscolaID, "escola"
	default:
		return "", van, escola, core.ErrProibido
	}
	if van, err = s.repo.Van(ctx, vanID); err != nil {
		return "", van, escola, err
	}
	if escola, err = s.repo.Escola(ctx, escolaID); err != nil {
		return "", van, escola, err
	}
	if !models.Contem(van.EscolaIDs, escolaID) {
		return "", van, escola, core.Invalido("Esta van não atende esta escola.")
	}
	return de, van, escola, nil
}

func (s *service) EnviarRecado(ctx context.Context, e models.Escopo, vanID, escolaID, texto string) error {
	t := strings.TrimSpace(texto)
	if t == "" {
		return core.Invalido("Escreva o recado.")
	}
	if utf8.RuneCountInString(t) > 600 {
		return core.Invalido("Recado muito grande.")
	}
	de, van, escola, err := s.conversaRecado(ctx, e, vanID, escolaID)
	if err != nil {
		return err
	}
	if err := s.repo.InserirRecado(ctx, models.Recado{ID: uuid.NewString(), VanID: van.ID, EscolaID: escola.ID, De: de, Texto: t, CriadoEm: models.AgoraIso()}); err != nil {
		return err
	}
	resumo := t
	if utf8.RuneCountInString(resumo) > 90 {
		resumo = string([]rune(resumo)[:90]) + "…"
	}
	if de == "motorista" {
		_ = s.av.Escola(ctx, escola.ID, "💬", "Recado de "+van.Motorista, resumo)
	} else {
		_ = s.av.Motorista(ctx, van.ID, "🏫", "Recado de "+escola.Nome, resumo)
	}
	s.tx.Van(ctx, van.ID)
	return nil
}

func (s *service) LerRecados(ctx context.Context, e models.Escopo, vanID, escolaID string) error {
	de, van, escola, err := s.conversaRecado(ctx, e, vanID, escolaID)
	if err != nil {
		return err
	}
	outro := "escola"
	if de == "escola" {
		outro = "motorista"
	}
	if err := s.repo.LerRecados(ctx, van.ID, escola.ID, outro); err != nil {
		return err
	}
	s.tx.Van(ctx, van.ID)
	return nil
}
