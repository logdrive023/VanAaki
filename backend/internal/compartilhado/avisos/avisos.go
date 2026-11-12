// Package avisos grava as notificações e os pontos (que também avisam a família).
package avisos

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/regras"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/repositorio"
	"github.com/logdrive023/vanaaki/backend/internal/core"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

type Avisos struct{ repo *repositorio.Repo }

func New(r *repositorio.Repo) *Avisos { return &Avisos{repo: r} }

// Notificar grava a notificação; cada perfil vê só as suas.
func (a *Avisos) Notificar(ctx context.Context, n models.Notificacao) error {
	n.ID, n.CriadoEm, n.Lida = uuid.NewString(), models.AgoraIso(), false
	return a.repo.InserirNotificacao(ctx, n)
}

func (a *Avisos) Pais(ctx context.Context, alunoID, icone, titulo, texto string) error {
	return a.Notificar(ctx, models.Notificacao{Para: "pais", AlunoID: alunoID, Icone: icone, Titulo: titulo, Texto: texto})
}

func (a *Avisos) Aluno(ctx context.Context, alunoID, icone, titulo, texto string) error {
	return a.Notificar(ctx, models.Notificacao{Para: "aluno", AlunoID: alunoID, Icone: icone, Titulo: titulo, Texto: texto})
}

func (a *Avisos) Motorista(ctx context.Context, vanID, icone, titulo, texto string) error {
	return a.Notificar(ctx, models.Notificacao{Para: "motorista", VanID: vanID, Icone: icone, Titulo: titulo, Texto: texto})
}

func (a *Avisos) Escola(ctx context.Context, escolaID, icone, titulo, texto string) error {
	return a.Notificar(ctx, models.Notificacao{Para: "escola", EscolaID: escolaID, Icone: icone, Titulo: titulo, Texto: texto})
}

// Familia manda para os pais e (se soPais=false) para o aluno.
func (a *Avisos) Familia(ctx context.Context, alunoID, icone, titulo, texto string, soPais bool) error {
	if err := a.Pais(ctx, alunoID, icone, titulo, texto); err != nil {
		return err
	}
	if soPais {
		return nil
	}
	return a.Aluno(ctx, alunoID, icone, titulo, texto)
}

// DarPontos registra pontos (positivos ou negativos). idFixo evita repetir o automático do dia.
// Ocorrência avisa os pais na hora.
func (a *Avisos) DarPontos(ctx context.Context, al models.Aluno, tipo, autor, obs, idFixo string) error {
	t := regras.TipoDe(tipo)
	if t == nil {
		return core.Invalido("Tipo de ponto desconhecido.")
	}
	id := idFixo
	if id == "" {
		id = uuid.NewString()
	}
	novo, err := a.repo.InserirPontos(ctx, models.EventoPontos{
		ID: id, AlunoID: al.ID, VanID: al.VanID, Data: models.Hoje(), CriadoEm: models.AgoraIso(),
		Tipo: tipo, Pontos: t.Pontos, Descricao: t.Nome, Observacao: obs, Autor: autor,
	})
	if err != nil || !novo {
		return err
	}
	nome := regras.PrimeiroNome(al.Nome)
	pts := fmt.Sprintf("%+d pontos", t.Pontos)
	comObs := ""
	if obs != "" {
		comObs = fmt.Sprintf(" · \"%s\"", obs)
	}
	switch {
	case t.Grupo == "ocorrencia":
		if err := a.Pais(ctx, al.ID, t.Icone, "Ocorrência na van: "+t.Nome, nome+" · "+pts+comObs); err != nil {
			return err
		}
		return a.Aluno(ctx, al.ID, t.Icone, "O tio registrou: "+t.Nome, pts+". Bora recuperar amanhã! 💪")
	case t.Grupo == "elogio":
		return a.Familia(ctx, al.ID, t.Icone, "Elogio do tio: "+t.Nome, nome+" ganhou "+pts+comObs, false)
	case t.Pontos > 0:
		return a.Aluno(ctx, al.ID, t.Icone, t.Nome+"!", "Você ganhou "+pts+" ⭐")
	}
	return nil
}
