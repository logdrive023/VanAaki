// Package service — a van do tio: dados, turnos e escolas, rota fixa, alunos e o combinado do dia.
package service

import (
	"context"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/avisos"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/regras"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/repositorio"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/transmissao"
	"github.com/logdrive023/vanaaki/backend/internal/core"
	contasvc "github.com/logdrive023/vanaaki/backend/internal/domains/conta/service"
	"github.com/logdrive023/vanaaki/backend/internal/domains/van/entities"
	viagemsvc "github.com/logdrive023/vanaaki/backend/internal/domains/viagem/service"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

var cores = []string{"#6C5CE7", "#00B894", "#E17055", "#0984E3", "#D63384", "#F2811D", "#2D3436", "#00A8A8", "#8E44AD", "#C0392B"}

type Service interface {
	AtualizarVan(ctx context.Context, e models.Escopo, req entities.VanRequest) (models.Van, error)
	AtualizarTurnos(ctx context.Context, e models.Escopo, req entities.TurnosRequest) (models.Van, error)
	Configurar(ctx context.Context, e models.Escopo, c entities.ConfigRequest) (models.Van, error)
	RotaFixa(ctx context.Context, e models.Escopo, req entities.RotaFixaRequest) error
	SalvarAluno(ctx context.Context, e models.Escopo, a models.Aluno) (models.Aluno, error)
	Arquivar(ctx context.Context, e models.Escopo, alunoID string, ativo bool) error
	DefinirPresenca(ctx context.Context, e models.Escopo, req entities.PresencaRequest) error
}

type service struct {
	repo    *repositorio.Repo
	av      *avisos.Avisos
	tx      *transmissao.T
	viagens viagemsvc.Service
}

func New(r *repositorio.Repo, av *avisos.Avisos, tx *transmissao.T, v viagemsvc.Service) Service {
	return &service{repo: r, av: av, tx: tx, viagens: v}
}

func (s *service) minhaVan(ctx context.Context, e models.Escopo) (models.Van, error) {
	if e.Usuario.Perfil != models.PerfilMotorista || len(e.VanIDs) == 0 {
		return models.Van{}, core.ErrProibido
	}
	return s.repo.Van(ctx, e.VanIDs[0])
}

func (s *service) AtualizarVan(ctx context.Context, e models.Escopo, req entities.VanRequest) (models.Van, error) {
	v, err := s.minhaVan(ctx, e)
	if err != nil {
		return v, err
	}
	if strings.TrimSpace(req.Nome) == "" || strings.TrimSpace(req.Motorista) == "" {
		return v, core.Invalido("Informe o nome da van e o seu nome.")
	}
	v.Nome, v.Motorista, v.Telefone = strings.TrimSpace(req.Nome), strings.TrimSpace(req.Motorista), req.Telefone
	v.Placa, v.Modelo = strings.ToUpper(strings.TrimSpace(req.Placa)), req.Modelo
	if req.Garagem.Lat != 0 || req.Garagem.Lng != 0 {
		v.Garagem = req.Garagem
	}
	if req.PrecoPadrao > 0 {
		v.PrecoPadrao = req.PrecoPadrao
	}
	if req.Vagas >= 0 {
		v.Vagas = req.Vagas
	}
	if err := s.repo.SalvarVan(ctx, v, false); err != nil {
		return v, err
	}
	s.tx.Van(ctx, v.ID)
	return v, nil
}

// Configurar salva as configurações da van (Pix, cobrança, avisos, folga).
func (s *service) Configurar(ctx context.Context, e models.Escopo, c entities.ConfigRequest) (models.Van, error) {
	v, err := s.minhaVan(ctx, e)
	if err != nil {
		return v, err
	}
	c.PixChave, c.PixNome, c.PixCidade = strings.TrimSpace(c.PixChave), strings.TrimSpace(c.PixNome), strings.TrimSpace(c.PixCidade)
	if c.PixChave != "" {
		if c.PixNome == "" || c.PixCidade == "" {
			return v, core.Invalido("Para o Pix, informe também o nome do titular e a cidade.")
		}
		switch c.PixTipo {
		case "cpf", "cnpj", "celular", "email", "aleatoria":
		default:
			return v, core.Invalido("Escolha o tipo da chave Pix.")
		}
		if len(c.PixChave) > 77 {
			return v, core.Invalido("Chave Pix grande demais.")
		}
	}
	v.Config = c.Normalizar()
	if err := s.repo.SalvarVan(ctx, v, false); err != nil {
		return v, err
	}
	s.tx.Van(ctx, v.ID)
	return v, nil
}

// AtualizarTurnos: turnos em que o tio trabalha e as escolas de cada um (escola nova pede credenciamento).
func (s *service) AtualizarTurnos(ctx context.Context, e models.Escopo, req entities.TurnosRequest) (models.Van, error) {
	v, err := s.minhaVan(ctx, e)
	if err != nil {
		return v, err
	}
	todas := []string{}
	turnos := []models.TurnoVan{}
	for _, t := range models.Turnos {
		cfg := models.TurnoVan{Turno: t, EscolaIDs: []string{}}
		for _, x := range req.Turnos {
			if x.Turno == t {
				cfg.Ativo = x.Ativo
				for _, id := range x.EscolaIDs {
					if !models.Contem(cfg.EscolaIDs, id) {
						cfg.EscolaIDs = append(cfg.EscolaIDs, id)
					}
				}
			}
		}
		for _, id := range cfg.EscolaIDs {
			if !models.Contem(todas, id) {
				todas = append(todas, id)
			}
		}
		turnos = append(turnos, cfg)
	}
	escolas, err := s.repo.MapaEscolas(ctx, todas)
	if err != nil {
		return v, err
	}
	for _, id := range todas {
		esc, ok := escolas[id]
		if !ok {
			return v, core.Invalido("Escola não encontrada.")
		}
		if _, ja := v.Credenciamento[id]; !ja {
			v.Credenciamento[id] = "pendente"
			_ = s.av.Escola(ctx, id, "📝", "Credenciamento pendente", v.Nome+" quer atender "+esc.Nome)
		}
	}
	v.Turnos, v.EscolaIDs = turnos, todas
	if err := s.repo.SalvarVan(ctx, v, false); err != nil {
		return v, err
	}
	s.tx.Van(ctx, v.ID)
	for _, id := range todas {
		s.tx.Escola(ctx, id)
	}
	return v, nil
}

func (s *service) RotaFixa(ctx context.Context, e models.Escopo, req entities.RotaFixaRequest) error {
	v, err := s.minhaVan(ctx, e)
	if err != nil {
		return err
	}
	if !req.Turno.Valido() || (req.Tipo != "ida" && req.Tipo != "volta") {
		return core.Invalido("Turno ou trecho inválido.")
	}
	k := string(req.Turno) + "|" + req.Tipo
	if v.RotasFixas == nil {
		v.RotasFixas = map[string]models.RotaFixa{}
	}
	rf := v.RotasFixas[k]
	if req.Ativa != nil {
		rf.Ativa = *req.Ativa
	}
	if req.Ordem != nil {
		rf.Ordem = req.Ordem
	}
	if rf.Ordem == nil {
		rf.Ordem = []string{}
	}
	rf.AtualizadaEm = models.AgoraIso()
	v.RotasFixas[k] = rf
	if err := s.repo.SalvarVan(ctx, v, false); err != nil {
		return err
	}
	s.tx.Van(ctx, v.ID)
	return nil
}

func (s *service) SalvarAluno(ctx context.Context, e models.Escopo, a models.Aluno) (models.Aluno, error) {
	v, err := s.minhaVan(ctx, e)
	if err != nil {
		return a, err
	}
	a.Nome, a.Responsavel, a.Endereco = strings.TrimSpace(a.Nome), strings.TrimSpace(a.Responsavel), strings.TrimSpace(a.Endereco)
	if a.Nome == "" || a.Responsavel == "" || a.Endereco == "" {
		return a, core.Invalido("Preencha nome, responsável e endereço.")
	}
	if a.Mensalidade <= 0 {
		return a, core.Invalido("Mensalidade inválida.")
	}
	if a.DiaVencimento < 1 || a.DiaVencimento > 28 {
		return a, core.Invalido("O vencimento vai do dia 1 ao 28.")
	}
	if !a.Turno.Valido() {
		return a, core.Invalido("Escolha o turno.")
	}
	if !models.Contem(v.EscolaIDs, a.EscolaID) {
		return a, core.Invalido("Escolha uma escola que a van atende (configure em Turnos e escolas).")
	}
	if a.Local.Lat == 0 && a.Local.Lng == 0 {
		return a, core.Invalido("Marque o local de embarque no mapa.")
	}
	if strings.TrimSpace(a.Apelido) == "" {
		a.Apelido = regras.PrimeiroNome(a.Nome)
	}
	if utf8.RuneCountInString(a.Apelido) > 20 {
		return a, core.Invalido("Apelido muito grande.")
	}
	novo := true
	if a.ID != "" {
		if antigo, err := s.repo.Aluno(ctx, a.ID); err == nil {
			if antigo.VanID != v.ID {
				return a, core.ErrProibido
			}
			novo = false
			a.CodigoFamilia, a.CodigoAluno, a.CriadoEm, a.Ativo = antigo.CodigoFamilia, antigo.CodigoAluno, antigo.CriadoEm, antigo.Ativo
		}
	}
	if novo {
		a.ID, a.Ativo = uuid.NewString(), true
		a.CodigoFamilia, a.CodigoAluno = contasvc.Codigo(6), contasvc.Codigo(6)
		if a.Cor == "" {
			atuais, _ := s.repo.AlunosDasVans(ctx, []string{v.ID})
			a.Cor = cores[len(atuais)%len(cores)]
		}
	}
	a.VanID = v.ID
	if err := s.repo.SalvarAluno(ctx, a); err != nil {
		return a, err
	}
	if novo {
		mes := models.MesAtual()
		if ok, _ := s.repo.ExistePagamento(ctx, a.ID, mes); !ok {
			_ = s.repo.SalvarPagamento(ctx, NovaCobranca(a, mes))
		}
	}
	s.tx.Van(ctx, v.ID)
	return s.repo.Aluno(ctx, a.ID)
}

// NovaCobranca da mensalidade do mês.
func NovaCobranca(a models.Aluno, mes string) models.Pagamento {
	return models.Pagamento{ID: uuid.NewString(), AlunoID: a.ID, Mes: mes, Valor: a.Mensalidade,
		Vencimento: fmt.Sprintf("%s-%02d", mes, a.DiaVencimento), Status: "pendente"}
}

func (s *service) Arquivar(ctx context.Context, e models.Escopo, alunoID string, ativo bool) error {
	v, err := s.minhaVan(ctx, e)
	if err != nil {
		return err
	}
	a, err := s.repo.Aluno(ctx, alunoID)
	if err != nil {
		return err
	}
	if a.VanID != v.ID {
		return core.ErrProibido
	}
	a.Ativo = ativo
	if err := s.repo.SalvarAluno(ctx, a); err != nil {
		return err
	}
	s.tx.Van(ctx, v.ID)
	return nil
}

// DefinirPresenca: o combinado do dia (ida e volta, só ida, só volta, não vai). Pais e tio podem mudar.
// Se a rota já está andando, o aluno sai dela e a rota é reotimizada.
func (s *service) DefinirPresenca(ctx context.Context, e models.Escopo, req entities.PresencaRequest) error {
	trechos, ok := regras.Planos[req.Plano]
	if !ok {
		return core.Invalido("Combinado inválido.")
	}
	a, err := s.repo.Aluno(ctx, req.AlunoID)
	if err != nil {
		return err
	}
	porTio := e.Usuario.Perfil == models.PerfilMotorista
	if !(porTio && e.TemVan(a.VanID)) && !(e.Usuario.Perfil == models.PerfilPais && e.TemAluno(a.ID)) {
		return core.ErrProibido
	}
	data := models.Hoje()
	if req.Data != "" && req.Data != data {
		d, err := time.ParseInLocation("2006-01-02", req.Data, models.Fuso)
		if err != nil || req.Data < data || d.After(models.Agora().AddDate(0, 0, 31)) {
			return core.Invalido("Escolha um dia entre hoje e os próximos 30 dias.")
		}
		data = req.Data
	}
	quando := "hoje"
	if data != models.Hoje() {
		t, _ := time.ParseInLocation("2006-01-02", data, models.Fuso)
		quando = "em " + diasSemana[t.Weekday()] + ", " + t.Format("02/01")
	}
	antes, _ := s.repo.Presenca(ctx, a.ID, data)
	if regras.PlanoDe(antes) == req.Plano {
		return nil
	}
	motivo := strings.TrimSpace(req.Motivo)
	if utf8.RuneCountInString(motivo) > 140 {
		motivo = string([]rune(motivo)[:140])
	}
	if err := s.repo.SalvarPresenca(ctx, models.Presenca{ID: a.ID + "|" + data, AlunoID: a.ID, Data: data, Ida: trechos[0], Volta: trechos[1],
		Motivo: motivo, AvisadoEm: models.AgoraIso()}); err != nil {
		return err
	}
	nome := regras.PrimeiroNome(a.Nome)
	ic, np, desc := regras.IconePlano[req.Plano], regras.NomePlano[req.Plano], regras.DescPlano[req.Plano]
	if porTio {
		_ = s.av.Pais(ctx, a.ID, ic, "O tio marcou: "+strings.ToLower(np)+" "+quando, desc)
	} else {
		txt := desc
		if motivo != "" {
			txt += " · " + motivo
		}
		_ = s.av.Motorista(ctx, a.VanID, ic, nome+": "+strings.ToLower(np)+" "+quando, txt)
	}
	if req.Plano != "ambos" {
		_ = s.av.DarPontos(ctx, a, "aviso_ausencia", "sistema", "", "aviso|"+a.ID+"|"+data)
	}
	if data == models.Hoje() {
		if err := s.viagens.AjustarPorPresenca(ctx, a.ID); err != nil {
			return err
		}
	}
	s.tx.Van(ctx, a.VanID)
	return nil
}

var diasSemana = [...]string{"domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"}
