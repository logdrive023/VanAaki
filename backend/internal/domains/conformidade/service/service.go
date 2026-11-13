// Package service — conformidade com o PL 1240/2026 (GPS obrigatório no transporte escolar):
//
//   - histórico dos trajetos (posição + horário) guardado por pelo menos 90 dias;
//   - relatório e exportação (CSV) para o motorista apresentar na fiscalização;
//   - link somente leitura para o poder público acompanhar a van e consultar o histórico.
//
// O poder público vê a van, os trajetos e quantos alunos foram levados, nunca nome ou endereço de criança (LGPD).
package service

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base32"
	"encoding/csv"
	"fmt"
	"strings"
	"time"

	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/repositorio"
	"github.com/logdrive023/vanaaki/backend/internal/core"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

// DiasHistorico = período mínimo que o PL pede para guardar os trajetos.
const DiasHistorico = 90

// DiasGuarda = quanto o VanAaki guarda de fato (folga sobre os 90 dias).
const DiasGuarda = 400

type Service struct{ repo *repositorio.Repo }

func New(r *repositorio.Repo) *Service { return &Service{repo: r} }

// Resumo = o "selo" de conformidade da van, para a tela do motorista.
type Resumo struct {
	DiasHistorico   int                   `json:"diasHistorico"`
	DiasGuarda      int                   `json:"diasGuarda"`
	Viagens         int                   `json:"viagens"`
	ViagensComGPS   int                   `json:"viagensComGps"`
	Pontos          int                   `json:"pontos"`
	Km              float64               `json:"km"`
	UltimaPosicaoEm string                `json:"ultimaPosicaoEm,omitempty"`
	PrimeiraViagem  string                `json:"primeiraViagem,omitempty"`
	Acessos         []models.AcessoFiscal `json:"acessos"`
}

// Fiscal = o que o poder público vê pelo link.
type Fiscal struct {
	EmitidoEm string              `json:"emitidoEm"`
	Acesso    models.AcessoFiscal `json:"acesso"`
	Van       struct {
		Nome      string  `json:"nome"`
		Motorista string  `json:"motorista"`
		Telefone  string  `json:"telefone"`
		Placa     string  `json:"placa"`
		Modelo    string  `json:"modelo"`
		Avaliacao float64 `json:"avaliacao"`
	} `json:"van"`
	Escolas       []EscolaFiscal        `json:"escolas"`
	AoVivo        *AoVivo               `json:"aoVivo"`
	Historico     []models.ResumoViagem `json:"historico"`
	DiasHistorico int                   `json:"diasHistorico"`
}

type EscolaFiscal struct {
	Nome           string   `json:"nome"`
	Endereco       string   `json:"endereco"`
	Credenciamento string   `json:"credenciamento"`
	Turnos         []string `json:"turnos"`
}

// AoVivo = a viagem em andamento agora (posição atual e quantos alunos a bordo).
type AoVivo struct {
	ViagemID     string        `json:"viagemId"`
	Turno        models.Turno  `json:"turno"`
	Tipo         string        `json:"tipo"`
	Pos          models.LatLng `json:"pos"`
	AtualizadoEm string        `json:"atualizadoEm"`
	ABordo       int           `json:"aBordo"`
	Origem       string        `json:"origem"`
}

func vanDe(e models.Escopo) (string, error) {
	if e.Usuario.Perfil != models.PerfilMotorista || len(e.VanIDs) == 0 {
		return "", core.ErrProibido
	}
	return e.VanIDs[0], nil
}

// historico monta as linhas do histórico dos últimos `dias` dias.
func (s *Service) historico(ctx context.Context, vanID string, dias int) ([]models.ResumoViagem, error) {
	inicio := models.Agora().AddDate(0, 0, -dias)
	viagens, err := s.repo.ViagensDesde(ctx, vanID, inicio.Format("2006-01-02"))
	if err != nil {
		return nil, err
	}
	est, err := s.repo.EstatTrajetos(ctx, vanID, inicio)
	if err != nil {
		return nil, err
	}
	var ids []string
	for _, v := range viagens {
		ids = append(ids, v.EscolaIDs...)
	}
	escolas, _ := s.repo.MapaEscolas(ctx, ids)
	l := []models.ResumoViagem{}
	for _, v := range viagens {
		e, temRegistro := est[v.ID]
		if v.Status == "cancelada" && !temRegistro {
			continue // nunca andou
		}
		r := models.ResumoViagem{ID: v.ID, Data: v.Data, Turno: v.Turno, Tipo: v.Tipo, Status: v.Status, IniciadaEm: v.IniciadaEm,
			ConcluidaEm: v.ConcluidaEm, Escolas: []string{}, Pontos: e.Pontos, Km: e.Km, Origem: e.Origem, PrimeiraEm: e.Primeira, UltimaEm: e.Ultima}
		if r.Origem == "" {
			r.Origem = "gps"
			if v.Simulado {
				r.Origem = "simulacao"
			}
		}
		if r.Status == "cancelada" {
			r.Status = "encerrada"
		}
		for _, id := range v.EscolaIDs {
			if x, ok := escolas[id]; ok {
				r.Escolas = append(r.Escolas, x.Nome)
			}
		}
		for _, p := range v.Paradas {
			if p.Tipo != "aluno" {
				continue
			}
			switch p.Status {
			case "feito":
				r.Alunos++
			case "ausente":
				r.Ausentes++
			}
		}
		l = append(l, r)
	}
	return l, nil
}

func (s *Service) Resumo(ctx context.Context, e models.Escopo) (Resumo, error) {
	vanID, err := vanDe(e)
	if err != nil {
		return Resumo{}, err
	}
	h, err := s.historico(ctx, vanID, DiasHistorico)
	if err != nil {
		return Resumo{}, err
	}
	r := Resumo{DiasHistorico: DiasHistorico, DiasGuarda: DiasGuarda, Viagens: len(h)}
	for _, v := range h {
		r.Pontos += v.Pontos
		r.Km += v.Km
		if v.Pontos > 1 && v.Origem == "gps" {
			r.ViagensComGPS++
		}
		r.PrimeiraViagem = v.Data
	}
	r.UltimaPosicaoEm, _ = s.repo.UltimaPosicao(ctx, vanID)
	r.Acessos, err = s.repo.AcessosDaVan(ctx, vanID)
	return r, err
}

func (s *Service) Historico(ctx context.Context, e models.Escopo, dias int) ([]models.ResumoViagem, error) {
	vanID, err := vanDe(e)
	if err != nil {
		return nil, err
	}
	if dias <= 0 || dias > DiasGuarda {
		dias = DiasHistorico
	}
	return s.historico(ctx, vanID, dias)
}

func (s *Service) trajetoDaVan(ctx context.Context, vanID, viagemID string) ([]models.PontoTrajeto, error) {
	v, err := s.repo.Viagem(ctx, viagemID)
	if err != nil {
		return nil, err
	}
	if v.VanID != vanID {
		return nil, core.ErrNaoEncontrado
	}
	return s.repo.Trajeto(ctx, viagemID)
}

func (s *Service) Trajeto(ctx context.Context, e models.Escopo, viagemID string) ([]models.PontoTrajeto, error) {
	vanID, err := vanDe(e)
	if err != nil {
		return nil, err
	}
	return s.trajetoDaVan(ctx, vanID, viagemID)
}

var nomeTipo = map[string]string{"ida": "Ida (casa → escola)", "volta": "Volta (escola → casa)"}

// CSV = histórico dos trajetos em planilha (uma linha por posição), para guardar ou entregar na fiscalização.
func (s *Service) CSV(ctx context.Context, e models.Escopo, dias int) ([]byte, string, error) {
	vanID, err := vanDe(e)
	if err != nil {
		return nil, "", err
	}
	van, err := s.repo.Van(ctx, vanID)
	if err != nil {
		return nil, "", err
	}
	if dias <= 0 || dias > DiasGuarda {
		dias = DiasHistorico
	}
	h, err := s.historico(ctx, vanID, dias)
	if err != nil {
		return nil, "", err
	}
	var buf bytes.Buffer
	buf.WriteString("\uFEFF") // Excel abre com acento certo
	w := csv.NewWriter(&buf)
	w.Comma = ';'
	_ = w.Write([]string{"placa", "motorista", "viagem", "data", "turno", "trecho", "escolas", "alunos_transportados", "horario_posicao", "latitude", "longitude", "origem"})
	for _, v := range h {
		pts, err := s.repo.Trajeto(ctx, v.ID)
		if err != nil {
			return nil, "", err
		}
		for _, p := range pts {
			_ = w.Write([]string{van.Placa, van.Motorista, v.ID, v.Data, models.NomeTurno[v.Turno], nomeTipo[v.Tipo], strings.Join(v.Escolas, " | "),
				fmt.Sprint(v.Alunos), models.ParseIso(p.Em).In(models.Fuso).Format("2006-01-02 15:04:05"),
				fmt.Sprintf("%.6f", p.Lat), fmt.Sprintf("%.6f", p.Lng), v.Origem})
		}
	}
	w.Flush()
	nome := fmt.Sprintf("trajetos-%s-%s.csv", strings.ReplaceAll(strings.ToLower(van.Placa), "-", ""), models.Hoje())
	return buf.Bytes(), nome, w.Error()
}

func token() string {
	b := make([]byte, 20)
	_, _ = rand.Read(b)
	return strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b))
}

func (s *Service) CriarAcesso(ctx context.Context, e models.Escopo, nome string, dias int) (models.AcessoFiscal, error) {
	vanID, err := vanDe(e)
	if err != nil {
		return models.AcessoFiscal{}, err
	}
	nome = strings.TrimSpace(nome)
	if nome == "" {
		return models.AcessoFiscal{}, core.Invalido("Diga para quem é o acesso (ex.: Prefeitura, DETRAN, escola).")
	}
	if len([]rune(nome)) > 80 {
		nome = string([]rune(nome)[:80])
	}
	if dias <= 0 || dias > 365 {
		dias = 30
	}
	a := models.AcessoFiscal{Token: token(), VanID: vanID, Nome: nome, ExpiraEm: models.Iso(time.Now().AddDate(0, 0, dias))}
	if err := s.repo.CriarAcesso(ctx, a); err != nil {
		return a, err
	}
	a.CriadoEm = models.AgoraIso()
	return a, nil
}

func (s *Service) Revogar(ctx context.Context, e models.Escopo, tok string) error {
	vanID, err := vanDe(e)
	if err != nil {
		return err
	}
	ok, err := s.repo.RevogarAcesso(ctx, vanID, tok)
	if err == nil && !ok {
		return core.ErrNaoEncontrado
	}
	return err
}

// Fiscal monta a página do poder público (link com token, sem login).
func (s *Service) Fiscal(ctx context.Context, tok string) (Fiscal, error) {
	var f Fiscal
	a, err := s.repo.UsarAcesso(ctx, tok)
	if err != nil {
		return f, core.NovoErro(404, "Este link de fiscalização não existe, expirou ou foi cancelado pelo motorista.")
	}
	van, err := s.repo.Van(ctx, a.VanID)
	if err != nil {
		return f, err
	}
	a.Token = ""
	f.Acesso, f.EmitidoEm, f.DiasHistorico, f.Escolas = a, models.AgoraIso(), DiasHistorico, []EscolaFiscal{}
	f.Van.Nome, f.Van.Motorista, f.Van.Telefone, f.Van.Placa, f.Van.Modelo, f.Van.Avaliacao = van.Nome, van.Motorista, van.Telefone, van.Placa, van.Modelo, van.Avaliacao
	escolas, _ := s.repo.MapaEscolas(ctx, van.EscolaIDs)
	for _, id := range van.EscolaIDs {
		x, ok := escolas[id]
		if !ok {
			continue
		}
		item := EscolaFiscal{Nome: x.Nome, Endereco: x.Endereco, Credenciamento: van.Credenciamento[id], Turnos: []string{}}
		for _, t := range van.Turnos {
			if t.Ativo && models.Contem(t.EscolaIDs, id) {
				item.Turnos = append(item.Turnos, models.NomeTurno[t.Turno])
			}
		}
		f.Escolas = append(f.Escolas, item)
	}
	ativas, _ := s.repo.ViagensAtivasDaVan(ctx, van.ID)
	if len(ativas) > 0 {
		v := ativas[len(ativas)-1]
		n := 0
		for _, p := range v.Paradas {
			if p.Tipo == "aluno" && p.Status == "feito" {
				n++
			}
		}
		if v.Tipo == "volta" {
			// na volta, "a bordo" = quem já embarcou na escola e ainda não desceu
			n = 0
			for _, p := range v.Paradas {
				if p.Tipo == "aluno" && p.Status == "pendente" {
					n++
				}
			}
		}
		origem := "gps"
		if v.Simulado {
			origem = "simulacao"
		}
		f.AoVivo = &AoVivo{v.ID, v.Turno, v.Tipo, v.Pos, v.AtualizadoEm, n, origem}
	}
	f.Historico, err = s.historico(ctx, van.ID, DiasHistorico)
	return f, err
}

func (s *Service) FiscalTrajeto(ctx context.Context, tok, viagemID string) ([]models.PontoTrajeto, error) {
	a, err := s.repo.UsarAcesso(ctx, tok)
	if err != nil {
		return nil, core.NovoErro(404, "Link de fiscalização inválido.")
	}
	return s.trajetoDaVan(ctx, a.VanID, viagemID)
}

// Limpar apaga posições mais velhas que DiasGuarda (roda uma vez por dia).
func (s *Service) Limpar(ctx context.Context) (int64, error) {
	return s.repo.PurgarPosicoes(ctx, time.Now().AddDate(0, 0, -DiasGuarda))
}
