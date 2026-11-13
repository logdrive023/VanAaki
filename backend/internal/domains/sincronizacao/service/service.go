// Package service — o pacote de dados que cada aparelho recebe, já filtrado pelo servidor:
//
//   - tio: tudo da van dele;
//   - família/aluno: o próprio filho completo; os colegas só com apelido e pontos (para o ranking);
//     a viagem só com a parada do filho e a posição da van na vez dele;
//   - escola: só os alunos e as paradas dela.
package service

import (
	"context"

	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/regras"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/repositorio"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/transmissao"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

type Eu struct {
	Usuario  models.Usuario `json:"usuario"`
	VanIDs   []string       `json:"vanIds"`
	AlunoIDs []string       `json:"alunoIds"`
	EscolaID string         `json:"escolaId,omitempty"`
}

type Pacote struct {
	Eu           Eu                    `json:"eu"`
	Hoje         string                `json:"hoje"`
	Escolas      []models.Escola       `json:"escolas"`
	Vans         []models.Van          `json:"vans"`
	Alunos       []models.Aluno        `json:"alunos"`
	Pagamentos   []models.Pagamento    `json:"pagamentos"`
	Presencas    []models.Presenca     `json:"presencas"`
	Viagens      []models.Viagem       `json:"viagens"`
	Notificacoes []models.Notificacao  `json:"notificacoes"`
	Mensagens    []models.Mensagem     `json:"mensagens"`
	Recados      []models.Recado       `json:"recados"`
	Pontos       []models.EventoPontos `json:"pontos"`
	Recompensas  []models.Recompensa   `json:"recompensas"`
	Resgates     []models.Resgate      `json:"resgates"`
}

type Service interface {
	Pacote(ctx context.Context, e models.Escopo) (Pacote, error)
}

type service struct {
	repo *repositorio.Repo
	tx   *transmissao.T
}

func New(r *repositorio.Repo, tx *transmissao.T) Service { return &service{repo: r, tx: tx} }

func ids(al []models.Aluno) []string {
	out := make([]string, 0, len(al))
	for _, a := range al {
		out = append(out, a.ID)
	}
	return out
}

// vanPublica tira o que é só do tio (endereço da garagem, rota fixa).
func vanPublica(v models.Van) models.Van {
	v.Garagem, v.RotasFixas = models.LatLng{}, nil
	v.Config = models.ConfigVan{}
	return v
}

// vanFamilia = vanPublica + os dados do Pix (a família paga a mensalidade direto para o tio).
func vanFamilia(v models.Van) models.Van {
	c := v.Config
	p := vanPublica(v)
	p.Config = models.ConfigVan{PixTipo: c.PixTipo, PixChave: c.PixChave, PixNome: c.PixNome, PixCidade: c.PixCidade, SemGamificacao: c.SemGamificacao}
	return p
}

// colega = só o que o ranking precisa.
func colega(a models.Aluno) models.Aluno {
	return models.Aluno{ID: a.ID, VanID: a.VanID, Nome: a.Apelido, Apelido: a.Apelido, Cor: a.Cor, Turno: a.Turno, Ativo: a.Ativo, CriadoEm: a.CriadoEm}
}

func (s *service) Pacote(ctx context.Context, e models.Escopo) (Pacote, error) {
	p := Pacote{
		Eu:   Eu{Usuario: e.Usuario, VanIDs: e.VanIDs, AlunoIDs: e.AlunoIDs, EscolaID: e.EscolaID},
		Hoje: models.Hoje(), Escolas: []models.Escola{}, Vans: []models.Van{}, Alunos: []models.Aluno{}, Pagamentos: []models.Pagamento{},
		Presencas: []models.Presenca{}, Viagens: []models.Viagem{}, Notificacoes: []models.Notificacao{}, Mensagens: []models.Mensagem{}, Recados: []models.Recado{},
		Pontos: []models.EventoPontos{}, Recompensas: []models.Recompensa{}, Resgates: []models.Resgate{},
	}
	var err error
	switch e.Usuario.Perfil {
	case models.PerfilMotorista:
		err = s.motorista(ctx, e, &p)
	case models.PerfilPais, models.PerfilAluno:
		err = s.familia(ctx, e, &p)
	case models.PerfilEscola:
		err = s.escola(ctx, e, &p)
	}
	return p, err
}

func (s *service) motorista(ctx context.Context, e models.Escopo, p *Pacote) error {
	vans, err := s.repo.VansPorIDs(ctx, e.VanIDs)
	if err != nil || len(vans) == 0 {
		return err
	}
	van := vans[0]
	p.Vans = vans
	todas, err := s.repo.Escolas(ctx)
	if err != nil {
		return err
	}
	for _, x := range todas {
		if !models.Contem(van.EscolaIDs, x.ID) {
			x.Codigo = "" // código só das escolas que ele atende (para convidar a portaria)
		}
		p.Escolas = append(p.Escolas, x)
	}
	if p.Alunos, err = s.repo.AlunosDasVans(ctx, e.VanIDs); err != nil {
		return err
	}
	al := ids(p.Alunos)
	if p.Pagamentos, err = s.repo.PagamentosDosAlunos(ctx, al); err != nil {
		return err
	}
	if p.Presencas, err = s.repo.PresencasAgenda(ctx, p.Hoje, al); err != nil {
		return err
	}
	if p.Viagens, err = s.repo.ViagensDoDia(ctx, e.VanIDs, p.Hoje); err != nil {
		return err
	}
	if p.Notificacoes, err = s.repo.Notificacoes(ctx, "motorista", []string{}, e.VanIDs, ""); err != nil {
		return err
	}
	if p.Recados, err = s.repo.RecadosDasVans(ctx, e.VanIDs); err != nil {
		return err
	}
	if p.Mensagens, err = s.repo.MensagensDosAlunos(ctx, al); err != nil {
		return err
	}
	if p.Pontos, err = s.repo.PontosDasVans(ctx, e.VanIDs); err != nil {
		return err
	}
	if p.Recompensas, err = s.repo.Recompensas(ctx, e.VanIDs); err != nil {
		return err
	}
	p.Resgates, err = s.repo.Resgates(ctx, al)
	return err
}

func (s *service) familia(ctx context.Context, e models.Escopo, p *Pacote) error {
	vans, err := s.repo.VansPorIDs(ctx, e.VanIDs)
	if err != nil {
		return err
	}
	for _, v := range vans {
		p.Vans = append(p.Vans, vanFamilia(v))
	}
	daVan, err := s.repo.AlunosDasVans(ctx, e.VanIDs)
	if err != nil {
		return err
	}
	escolasFilhos := []string{}
	for _, a := range daVan {
		if e.TemAluno(a.ID) {
			if e.Usuario.Perfil == models.PerfilAluno {
				a.CodigoFamilia = ""
			}
			p.Alunos = append(p.Alunos, a)
			escolasFilhos = append(escolasFilhos, a.EscolaID)
		} else {
			p.Alunos = append(p.Alunos, colega(a))
		}
	}
	if p.Escolas, err = s.repo.EscolasPorIDs(ctx, escolasFilhos); err != nil {
		return err
	}
	for i := range p.Escolas {
		p.Escolas[i].Codigo = ""
	}
	if e.Usuario.Perfil == models.PerfilPais {
		if p.Pagamentos, err = s.repo.PagamentosDosAlunos(ctx, e.AlunoIDs); err != nil {
			return err
		}
		if p.Mensagens, err = s.repo.MensagensDosAlunos(ctx, e.AlunoIDs); err != nil {
			return err
		}
	}
	if p.Presencas, err = s.repo.PresencasAgenda(ctx, p.Hoje, e.AlunoIDs); err != nil {
		return err
	}
	viagens, err := s.repo.ViagensDoDia(ctx, e.VanIDs, p.Hoje)
	if err != nil {
		return err
	}
	for _, v := range viagens {
		if f, ok := transmissao.ParaFamilia(v, e.AlunoIDs, s.tx.Locais(ctx, &v)); ok {
			p.Viagens = append(p.Viagens, f)
		}
	}
	if p.Notificacoes, err = s.repo.Notificacoes(ctx, string(e.Usuario.Perfil), e.AlunoIDs, []string{}, ""); err != nil {
		return err
	}
	pontos, err := s.repo.PontosDasVans(ctx, e.VanIDs)
	if err != nil {
		return err
	}
	for _, x := range pontos {
		if !e.TemAluno(x.AlunoID) {
			x.Observacao = "" // ocorrência dos colegas: só conta para o ranking
		}
		p.Pontos = append(p.Pontos, x)
	}
	if p.Recompensas, err = s.repo.Recompensas(ctx, e.VanIDs); err != nil {
		return err
	}
	p.Resgates, err = s.repo.Resgates(ctx, e.AlunoIDs)
	return err
}

func (s *service) escola(ctx context.Context, e models.Escopo, p *Pacote) error {
	esc, err := s.repo.Escola(ctx, e.EscolaID)
	if err != nil {
		return err
	}
	p.Escolas = []models.Escola{esc}
	vans, err := s.repo.VansDaEscola(ctx, e.EscolaID)
	if err != nil {
		return err
	}
	if p.Recados, err = s.repo.RecadosDaEscola(ctx, e.EscolaID); err != nil {
		return err
	}
	vanIDs := []string{}
	for _, v := range vans {
		p.Vans = append(p.Vans, vanPublica(v))
		vanIDs = append(vanIDs, v.ID)
	}
	alunos, err := s.repo.AlunosDaEscola(ctx, e.EscolaID)
	if err != nil {
		return err
	}
	for _, a := range alunos {
		// a escola vê o aluno, a série e a van — sem endereço, telefone nem mensalidade
		p.Alunos = append(p.Alunos, models.Aluno{ID: a.ID, VanID: a.VanID, EscolaID: a.EscolaID, Nome: a.Nome, Apelido: a.Apelido, Cor: a.Cor,
			Serie: a.Serie, Turno: a.Turno, Ativo: a.Ativo, CriadoEm: a.CriadoEm, Completo: true})
	}
	al := ids(alunos)
	if p.Presencas, err = s.repo.PresencasAgenda(ctx, p.Hoje, al); err != nil {
		return err
	}
	viagens, err := s.repo.ViagensDoDia(ctx, vanIDs, p.Hoje)
	if err != nil {
		return err
	}
	for _, v := range viagens {
		if x, ok := transmissao.ParaEscola(v, e.EscolaID, s.tx.Locais(ctx, &v)); ok {
			p.Viagens = append(p.Viagens, x)
		}
	}
	if p.Notificacoes, err = s.repo.Notificacoes(ctx, "escola", []string{}, []string{}, e.EscolaID); err != nil {
		return err
	}
	pontos, err := s.repo.PontosDosAlunos(ctx, al)
	if err != nil {
		return err
	}
	for _, x := range pontos {
		if t := regras.TipoDe(x.Tipo); t != nil && t.Grupo == "ocorrencia" {
			p.Pontos = append(p.Pontos, x)
		}
	}
	return nil
}
