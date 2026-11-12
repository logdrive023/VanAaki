// Package service — escolas: o tio cadastra as escolas que atende (com os horários de cada turno);
// a escola, se quiser, cria o acesso da portaria com o código e cuida do credenciamento e da confirmação de entrada.
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
	contasvc "github.com/logdrive023/vanaaki/backend/internal/domains/conta/service"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

type EscolaRequest struct {
	Nome     string                          `json:"nome"`
	Endereco string                          `json:"endereco"`
	Local    models.LatLng                   `json:"local"`
	Horarios map[models.Turno]models.Horario `json:"horarios"`
}

type Service interface {
	Salvar(ctx context.Context, e models.Escopo, id string, req EscolaRequest) (models.Escola, error)
	ConfirmaEntrada(ctx context.Context, e models.Escopo, confirma bool) error
	Credenciar(ctx context.Context, e models.Escopo, vanID, situacao string) error
}

type service struct {
	repo *repositorio.Repo
	av   *avisos.Avisos
	tx   *transmissao.T
}

func New(r *repositorio.Repo, av *avisos.Avisos, tx *transmissao.T) Service {
	return &service{repo: r, av: av, tx: tx}
}

func validar(req EscolaRequest) error {
	if strings.TrimSpace(req.Nome) == "" {
		return core.Invalido("Informe o nome da escola.")
	}
	if req.Local.Lat == 0 && req.Local.Lng == 0 {
		return core.Invalido("Marque a escola no mapa.")
	}
	if len(req.Horarios) == 0 {
		return core.Invalido("Informe o horário de pelo menos um turno.")
	}
	for t, h := range req.Horarios {
		if !t.Valido() || regras.Minutos(h.Entrada) >= regras.Minutos(h.Saida) || regras.Minutos(h.Saida) > 24*60 {
			return core.Invalido("Horário inválido no turno da " + strings.ToLower(models.NomeTurno[t]) + ".")
		}
	}
	return nil
}

// Salvar: id vazio cria (só o tio); com id edita (o tio de uma van que atende a escola, ou a própria escola).
func (s *service) Salvar(ctx context.Context, e models.Escopo, id string, req EscolaRequest) (models.Escola, error) {
	if err := validar(req); err != nil {
		return models.Escola{}, err
	}
	var esc models.Escola
	if id == "" {
		if e.Usuario.Perfil != models.PerfilMotorista {
			return esc, core.ErrProibido
		}
		esc = models.Escola{ID: uuid.NewString(), Codigo: contasvc.Codigo(6)}
	} else {
		var err error
		if esc, err = s.repo.Escola(ctx, id); err != nil {
			return esc, err
		}
		pode := e.Usuario.Perfil == models.PerfilEscola && e.EscolaID == id
		if e.Usuario.Perfil == models.PerfilMotorista {
			van, err := s.repo.Van(ctx, e.VanIDs[0])
			pode = err == nil && models.Contem(van.EscolaIDs, id)
		}
		if !pode {
			return esc, core.ErrProibido
		}
	}
	esc.Nome, esc.Endereco, esc.Local, esc.Horarios = strings.TrimSpace(req.Nome), strings.TrimSpace(req.Endereco), req.Local, req.Horarios
	if err := s.repo.SalvarEscola(ctx, esc); err != nil {
		return esc, err
	}
	s.tx.Escola(ctx, esc.ID)
	if e.Usuario.Perfil == models.PerfilMotorista {
		s.tx.Van(ctx, e.VanIDs[0])
	}
	return esc, nil
}

func (s *service) ConfirmaEntrada(ctx context.Context, e models.Escopo, confirma bool) error {
	esc, err := s.repo.Escola(ctx, e.EscolaID)
	if err != nil {
		return err
	}
	esc.ConfirmaEntrada = confirma
	if err := s.repo.SalvarEscola(ctx, esc); err != nil {
		return err
	}
	s.tx.Escola(ctx, esc.ID)
	return nil
}

func (s *service) Credenciar(ctx context.Context, e models.Escopo, vanID, situacao string) error {
	if situacao != "credenciada" && situacao != "suspensa" && situacao != "pendente" {
		return core.Invalido("Situação inválida.")
	}
	v, err := s.repo.Van(ctx, vanID)
	if err != nil {
		return err
	}
	if _, ok := v.Credenciamento[e.EscolaID]; !ok {
		return core.ErrProibido
	}
	v.Credenciamento[e.EscolaID] = situacao
	if err := s.repo.SalvarVan(ctx, v, false); err != nil {
		return err
	}
	esc, _ := s.repo.Escola(ctx, e.EscolaID)
	txt := map[string]string{"credenciada": "credenciou a sua van ✅", "suspensa": "suspendeu o credenciamento", "pendente": "voltou o credenciamento para análise"}[situacao]
	_ = s.av.Motorista(ctx, vanID, "🏫", esc.Nome+" "+txt, "")
	s.tx.Van(ctx, vanID)
	s.tx.Escola(ctx, e.EscolaID)
	return nil
}
