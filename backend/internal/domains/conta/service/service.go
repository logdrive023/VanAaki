// Package service — contas e acesso:
//   - o tio se cadastra com e-mail e senha (e já cria a van);
//   - a família entra com o CÓDIGO DE CONVITE que o tio manda (um por aluno) e cria e-mail/senha;
//   - o aluno entra só com o CÓDIGO DO ALUNO que aparece no app dos pais;
//   - a escola cria o acesso da portaria com o CÓDIGO DA ESCOLA.
package service

import (
	"context"
	"crypto/rand"
	"math/big"
	"net/mail"
	"strings"

	"github.com/google/uuid"
	"github.com/logdrive023/vanaaki/backend/internal/authentication"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/avisos"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/regras"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/repositorio"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/transmissao"
	"github.com/logdrive023/vanaaki/backend/internal/core"
	"github.com/logdrive023/vanaaki/backend/internal/domains/conta/entities"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

type Service interface {
	Escopo(ctx context.Context, usuarioID string) (models.Escopo, error)
	Entrar(ctx context.Context, req entities.EntrarRequest) (entities.Sessao, error)
	CadastroMotorista(ctx context.Context, req entities.CadastroMotoristaRequest) (entities.Sessao, error)
	CadastroFamilia(ctx context.Context, req entities.CadastroComCodigoRequest) (entities.Sessao, error)
	CadastroEscola(ctx context.Context, req entities.CadastroComCodigoRequest) (entities.Sessao, error)
	EntrarAluno(ctx context.Context, codigo string) (entities.Sessao, error)
	VincularFilho(ctx context.Context, e models.Escopo, codigo string) error
	Demo(ctx context.Context, perfil string) (entities.Sessao, error)
}

type service struct {
	repo   *repositorio.Repo
	tokens *authentication.Tokens
	av     *avisos.Avisos
	tx     *transmissao.T
	demo   bool
}

func New(r *repositorio.Repo, t *authentication.Tokens, av *avisos.Avisos, tx *transmissao.T, demo bool) Service {
	return &service{repo: r, tokens: t, av: av, tx: tx, demo: demo}
}

// Codigo gera um código curto sem letras confusas (sem 0/O, 1/I).
func Codigo(n int) string {
	const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, n)
	for i := range b {
		k, _ := rand.Int(rand.Reader, big.NewInt(int64(len(letras))))
		b[i] = letras[k.Int64()]
	}
	return string(b)
}

func (s *service) Escopo(ctx context.Context, usuarioID string) (models.Escopo, error) {
	u, err := s.repo.Usuario(ctx, usuarioID)
	if err != nil {
		return models.Escopo{}, err
	}
	e := models.Escopo{Usuario: u, VanIDs: []string{}, AlunoIDs: []string{}, EscolaID: u.EscolaID}
	switch u.Perfil {
	case models.PerfilMotorista:
		e.VanIDs = []string{u.VanID}
	case models.PerfilPais:
		al, err := s.repo.AlunosDaFamilia(ctx, u.ID)
		if err != nil {
			return e, err
		}
		for _, a := range al {
			e.AlunoIDs = append(e.AlunoIDs, a.ID)
			if !models.Contem(e.VanIDs, a.VanID) {
				e.VanIDs = append(e.VanIDs, a.VanID)
			}
		}
	case models.PerfilAluno:
		a, err := s.repo.Aluno(ctx, u.AlunoID)
		if err != nil {
			return e, err
		}
		e.AlunoIDs, e.VanIDs = []string{a.ID}, []string{a.VanID}
	}
	return e, nil
}

func (s *service) sessao(u models.Usuario) (entities.Sessao, error) {
	t, err := s.tokens.Gerar(u.ID, string(u.Perfil))
	return entities.Sessao{Token: t, Usuario: u}, err
}

func validarConta(nome, email, senha string) error {
	if strings.TrimSpace(nome) == "" {
		return core.Invalido("Informe o seu nome.")
	}
	if _, err := mail.ParseAddress(email); err != nil {
		return core.Invalido("E-mail inválido.")
	}
	if len(senha) < 6 {
		return core.Invalido("A senha precisa ter pelo menos 6 caracteres.")
	}
	return nil
}

func (s *service) Entrar(ctx context.Context, req entities.EntrarRequest) (entities.Sessao, error) {
	u, err := s.repo.UsuarioPorEmail(ctx, strings.TrimSpace(req.Email))
	if err != nil || !authentication.ConfereSenha(u.SenhaHash, req.Senha) {
		return entities.Sessao{}, core.NovoErro(401, "E-mail ou senha errados.")
	}
	return s.sessao(u)
}

func (s *service) CadastroMotorista(ctx context.Context, req entities.CadastroMotoristaRequest) (entities.Sessao, error) {
	if err := validarConta(req.Nome, req.Email, req.Senha); err != nil {
		return entities.Sessao{}, err
	}
	if _, err := s.repo.UsuarioPorEmail(ctx, req.Email); err == nil {
		return entities.Sessao{}, core.Invalido("Esse e-mail já tem conta. Use \"Entrar\".")
	}
	hash, err := authentication.HashSenha(req.Senha)
	if err != nil {
		return entities.Sessao{}, err
	}
	garagem := req.Garagem
	if garagem.Lat == 0 && garagem.Lng == 0 {
		garagem = models.LatLng{Lat: -23.5505, Lng: -46.6333} // centro de SP até o tio marcar
	}
	nomeVan := strings.TrimSpace(req.NomeVan)
	if nomeVan == "" {
		nomeVan = strings.TrimSpace(req.Nome) + " Transportes"
	}
	van := models.Van{
		ID: uuid.NewString(), Nome: nomeVan, Motorista: strings.TrimSpace(req.Nome), Telefone: req.Telefone,
		Placa: strings.ToUpper(strings.TrimSpace(req.Placa)), Modelo: req.Modelo, Garagem: garagem,
		EscolaIDs: []string{}, Credenciamento: map[string]string{}, PrecoPadrao: 40000, Vagas: 15, Avaliacao: 5,
		Turnos: []models.TurnoVan{{Turno: models.Manha, Ativo: true, EscolaIDs: []string{}}, {Turno: models.Tarde, Ativo: false, EscolaIDs: []string{}}, {Turno: models.Noite, Ativo: false, EscolaIDs: []string{}}},
	}
	if err := s.repo.SalvarVan(ctx, van, false); err != nil {
		return entities.Sessao{}, err
	}
	u := models.Usuario{ID: uuid.NewString(), Perfil: models.PerfilMotorista, Nome: van.Motorista, Email: strings.TrimSpace(req.Email),
		Telefone: req.Telefone, VanID: van.ID, SenhaHash: hash}
	if err := s.repo.CriarUsuario(ctx, u); err != nil {
		return entities.Sessao{}, err
	}
	return s.sessao(u)
}

func (s *service) CadastroFamilia(ctx context.Context, req entities.CadastroComCodigoRequest) (entities.Sessao, error) {
	a, err := s.repo.AlunoPorCodigo(ctx, "codigo_familia", strings.TrimSpace(req.Codigo))
	if err != nil {
		return entities.Sessao{}, core.Invalido("Código de convite não encontrado. Confira com o tio da van.")
	}
	if err := validarConta(req.Nome, req.Email, req.Senha); err != nil {
		return entities.Sessao{}, err
	}
	hash, err := authentication.HashSenha(req.Senha)
	if err != nil {
		return entities.Sessao{}, err
	}
	u := models.Usuario{ID: uuid.NewString(), Perfil: models.PerfilPais, Nome: strings.TrimSpace(req.Nome), Email: strings.TrimSpace(req.Email),
		Telefone: req.Telefone, SenhaHash: hash}
	if err := s.repo.CriarUsuario(ctx, u); err != nil {
		return entities.Sessao{}, err
	}
	if err := s.repo.VincularFamilia(ctx, u.ID, a.ID); err != nil {
		return entities.Sessao{}, err
	}
	_ = s.av.Motorista(ctx, a.VanID, "👋", "A família de "+regras.PrimeiroNome(a.Nome)+" entrou no app", u.Nome+" já recebe os avisos da van.")
	s.tx.Van(ctx, a.VanID)
	return s.sessao(u)
}

func (s *service) VincularFilho(ctx context.Context, e models.Escopo, codigo string) error {
	a, err := s.repo.AlunoPorCodigo(ctx, "codigo_familia", strings.TrimSpace(codigo))
	if err != nil {
		return core.Invalido("Código de convite não encontrado.")
	}
	if err := s.repo.VincularFamilia(ctx, e.Usuario.ID, a.ID); err != nil {
		return err
	}
	s.tx.Van(ctx, a.VanID)
	return nil
}

func (s *service) EntrarAluno(ctx context.Context, codigo string) (entities.Sessao, error) {
	a, err := s.repo.AlunoPorCodigo(ctx, "codigo_aluno", strings.TrimSpace(codigo))
	if err != nil || !a.Ativo {
		return entities.Sessao{}, core.Invalido("Código do aluno não encontrado. Peça para os seus pais.")
	}
	u, err := s.repo.UsuarioDoAluno(ctx, a.ID)
	if err != nil {
		u = models.Usuario{ID: uuid.NewString(), Perfil: models.PerfilAluno, Nome: a.Apelido, AlunoID: a.ID}
		if err := s.repo.CriarUsuario(ctx, u); err != nil {
			return entities.Sessao{}, err
		}
	}
	return s.sessao(u)
}

func (s *service) CadastroEscola(ctx context.Context, req entities.CadastroComCodigoRequest) (entities.Sessao, error) {
	esc, err := s.repo.EscolaPorCodigo(ctx, strings.TrimSpace(req.Codigo))
	if err != nil {
		return entities.Sessao{}, core.Invalido("Código da escola não encontrado.")
	}
	if err := validarConta(req.Nome, req.Email, req.Senha); err != nil {
		return entities.Sessao{}, err
	}
	hash, err := authentication.HashSenha(req.Senha)
	if err != nil {
		return entities.Sessao{}, err
	}
	u := models.Usuario{ID: uuid.NewString(), Perfil: models.PerfilEscola, Nome: strings.TrimSpace(req.Nome), Email: strings.TrimSpace(req.Email),
		Telefone: req.Telefone, EscolaID: esc.ID, SenhaHash: hash}
	if err := s.repo.CriarUsuario(ctx, u); err != nil {
		return entities.Sessao{}, err
	}
	return s.sessao(u)
}

func (s *service) Demo(ctx context.Context, perfil string) (entities.Sessao, error) {
	if !s.demo {
		return entities.Sessao{}, core.ErrProibido
	}
	u, err := s.repo.UsuarioDemo(ctx, perfil)
	if err != nil {
		return entities.Sessao{}, core.Invalido("Conta de demonstração não encontrada.")
	}
	return s.sessao(u)
}
