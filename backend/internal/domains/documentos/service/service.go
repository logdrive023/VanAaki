// Package service — documentos do condutor e do veículo (CTB arts. 136 a 138) com validade:
// o tio cadastra, a escola confere antes de credenciar, a família vê "documentos em dia",
// e o app avisa 30 dias, 7 dias e no dia do vencimento (vencido: avisa também as escolas).
package service

import (
	"context"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/avisos"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/repositorio"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/transmissao"
	"github.com/logdrive023/vanaaki/backend/internal/core"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

type DocumentoRequest struct {
	Tipo     string `json:"tipo"`
	Numero   string `json:"numero"`
	Validade string `json:"validade"`
}

type Service interface {
	Salvar(ctx context.Context, e models.Escopo, req DocumentoRequest) error
	Excluir(ctx context.Context, e models.Escopo, tipo string) error
	// Avisar roda uma vez por dia: avisa o que está para vencer ou venceu (cada marco uma vez só).
	Avisar(ctx context.Context) (int, error)
}

type service struct {
	repo *repositorio.Repo
	av   *avisos.Avisos
	tx   *transmissao.T
}

func New(r *repositorio.Repo, av *avisos.Avisos, tx *transmissao.T) Service {
	return &service{repo: r, av: av, tx: tx}
}

func (s *service) minhaVan(e models.Escopo) (string, error) {
	if e.Usuario.Perfil != models.PerfilMotorista || len(e.VanIDs) == 0 {
		return "", core.ErrProibido
	}
	return e.VanIDs[0], nil
}

func (s *service) avisarMudanca(ctx context.Context, vanID string) {
	s.tx.Van(ctx, vanID)
	if v, err := s.repo.Van(ctx, vanID); err == nil {
		for _, id := range v.EscolaIDs {
			s.tx.Escola(ctx, id)
		}
	}
}

func (s *service) Salvar(ctx context.Context, e models.Escopo, req DocumentoRequest) error {
	vanID, err := s.minhaVan(e)
	if err != nil {
		return err
	}
	if _, ok := models.TiposDocumento[req.Tipo]; !ok {
		return core.Invalido("Tipo de documento inválido.")
	}
	if _, err := time.ParseInLocation("2006-01-02", req.Validade, models.Fuso); err != nil {
		return core.Invalido("Informe a data de validade.")
	}
	numero := strings.TrimSpace(req.Numero)
	if utf8.RuneCountInString(numero) > 40 {
		return core.Invalido("Número muito grande.")
	}
	if err := s.repo.SalvarDocumento(ctx, models.Documento{ID: uuid.NewString(), VanID: vanID, Tipo: req.Tipo, Numero: numero, Validade: req.Validade}); err != nil {
		return err
	}
	s.avisarMudanca(ctx, vanID)
	return nil
}

func (s *service) Excluir(ctx context.Context, e models.Escopo, tipo string) error {
	vanID, err := s.minhaVan(e)
	if err != nil {
		return err
	}
	if err := s.repo.ExcluirDocumento(ctx, vanID, tipo); err != nil {
		return err
	}
	s.avisarMudanca(ctx, vanID)
	return nil
}

var ordemMarco = map[string]int{"": 0, "30": 1, "7": 2, "0": 3, "vencido": 4}

// Marco = em que ponto do vencimento o documento está (dias = validade - hoje).
func Marco(dias int) string {
	switch {
	case dias < 0:
		return "vencido"
	case dias == 0:
		return "0"
	case dias <= 7:
		return "7"
	case dias <= 30:
		return "30"
	}
	return ""
}

func (s *service) Avisar(ctx context.Context) (int, error) {
	hoje, _ := time.ParseInLocation("2006-01-02", models.Hoje(), models.Fuso)
	docs, err := s.repo.DocumentosAte(ctx, hoje.AddDate(0, 0, 30).Format("2006-01-02"))
	if err != nil {
		return 0, err
	}
	n := 0
	for _, d := range docs {
		val, err := time.ParseInLocation("2006-01-02", d.Validade, models.Fuso)
		if err != nil {
			continue
		}
		dias := int(val.Sub(hoje).Hours() / 24)
		marco := Marco(dias)
		if marco == "" || ordemMarco[marco] <= ordemMarco[d.Avisado] {
			continue
		}
		nome := models.TiposDocumento[d.Tipo]
		quando := map[string]string{"30": "vence em " + strconv.Itoa(dias) + " dias", "7": "vence em " + strconv.Itoa(dias) + " dia(s)", "0": "vence hoje", "vencido": "venceu"}[marco]
		_ = s.av.Motorista(ctx, d.VanID, "📄", nome+" "+quando, "Atualize em Mais → Documentos para a escola continuar vendo tudo em dia.")
		if marco == "vencido" {
			if v, err := s.repo.Van(ctx, d.VanID); err == nil {
				for _, esc := range v.EscolaIDs {
					if v.Credenciamento[esc] == "credenciada" {
						_ = s.av.Escola(ctx, esc, "📄", "Documento vencido: "+v.Nome, nome+" venceu em "+val.Format("02/01/2006")+".")
					}
				}
			}
		}
		_ = s.repo.MarcarDocumentoAvisado(ctx, d.ID, marco)
		s.avisarMudanca(ctx, d.VanID)
		n++
	}
	return n, nil
}
