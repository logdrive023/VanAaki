// Package service — dados de demonstração (fictícios) para validar o app: a van do Tio Carlos,
// 3 escolas, 14 alunos em 3 turnos, histórico de pontos, mensalidades e as contas de teste.
package service

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"time"

	"github.com/google/uuid"
	"github.com/logdrive023/vanaaki/backend/internal/authentication"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/regras"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/repositorio"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/transmissao"
	contasvc "github.com/logdrive023/vanaaki/backend/internal/domains/conta/service"
	vansvc "github.com/logdrive023/vanaaki/backend/internal/domains/van/service"
	"github.com/logdrive023/vanaaki/backend/internal/models"
)

const (
	VanPrincipal = "van-carlos"
	SM, HZ, RL   = "esc-santa-maria", "esc-horizonte", "esc-roberto"
	AlunoPadrao  = "al-lucas"
	// Senha das contas de teste (aparece na tela de login da demonstração).
	SenhaDemo = "vanaaki123"
)

// Contas de teste: e-mail → perfil.
var Contas = []struct{ Email, Perfil, Nome string }{
	{"tio@demo.vanaaki.app", "motorista", "Tio Carlos"},
	{"familia@demo.vanaaki.app", "pais", "Rafael Andrade"},
	{"escola@demo.vanaaki.app", "escola", "Portaria Santa Maria"},
}

type Service struct {
	repo *repositorio.Repo
	tx   *transmissao.T
}

func New(r *repositorio.Repo, tx *transmissao.T) *Service { return &Service{repo: r, tx: tx} }

// Garantir cria os dados de exemplo se ainda não existem.
func (s *Service) Garantir(ctx context.Context) error {
	if _, err := s.repo.Van(ctx, VanPrincipal); err == nil {
		return nil
	}
	return s.Restaurar(ctx)
}

type alunoSeed struct {
	id, nome, apelido, serie, resp, end string
	lat, lng                            float64
	mens                                int
	escola                              string
	turno                               models.Turno
}

var alunos = []alunoSeed{
	{"al-ana", "Ana Souza", "Aninha", "3º ano", "Juliana Souza", "Rua Joaquim Távora, 410", -23.5958, -46.6318, 42000, SM, models.Manha},
	{"al-pedro", "Pedro Lima", "Pedrão", "5º ano", "Rodrigo Lima", "Rua Sena Madureira, 455", -23.5946, -46.6243, 42000, SM, models.Manha},
	{AlunoPadrao, "Lucas Andrade", "Luquinhas", "4º ano", "Rafael Andrade", "Rua Áurea, 88", -23.5922, -46.6289, 42000, SM, models.Manha},
	{"al-bia", "Beatriz Faria", "Bia", "1º EM", "Carla Faria", "Rua Machado de Assis, 230", -23.5903, -46.6232, 45000, SM, models.Manha},
	{"al-gabriel", "Gabriel Rocha", "Gabi", "2º ano", "Patrícia Rocha", "Rua Coronel Lisboa, 150", -23.5979, -46.6352, 42000, SM, models.Manha},
	{"al-maria", "Maria Clara Nunes", "Clarinha", "6º ano", "André Nunes", "Rua Humberto I, 702", -23.5895, -46.6304, 42000, SM, models.Manha},
	{"al-enzo", "Enzo Martins", "Enzão", "5º ano", "Fernanda Martins", "Rua Pelotas, 95", -23.5934, -46.6374, 42000, HZ, models.Manha},
	{"al-sofia", "Sofia Ribeiro", "Sofi", "4º ano", "Marcos Ribeiro", "Rua Rio Grande, 310", -23.5880, -46.6262, 42000, HZ, models.Manha},
	{"al-davi", "Davi Andrade", "Davizão", "3º ano", "Rafael Andrade", "Rua Áurea, 88", -23.5922, -46.6289, 42000, SM, models.Tarde},
	{"al-helena", "Helena Prado", "Lena", "2º ano", "Bruno Prado", "Rua Dona Inácia Uchoa, 300", -23.5970, -46.6271, 42000, SM, models.Tarde},
	{"al-theo", "Theo Almeida", "Theozinho", "7º ano", "Camila Almeida", "Rua Morgado de Mateus, 410", -23.5941, -46.6409, 39000, RL, models.Tarde},
	{"al-alice", "Alice Moura", "Lili", "8º ano", "Diego Moura", "Rua Embaú, 220", -23.5993, -46.6331, 39000, RL, models.Tarde},
	{"al-joao", "João Pedro Silva", "JP", "2º EM noturno", "Sandra Silva", "Rua França Pinto, 510", -23.5900, -46.6381, 38000, HZ, models.Noite},
	{"al-larissa", "Larissa Reis", "Lari", "3º EM noturno", "Paulo Reis", "Rua Afonso Celso, 640", -23.5956, -46.6236, 38000, HZ, models.Noite},
}

var cores = []string{"#6C5CE7", "#00B894", "#E17055", "#0984E3", "#D63384", "#F2811D", "#2D3436", "#00A8A8", "#8E44AD", "#C0392B"}

// Restaurar apaga a demonstração e cria de novo (não mexe nas contas de verdade).
func (s *Service) Restaurar(ctx context.Context) error {
	if err := s.repo.ApagarDemo(ctx); err != nil {
		return err
	}
	hoje := models.Hoje()
	mes := models.MesAtual()
	esc := []models.Escola{
		{ID: SM, Nome: "Colégio Santa Maria", Endereco: "Rua Domingos de Morais, 1.200 · Vila Mariana", Local: models.LatLng{Lat: -23.5861, Lng: -46.6338},
			Horarios: map[models.Turno]models.Horario{models.Manha: {Entrada: "07:15", Saida: "12:20"}, models.Tarde: {Entrada: "13:15", Saida: "18:00"}}, ConfirmaEntrada: true, Codigo: "SMARIA"},
		{ID: HZ, Nome: "Colégio Horizonte", Endereco: "Rua Vergueiro, 3.100 · Vila Mariana", Local: models.LatLng{Lat: -23.5822, Lng: -46.6403},
			Horarios: map[models.Turno]models.Horario{models.Manha: {Entrada: "07:30", Saida: "12:40"}, models.Noite: {Entrada: "19:00", Saida: "22:30"}}, Codigo: "HORIZ7"},
		{ID: RL, Nome: "EE Prof. Roberto Lima", Endereco: "Rua Loefgren, 800 · Vila Clementino", Local: models.LatLng{Lat: -23.5968, Lng: -46.6431},
			Horarios: map[models.Turno]models.Horario{models.Manha: {Entrada: "07:00", Saida: "12:00"}, models.Tarde: {Entrada: "13:00", Saida: "17:40"}}, Codigo: "RLIMA8"},
	}
	for _, e := range esc {
		if err := s.repo.SalvarEscola(ctx, e); err != nil {
			return err
		}
	}
	vans := []models.Van{
		{ID: VanPrincipal, Nome: "Tio Carlos Transportes", Motorista: "Tio Carlos", Telefone: "11 90000-0001", Placa: "FXK-2B19", Modelo: "Sprinter branca",
			Garagem: models.LatLng{Lat: -23.6003, Lng: -46.6263}, EscolaIDs: []string{SM, HZ, RL},
			Credenciamento: map[string]string{SM: "credenciada", HZ: "credenciada", RL: "credenciada"},
			Turnos:         []models.TurnoVan{{Turno: models.Manha, Ativo: true, EscolaIDs: []string{SM, HZ}}, {Turno: models.Tarde, Ativo: true, EscolaIDs: []string{SM, RL}}, {Turno: models.Noite, Ativo: true, EscolaIDs: []string{HZ}}},
			PrecoPadrao:    42000, Vagas: 12, Avaliacao: 4.9},
		{ID: "van-sandra", Nome: "Tia Sandra Escolar", Motorista: "Tia Sandra", Telefone: "11 90000-0002", Placa: "GHT-4C21", Modelo: "Master prata",
			Garagem: models.LatLng{Lat: -23.5800, Lng: -46.6300}, EscolaIDs: []string{SM, RL}, Credenciamento: map[string]string{SM: "credenciada", RL: "credenciada"},
			Turnos:  []models.TurnoVan{{Turno: models.Manha, Ativo: true, EscolaIDs: []string{SM, RL}}, {Turno: models.Tarde, Ativo: true, EscolaIDs: []string{SM}}, {Turno: models.Noite, Ativo: false, EscolaIDs: []string{}}},
			PrecoPadrao: 48000, Vagas: 1, Avaliacao: 5},
		{ID: "van-coop", Nome: "Coopervan Zona Sul", Motorista: "Cooperativa", Telefone: "11 90000-0003", Placa: "BRA-7E55", Modelo: "14 vans",
			Garagem: models.LatLng{Lat: -23.6100, Lng: -46.6400}, EscolaIDs: []string{SM, HZ, RL}, Credenciamento: map[string]string{SM: "pendente", HZ: "credenciada", RL: "credenciada"},
			Turnos:  []models.TurnoVan{{Turno: models.Manha, Ativo: true, EscolaIDs: []string{SM, HZ, RL}}, {Turno: models.Tarde, Ativo: true, EscolaIDs: []string{SM, HZ, RL}}, {Turno: models.Noite, Ativo: true, EscolaIDs: []string{HZ}}},
			PrecoPadrao: 39000, Vagas: 8, Avaliacao: 4.7},
	}
	for _, v := range vans {
		if err := s.repo.SalvarVan(ctx, v, true); err != nil {
			return err
		}
	}
	var lista []models.Aluno
	for i, x := range alunos {
		a := models.Aluno{ID: x.id, VanID: VanPrincipal, EscolaID: x.escola, Nome: x.nome, Apelido: x.apelido, Cor: cores[i%len(cores)], Serie: x.serie,
			Turno: x.turno, Responsavel: x.resp, TelefoneResp: fmt.Sprintf("11 9%04d-%04d", 1000+i*37, 2000+i*53), Endereco: x.end,
			Local: models.LatLng{Lat: x.lat, Lng: x.lng}, Mensalidade: x.mens, DiaVencimento: 10, Ativo: true, CriadoEm: models.AgoraIso(),
			CodigoFamilia: contasvc.Codigo(6), CodigoAluno: contasvc.Codigo(6)}
		if a.ID == "al-gabriel" {
			a.DiaVencimento = 28
		}
		if a.ID == AlunoPadrao {
			a.CodigoFamilia, a.CodigoAluno = "LUCAS1", "LUQUI1"
		}
		if err := s.repo.SalvarAluno(ctx, a); err != nil {
			return err
		}
		lista = append(lista, a)
	}

	// contas de teste
	hash, _ := authentication.HashSenha(SenhaDemo)
	tio := models.Usuario{ID: uuid.NewString(), Perfil: models.PerfilMotorista, Nome: "Tio Carlos", Email: Contas[0].Email, VanID: VanPrincipal, SenhaHash: hash, Demo: true}
	pais := models.Usuario{ID: uuid.NewString(), Perfil: models.PerfilPais, Nome: "Rafael Andrade", Email: Contas[1].Email, SenhaHash: hash, Demo: true}
	escola := models.Usuario{ID: uuid.NewString(), Perfil: models.PerfilEscola, Nome: "Portaria Santa Maria", Email: Contas[2].Email, EscolaID: SM, SenhaHash: hash, Demo: true}
	aluno := models.Usuario{ID: uuid.NewString(), Perfil: models.PerfilAluno, Nome: "Luquinhas", AlunoID: AlunoPadrao, Demo: true}
	for _, u := range []models.Usuario{tio, pais, escola, aluno} {
		if err := s.repo.CriarUsuario(ctx, u); err != nil {
			return err
		}
	}
	// a família de teste tem dois filhos (manhã e tarde)
	_ = s.repo.VincularFamilia(ctx, pais.ID, AlunoPadrao)
	_ = s.repo.VincularFamilia(ctx, pais.ID, "al-davi")

	// mensalidades: mês passado pagas; este mês 2 pendentes (1 atrasada)
	t, _ := time.Parse("2006-01", mes)
	mesPassado := t.AddDate(0, -1, 0).Format("2006-01")
	for _, a := range lista {
		p := vansvc.NovaCobranca(a, mesPassado)
		p.Status, p.PagoEm, p.Metodo = "pago", mesPassado+"-08T10:00:00.000Z", "pix"
		_ = s.repo.SalvarPagamento(ctx, p)
		q := vansvc.NovaCobranca(a, mes)
		if a.ID != "al-bia" && a.ID != "al-gabriel" {
			q.Status, q.PagoEm, q.Metodo = "pago", mes+"-05T10:00:00.000Z", "pix"
		}
		_ = s.repo.SalvarPagamento(ctx, q)
	}

	// combinados de hoje
	for _, p := range []models.Presenca{
		{ID: "al-gabriel|" + hoje, AlunoID: "al-gabriel", Data: hoje, Ida: false, Volta: false, Motivo: "Está com febre", AvisadoEm: models.AgoraIso()},
		{ID: "al-ana|" + hoje, AlunoID: "al-ana", Data: hoje, Ida: false, Volta: true, Motivo: "Consulta no dentista cedo", AvisadoEm: models.AgoraIso()},
		{ID: "al-davi|" + hoje, AlunoID: "al-davi", Data: hoje, Ida: true, Volta: false, Motivo: "Vou buscar para o futebol", AvisadoEm: models.AgoraIso()},
	} {
		_ = s.repo.SalvarPresenca(ctx, p)
	}

	// histórico de pontos (últimas 4 semanas úteis)
	r := rand.New(rand.NewSource(42))
	n := 0
	add := func(alunoID, data, tipo, obs string) {
		t := regras.TipoDe(tipo)
		autor := "motorista"
		if t.Grupo == "auto" {
			autor = "sistema"
		}
		n++
		_, _ = s.repo.InserirPontos(ctx, models.EventoPontos{ID: uuid.NewString(), AlunoID: alunoID, VanID: VanPrincipal, Data: data,
			CriadoEm: fmt.Sprintf("%sT10:%02d:00.000Z", data, n%60), Tipo: tipo, Pontos: t.Pontos, Descricao: t.Nome, Observacao: obs, Autor: autor})
	}
	perfil := map[string]float64{"al-ana": 0.8, "al-pedro": 0.6, AlunoPadrao: 0.75, "al-bia": 0.5, "al-gabriel": 0.65, "al-maria": 0.85, "al-enzo": 0.4, "al-sofia": 0.9}
	dia := func(k int) string { return models.Agora().AddDate(0, 0, -k).Format("2006-01-02") }
	for k := 28; k >= 1; k-- {
		d := models.Agora().AddDate(0, 0, -k)
		if d.Weekday() == time.Saturday || d.Weekday() == time.Sunday {
			continue
		}
		data := d.Format("2006-01-02")
		for _, a := range lista {
			x := r.Float64()
			pf, ok := perfil[a.ID]
			if !ok {
				pf = 0.7
			}
			switch {
			case x < 0.04:
				add(a.ID, data, "ausente_sem_aviso", "")
			case x < 0.08:
				add(a.ID, data, "aviso_ausencia", "")
			case r.Float64() < pf:
				add(a.ID, data, "pronto_portao", "")
			default:
				add(a.ID, data, "embarque", "")
			}
			if r.Float64() < 0.12 {
				add(a.ID, data, "cinto", "")
			}
			if r.Float64() < 0.06 {
				add(a.ID, data, "educado", "")
			}
			if r.Float64() < 0.03 {
				add(a.ID, data, "ajudou", "")
			}
		}
	}
	add("al-enzo", dia(6), "bagunca", "Gritando com os colegas no trânsito")
	add("al-enzo", dia(2), "bagunca", "")
	add("al-pedro", dia(4), "sem_cinto", "Tirou o cinto duas vezes")
	add(AlunoPadrao, dia(3), "ajudou", "Ajudou a Aninha com a mochila")
	add("al-sofia", dia(7), "semana_perfeita", "")

	premios := []models.Recompensa{
		{ID: "rec-0", Icone: "🎵", Nome: "Escolher a música da viagem", Custo: 40}, {ID: "rec-1", Icone: "🪟", Nome: "Sentar na janela por 1 semana", Custo: 30},
		{ID: "rec-2", Icone: "🧑‍✈️", Nome: "Ajudante do tio por um dia", Custo: 80}, {ID: "rec-3", Icone: "🍭", Nome: "Pirulito surpresa", Custo: 25},
		{ID: "rec-4", Icone: "🏅", Nome: "Medalha de destaque do mês", Custo: 150},
	}
	for _, p := range premios {
		p.VanID, p.Ativo = VanPrincipal, true
		_ = s.repo.SalvarRecompensa(ctx, p)
	}
	_ = s.repo.SalvarResgate(ctx, models.Resgate{ID: uuid.NewString(), AlunoID: "al-pedro", RecompensaID: "rec-1", Nome: premios[1].Nome, Icone: "🪟",
		Custo: 30, Status: "pendente", CriadoEm: models.AgoraIso()})

	ontem := dia(1)
	for _, m := range []models.Mensagem{
		{ID: uuid.NewString(), AlunoID: AlunoPadrao, De: "pais", Texto: "Bom dia, tio! Sexta o Lucas sai 11h por causa da feira de ciências.", CriadoEm: ontem + "T12:12:00.000Z", Lida: true},
		{ID: uuid.NewString(), AlunoID: AlunoPadrao, De: "motorista", Texto: "Combinado! Passo na escola às 11h10.", CriadoEm: ontem + "T12:30:00.000Z", Lida: true},
		{ID: uuid.NewString(), AlunoID: "al-maria", De: "pais", Texto: "Amanhã a Clara vai dormir na avó, pode buscar na Rua Vergueiro, 2.000?", CriadoEm: models.AgoraIso()},
	} {
		_ = s.repo.InserirMensagem(ctx, m)
	}
	for _, x := range []models.Notificacao{
		{Para: "motorista", VanID: VanPrincipal, Icone: "🙋", Titulo: "Gabriel não vai hoje", Texto: "Motivo: Está com febre"},
		{Para: "motorista", VanID: VanPrincipal, Icone: "🎁", Titulo: "Pedido de prêmio", Texto: "Pedro quer \"Sentar na janela por 1 semana\" (30 ⭐)"},
		{Para: "pais", AlunoID: AlunoPadrao, Icone: "🤝", Titulo: "Elogio do tio: Ajudou um colega", Texto: "Lucas ganhou +10 pontos · \"Ajudou a Aninha com a mochila\"", Lida: true},
		{Para: "escola", EscolaID: SM, Icone: "📝", Titulo: "Credenciamento pendente", Texto: "Coopervan Zona Sul pediu credenciamento"},
	} {
		x.ID, x.CriadoEm = uuid.NewString(), models.AgoraIso()
		_ = s.repo.InserirNotificacao(ctx, x)
	}
	// trajetos das últimas semanas (relatório de fiscalização / PL 1240/2026)
	mapaEsc := map[string]models.Escola{}
	for _, e := range esc {
		mapaEsc[e.ID] = e
	}
	nv, err := s.historicoDemo(ctx, vans[0], lista, mapaEsc, 21)
	if err != nil {
		log.Printf("histórico de trajetos da demonstração: %v", err)
	}
	log.Printf("dados de demonstração criados (%d eventos de pontos, %d viagens no histórico)", n, nv)
	s.tx.Van(ctx, VanPrincipal)
	return nil
}
