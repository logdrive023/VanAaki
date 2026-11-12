// Package service — mensalidades: cobranças do mês, pagamento (Pix pelos pais ou baixa pelo tio).
package service

import (
	"context"

	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/avisos"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/regras"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/repositorio"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/transmissao"
	"github.com/logdrive023/vanaaki/backend/internal/core"
	vansvc "github.com/logdrive023/vanaaki/backend/internal/domains/van/service"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

var meses = []string{"Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"}

func nomeMes(mes string) string {
	if len(mes) == 7 {
		m := int(mes[5]-'0')*10 + int(mes[6]-'0')
		if m >= 1 && m <= 12 {
			return meses[m-1]
		}
	}
	return mes
}

// Reais 42000 → "R$ 420,00".
func Reais(c int) string {
	inteiro, cent := c/100, c%100
	s := ""
	n := inteiro
	if n == 0 {
		s = "0"
	}
	for i := 0; n > 0; i++ {
		if i > 0 && i%3 == 0 {
			s = "." + s
		}
		s = string(rune('0'+n%10)) + s
		n /= 10
	}
	return "R$ " + s + "," + string(rune('0'+cent/10)) + string(rune('0'+cent%10))
}

type Service interface {
	Pagar(ctx context.Context, e models.Escopo, id, metodo string) error
	Desfazer(ctx context.Context, e models.Escopo, id string) error
	GerarCobrancas(ctx context.Context, e models.Escopo, mes string) (int, error)
}

type service struct {
	repo *repositorio.Repo
	av   *avisos.Avisos
	tx   *transmissao.T
}

func New(r *repositorio.Repo, av *avisos.Avisos, tx *transmissao.T) Service {
	return &service{repo: r, av: av, tx: tx}
}

func (s *service) carregar(ctx context.Context, e models.Escopo, id string) (models.Pagamento, models.Aluno, error) {
	p, err := s.repo.Pagamento(ctx, id)
	if err != nil {
		return p, models.Aluno{}, err
	}
	a, err := s.repo.Aluno(ctx, p.AlunoID)
	if err != nil {
		return p, a, err
	}
	tio := e.Usuario.Perfil == models.PerfilMotorista && e.TemVan(a.VanID)
	pais := e.Usuario.Perfil == models.PerfilPais && e.TemAluno(a.ID)
	if !tio && !pais {
		return p, a, core.ErrProibido
	}
	return p, a, nil
}

func (s *service) Pagar(ctx context.Context, e models.Escopo, id, metodo string) error {
	if metodo != "pix" && metodo != "dinheiro" && metodo != "cartao" {
		return core.Invalido("Forma de pagamento inválida.")
	}
	p, a, err := s.carregar(ctx, e, id)
	if err != nil {
		return err
	}
	if p.Status == "pago" {
		return nil
	}
	p.Status, p.PagoEm, p.Metodo = "pago", models.AgoraIso(), metodo
	if err := s.repo.SalvarPagamento(ctx, p); err != nil {
		return err
	}
	if e.Usuario.Perfil == models.PerfilPais {
		_ = s.av.Motorista(ctx, a.VanID, "💰", "Pagamento recebido", regras.PrimeiroNome(a.Nome)+" · "+nomeMes(p.Mes)+" · "+Reais(p.Valor)+" ("+metodo+")")
	} else {
		_ = s.av.Pais(ctx, a.ID, "🧾", "Pagamento confirmado", nomeMes(p.Mes)+" · "+Reais(p.Valor)+". Obrigado!")
	}
	s.tx.Van(ctx, a.VanID)
	return nil
}

func (s *service) Desfazer(ctx context.Context, e models.Escopo, id string) error {
	if e.Usuario.Perfil != models.PerfilMotorista {
		return core.ErrProibido
	}
	p, a, err := s.carregar(ctx, e, id)
	if err != nil {
		return err
	}
	p.Status, p.PagoEm, p.Metodo = "pendente", "", ""
	if err := s.repo.SalvarPagamento(ctx, p); err != nil {
		return err
	}
	s.tx.Van(ctx, a.VanID)
	return nil
}

// GerarCobrancas cria as cobranças do mês para os alunos ativos que ainda não têm.
func (s *service) GerarCobrancas(ctx context.Context, e models.Escopo, mes string) (int, error) {
	if e.Usuario.Perfil != models.PerfilMotorista || len(mes) != 7 {
		return 0, core.Invalido("Mês inválido.")
	}
	alunos, err := s.repo.AlunosDasVans(ctx, e.VanIDs)
	if err != nil {
		return 0, err
	}
	n := 0
	for _, a := range alunos {
		if !a.Ativo {
			continue
		}
		if ok, _ := s.repo.ExistePagamento(ctx, a.ID, mes); ok {
			continue
		}
		if err := s.repo.SalvarPagamento(ctx, vansvc.NovaCobranca(a, mes)); err != nil {
			return n, err
		}
		_ = s.av.Pais(ctx, a.ID, "🧾", "Mensalidade de "+nomeMes(mes)+" disponível", Reais(a.Mensalidade)+" · vence dia "+itoa(a.DiaVencimento))
		n++
	}
	s.tx.Van(ctx, e.VanIDs[0])
	return n, nil
}

func itoa(n int) string {
	if n < 10 {
		return string(rune('0' + n))
	}
	return string(rune('0'+n/10)) + string(rune('0'+n%10))
}
