// Package service — regras da viagem (ida/volta com várias escolas), igual ao app:
//
//	ida   = garagem → casas (ordem otimizada ou rota fixa) → escolas (ordem do horário de ENTRADA)
//	volta = escolas (ordem do horário de SAÍDA) → casas → garagem
//
// Toda escola é uma parada, igual às casas. A posição vem do GPS do celular do tio ou,
// no modo demonstração, o próprio servidor anda com a van pelas ruas.
package service

import (
	"context"
	"fmt"
	"log"
	"math"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/avisos"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/regras"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/repositorio"
	"github.com/logdrive023/vanaaki/backend/internal/compartilhado/transmissao"
	"github.com/logdrive023/vanaaki/backend/internal/core"
	"github.com/logdrive023/vanaaki/backend/internal/domains/viagem/entities"
	"github.com/logdrive023/vanaaki/backend/internal/models"
	"github.com/logdrive023/vanaaki/backend/pkg/geo"
	"github.com/logdrive023/vanaaki/backend/pkg/osrm"
)

// Tempo que a van espera na parada no modo automático (demonstração).
const esperaAuto = 2500 * time.Millisecond

// Distância (m) do GPS até a parada para considerar que chegou.
const raioChegada = 45.0

// Distância (m) da parada para considerar que a van saiu dela (confirmação automática pelo GPS).
const raioSaida = 90.0

type Service interface {
	Iniciar(ctx context.Context, e models.Escopo, req entities.IniciarRequest) (models.Viagem, error)
	MarcarParada(ctx context.Context, e models.Escopo, viagemID, status string) error
	MarcarPronto(ctx context.Context, e models.Escopo, alunoID string) error
	Encerrar(ctx context.Context, e models.Escopo, viagemID string) error
	Configurar(ctx context.Context, e models.Escopo, viagemID string, req entities.ConfigurarRequest) error
	Posicao(ctx context.Context, e models.Escopo, viagemID string, pos models.LatLng) error
	// PosicoesLote: posições que o celular guardou sem internet (vão para o histórico; a última move a van)
	PosicoesLote(ctx context.Context, e models.Escopo, viagemID string, pts []models.PontoTrajeto) error
	ConfirmarEntrada(ctx context.Context, e models.Escopo, viagemID string, alunoIDs []string) error
	AjustarPorPresenca(ctx context.Context, alunoID string) error
	Simular(ctx context.Context)
}

type service struct {
	repo *repositorio.Repo
	av   *avisos.Avisos
	tx   *transmissao.T
	osrm *osrm.Cliente
	// uma alteração de viagem por vez (GPS, botões do tio e simulação mexem na mesma linha)
	mu sync.Mutex
	// última posição gravada no histórico, por viagem (grava no máximo a cada intervaloRegistro)
	muReg    sync.Mutex
	gravados map[string]time.Time
}

// Intervalo mínimo entre duas posições gravadas no histórico de trajetos (PL 1240/2026).
const intervaloRegistro = 4 * time.Second

// registrar guarda a posição no histórico de trajetos (com horário), sem repetir em menos de intervaloRegistro.
func (s *service) registrar(ctx context.Context, v models.Viagem, pos models.LatLng, origem string, forcar bool) {
	s.muReg.Lock()
	ult, ok := s.gravados[v.ID]
	if !forcar && ok && time.Since(ult) < intervaloRegistro {
		s.muReg.Unlock()
		return
	}
	s.gravados[v.ID] = time.Now()
	if v.Status != "em_andamento" {
		delete(s.gravados, v.ID)
	}
	s.muReg.Unlock()
	if err := s.repo.InserirPosicoes(ctx, v.ID, v.VanID, origem, []models.PontoTrajeto{{Lat: pos.Lat, Lng: pos.Lng, Em: models.AgoraIso()}}); err != nil {
		log.Printf("histórico de trajeto: %v", err)
	}
}

func origemDe(v models.Viagem) string {
	if v.Simulado {
		return "simulacao"
	}
	return "gps"
}

func New(r *repositorio.Repo, av *avisos.Avisos, tx *transmissao.T, o *osrm.Cliente) Service {
	return &service{repo: r, av: av, tx: tx, osrm: o, gravados: map[string]time.Time{}}
}

// ---------------- locais ----------------

type locais = transmissao.Locais

func localDe(p models.Parada, L locais) models.LatLng {
	if p.Tipo == "aluno" {
		return L.Alunos[p.AlunoID].Local
	}
	return L.Escolas[p.EscolaID].Local
}

func paradaAluno(a models.Aluno) models.Parada {
	return models.Parada{Tipo: "aluno", AlunoID: a.ID, EscolaID: a.EscolaID, Status: "pendente"}
}
func paradaEscola(e models.Escola) models.Parada {
	return models.Parada{Tipo: "escola", EscolaID: e.ID, Status: "pendente"}
}

// ---------------- planejamento ----------------

// participantes = alunos e escolas do turno/trecho, respeitando "só ida", "só volta" e "não vai".
func (s *service) participantes(ctx context.Context, van models.Van, turno models.Turno, tipo string) ([]models.Aluno, []models.Escola, error) {
	cfg := van.TurnoCfg(turno)
	if cfg == nil || !cfg.Ativo {
		return nil, nil, core.Invalido("Esse turno não está ativo na sua van.")
	}
	todos, err := s.repo.AlunosDasVans(ctx, []string{van.ID})
	if err != nil {
		return nil, nil, err
	}
	ids := make([]string, 0, len(todos))
	for _, a := range todos {
		ids = append(ids, a.ID)
	}
	pres, err := s.repo.PresencasDoDia(ctx, models.Hoje(), ids)
	if err != nil {
		return nil, nil, err
	}
	mp := map[string]*models.Presenca{}
	for i := range pres {
		mp[pres[i].AlunoID] = &pres[i]
	}
	var alunos []models.Aluno
	usadas := []string{}
	for _, a := range todos {
		if a.Ativo && a.Turno == turno && models.Contem(cfg.EscolaIDs, a.EscolaID) && regras.VaiNoTrecho(mp[a.ID], tipo) {
			alunos = append(alunos, a)
			if !models.Contem(usadas, a.EscolaID) {
				usadas = append(usadas, a.EscolaID)
			}
		}
	}
	escolas, err := s.repo.EscolasPorIDs(ctx, usadas)
	if err != nil {
		return nil, nil, err
	}
	return alunos, regras.OrdenarEscolas(escolas, turno, tipo), nil
}

type plano struct {
	paradas    []models.Parada
	trechos    map[string][]models.LatLng
	real       bool
	economiaKm float64
}

func montarParadas(tipo string, casas []models.Parada, escolas []models.Escola) []models.Parada {
	esc := make([]models.Parada, 0, len(escolas))
	for _, e := range escolas {
		esc = append(esc, paradaEscola(e))
	}
	if tipo == "ida" {
		return append(casas, esc...)
	}
	return append(esc, casas...)
}

func (s *service) planejar(ctx context.Context, tipo string, inicio models.LatLng, alunos []models.Aluno, escolas []models.Escola, destino models.LatLng, otimizar bool) plano {
	de, ate := inicio, destino
	if tipo == "ida" {
		ate = escolas[0].Local
	} else {
		de = escolas[len(escolas)-1].Local
	}
	locs := make([]models.LatLng, len(alunos))
	for i, a := range alunos {
		locs[i] = a.Local
	}
	ordem := make([]int, len(alunos))
	for i := range ordem {
		ordem[i] = i
	}
	base := ordem
	if otimizar && len(alunos) > 1 {
		if o := s.osrm.Otimizar(ctx, de, locs, ate); o != nil {
			ordem = o
		} else {
			ordem = geo.OtimizarOrdem(de, locs, ate)
		}
	}
	casas := make([]models.Parada, 0, len(alunos))
	for _, i := range ordem {
		casas = append(casas, paradaAluno(alunos[i]))
	}
	paradas := montarParadas(tipo, casas, escolas)
	L := locais{Alunos: map[string]models.Aluno{}, Escolas: map[string]models.Escola{}}
	for _, a := range alunos {
		L.Alunos[a.ID] = a
	}
	for _, e := range escolas {
		L.Escolas[e.ID] = e
	}
	pts := []models.LatLng{inicio}
	for _, p := range paradas {
		pts = append(pts, localDe(p, L))
	}
	pts = append(pts, destino)
	tr, real := s.osrm.Tracar(ctx, pts)
	trechos := map[string][]models.LatLng{}
	for i, p := range paradas {
		trechos[regras.ChaveParada(p)] = tr[i]
	}
	trechos[regras.Destino] = tr[len(paradas)]
	eco := 0.0
	if otimizar {
		bpts := []models.LatLng{inicio}
		casasBase := make([]models.Parada, 0, len(alunos))
		for _, i := range base {
			casasBase = append(casasBase, paradaAluno(alunos[i]))
		}
		for _, p := range montarParadas(tipo, casasBase, escolas) {
			bpts = append(bpts, localDe(p, L))
		}
		bpts = append(bpts, destino)
		eco = math.Max(0, (geo.CompCaminho(bpts)-geo.CompCaminho(pts))/1000)
	}
	return plano{paradas: paradas, trechos: trechos, real: real, economiaKm: eco}
}

func ordenarPorFixa(alunos []models.Aluno, ordem []string) []models.Aluno {
	pos := map[string]int{}
	for i, id := range ordem {
		pos[id] = i
	}
	out := append([]models.Aluno(nil), alunos...)
	chave := func(a models.Aluno) int {
		if p, ok := pos[a.ID]; ok {
			return p
		}
		return 1 << 20
	}
	for i := 1; i < len(out); i++ { // ordenação estável simples
		for j := i; j > 0 && chave(out[j]) < chave(out[j-1]); j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}

// ---------------- permissões ----------------

func (s *service) viagemDoTio(ctx context.Context, e models.Escopo, id string) (models.Viagem, error) {
	v, err := s.repo.Viagem(ctx, id)
	if err != nil {
		return v, err
	}
	if e.Usuario.Perfil != models.PerfilMotorista || !e.TemVan(v.VanID) {
		return v, core.ErrProibido
	}
	return v, nil
}

// ---------------- iniciar ----------------

func (s *service) Iniciar(ctx context.Context, e models.Escopo, req entities.IniciarRequest) (models.Viagem, error) {
	if len(e.VanIDs) == 0 || (req.Tipo != "ida" && req.Tipo != "volta") || !req.Turno.Valido() {
		return models.Viagem{}, core.Invalido("Escolha o turno e se é ida ou volta.")
	}
	van, err := s.repo.Van(ctx, e.VanIDs[0])
	if err != nil {
		return models.Viagem{}, err
	}
	alunos, escolas, err := s.participantes(ctx, van, req.Turno, req.Tipo)
	if err != nil {
		return models.Viagem{}, err
	}
	if len(alunos) == 0 {
		return models.Viagem{}, core.Invalido(fmt.Sprintf("Nenhum aluno vai de van na %s deste turno.", req.Tipo))
	}
	otimizar := req.Otimizar
	rf, fixa := van.RotasFixas[string(req.Turno)+"|"+req.Tipo]
	fixa = fixa && rf.Ativa
	if fixa {
		alunos, otimizar = ordenarPorFixa(alunos, rf.Ordem), false
	}
	inicio, destino, destinoNome := van.Garagem, escolas[len(escolas)-1].Local, escolas[len(escolas)-1].Nome
	if req.Tipo == "volta" {
		inicio, destino, destinoNome = escolas[0].Local, van.Garagem, "Garagem"
	}
	p := s.planejar(ctx, req.Tipo, inicio, alunos, escolas, destino, otimizar)
	vel := req.Velocidade
	if vel <= 0 {
		vel = 1
	}
	escIDs := make([]string, len(escolas))
	for i, x := range escolas {
		escIDs[i] = x.ID
	}
	v := models.Viagem{
		ID: uuid.NewString(), VanID: van.ID, Data: models.Hoje(), Tipo: req.Tipo, Turno: req.Turno, Status: "em_andamento",
		EscolaIDs: escIDs, Inicio: inicio, Destino: destino, DestinoNome: destinoNome, Paradas: p.paradas, Alvo: 0, Pos: inicio,
		Caminho: append([]models.LatLng(nil), p.trechos[regras.ChaveParada(p.paradas[0])]...), Trechos: p.trechos, RotaReal: p.real,
		Rastro: []models.LatLng{inicio}, Automatico: req.Automatico, Simulado: req.Simulado, Velocidade: vel,
		IniciadaEm: models.AgoraIso(), Avisados: []string{}, EconomiaKm: p.economiaKm, Fixa: fixa, AtualizadoEm: models.AgoraIso(),
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	antigas, _ := s.repo.ViagensAtivasDaVan(ctx, van.ID)
	for _, a := range antigas {
		a.Status = "cancelada"
		_ = s.repo.SalvarViagem(ctx, a)
	}
	t := models.NomeTurno[req.Turno]
	for _, a := range alunos {
		var esc models.Escola
		for _, x := range escolas {
			if x.ID == a.EscolaID {
				esc = x
			}
		}
		nome := regras.PrimeiroNome(a.Nome)
		if req.Tipo == "ida" {
			_ = s.av.Pais(ctx, a.ID, "🚐", fmt.Sprintf("%s saiu para a rota da %s", van.Motorista, lower(t)), "Você será avisado quando "+nome+" for o próximo.")
		} else {
			_ = s.av.Pais(ctx, a.ID, "🚐", van.Motorista+" está indo buscar na escola", esc.Nome+". Avisamos quando "+nome+" sair e quando for a vez da sua casa.")
		}
	}
	for _, x := range escolas {
		n := 0
		for _, a := range alunos {
			if a.EscolaID == x.ID {
				n++
			}
		}
		tit := fmt.Sprintf("Van de %s saiu (%s)", van.Motorista, lower(t))
		if req.Tipo == "volta" {
			tit = fmt.Sprintf("Van de %s vindo buscar (%s)", van.Motorista, lower(t))
		}
		_ = s.av.Escola(ctx, x.ID, "🚐", tit, plural(n, "aluno")+" desta escola")
	}
	L := s.tx.Locais(ctx, &v)
	s.avisarProximo(ctx, &v, L)
	if err := s.repo.SalvarViagem(ctx, v); err != nil {
		return v, err
	}
	s.registrar(ctx, v, inicio, origemDe(v), true)
	s.tx.Van(ctx, van.ID)
	s.tx.Viagem(ctx, v, false)
	return v, nil
}

func lower(s string) string {
	switch s {
	case "Manhã":
		return "manhã"
	case "Tarde":
		return "tarde"
	case "Noite":
		return "noite"
	}
	return s
}

func plural(n int, palavra string) string {
	if n == 1 {
		return fmt.Sprintf("1 %s", palavra)
	}
	return fmt.Sprintf("%d %ss", n, palavra)
}

// ---------------- andamento ----------------

func avancarAlvo(v *models.Viagem, vanJaChegou bool) {
	v.Alvo = regras.ProximoAlvo(v)
	trecho := v.Trechos[regras.ChaveAlvo(v, v.Alvo)]
	if vanJaChegou {
		v.Caminho = append([]models.LatLng(nil), trecho...)
	} else {
		v.Caminho = append(v.Caminho, trecho...)
	}
}

// pularEscolasVazias: escola sem ninguém para deixar/buscar sai da rota.
func pularEscolasVazias(v *models.Viagem) bool {
	pulou := false
	for i := range v.Paradas {
		e := &v.Paradas[i]
		if e.Tipo != "escola" || e.Status != "pendente" {
			continue
		}
		tem := false
		for _, p := range v.Paradas {
			if p.Tipo == "aluno" && p.EscolaID == e.EscolaID && ((v.Tipo == "ida" && p.Status != "ausente") || (v.Tipo == "volta" && p.Status == "pendente")) {
				tem = true
				break
			}
		}
		if !tem {
			e.Status, e.Hora, pulou = "ausente", models.AgoraIso(), true
		}
	}
	return pulou
}

// avisarProximo: a família de quem é o próximo alvo recebe o aviso (uma vez por viagem).
func (s *service) avisarProximo(ctx context.Context, v *models.Viagem, L locais) {
	if v.Alvo >= len(v.Paradas) {
		return
	}
	p := v.Paradas[v.Alvo]
	if p.Status != "pendente" {
		return
	}
	if p.Tipo == "escola" {
		k := regras.ChaveParada(p)
		if v.Tipo == "volta" && !models.Contem(v.Avisados, k) {
			v.Avisados = append(v.Avisados, k)
			for _, x := range v.Paradas {
				if x.Tipo == "aluno" && x.EscolaID == p.EscolaID && x.Status == "pendente" {
					a := L.Alunos[x.AlunoID]
					_ = s.av.Pais(ctx, a.ID, "🏫", "O tio está indo para "+L.Escolas[p.EscolaID].Nome, "Vai buscar "+regras.PrimeiroNome(a.Nome)+". Dá para ver a van no mapa.")
				}
			}
		}
		return
	}
	// o tio escolhe com quantas paradas de antecedência a família é avisada (1 = quando é o próximo)
	antecedencia := 1
	if van, err := s.repo.Van(ctx, v.VanID); err == nil {
		antecedencia = van.Config.Normalizar().AvisoParadas
	}
	faltam := 0
	for i := v.Alvo; i < len(v.Paradas) && faltam < antecedencia; i++ {
		q := v.Paradas[i]
		if q.Status != "pendente" {
			continue
		}
		if q.Tipo != "aluno" {
			if v.Tipo == "ida" {
				break // depois das casas vêm as escolas
			}
			continue
		}
		if !models.Contem(v.Avisados, q.AlunoID) {
			s.avisarFamilia(ctx, v, L, q.AlunoID, faltam)
		}
		faltam++
	}
}

// avisarFamilia: "é o próximo" (antes = 0) ou "faltam N paradas" (aviso antecipado).
func (s *service) avisarFamilia(ctx context.Context, v *models.Viagem, L locais, alunoID string, antes int) {
	if antes == 0 {
		v.Avisados = append(v.Avisados, alunoID)
	}
	a := L.Alunos[alunoID]
	nome := regras.PrimeiroNome(a.Nome)
	if antes > 0 {
		chave := fmt.Sprintf("pre:%s:%d", alunoID, antes)
		if models.Contem(v.Avisados, chave) {
			return
		}
		v.Avisados = append(v.Avisados, chave)
		if v.Tipo == "ida" {
			_ = s.av.Pais(ctx, a.ID, "⏳", fmt.Sprintf("A van está a %s de %s", plural(antes, "parada"), nome), "Pode ir se preparando. Avisamos quando for o próximo.")
			_ = s.av.Aluno(ctx, a.ID, "🎒", "A van já está vindo", fmt.Sprintf("Faltam %s até você. Arruma a mochila!", plural(antes, "parada")))
		} else {
			_ = s.av.Familia(ctx, a.ID, "⏳", fmt.Sprintf("%s chega em casa daqui a %s", nome, plural(antes, "parada")), "Avisamos quando for o próximo.", true)
		}
		return
	}
	if v.Tipo == "ida" {
		_ = s.av.Pais(ctx, a.ID, "🔔", nome+" é o próximo a ser buscado!", "Agora você pode ver a van chegando no mapa.")
		_ = s.av.Aluno(ctx, a.ID, "🎒", "Você é o próximo!", "Pega a mochila e vai pro portão ⏰ (+10 pontos se estiver lá antes da van)")
	} else {
		_ = s.av.Familia(ctx, a.ID, "🏠", nome+" é o próximo a ser entregue!", "Acompanhe a van chegando no mapa.", true)
	}
}

// concluirParada: efeito de confirmar a parada atual (botão do tio ou automático). true = precisa retraçar.
func (s *service) concluirParada(ctx context.Context, v *models.Viagem, L locais, status string) bool {
	p := &v.Paradas[v.Alvo]
	vanJaChegou := v.NaParada
	p.Status, p.Hora, v.NaParada = status, models.AgoraIso(), false
	van, _ := s.repo.Van(ctx, v.VanID)
	if p.Tipo == "aluno" {
		a := L.Alunos[p.AlunoID]
		nome := regras.PrimeiroNome(a.Nome)
		escola := L.Escolas[a.EscolaID].Nome
		chave := fmt.Sprintf("auto|%s|%s|%s", a.ID, v.Data, v.Turno)
		if v.Tipo == "ida" {
			if status == "feito" {
				_ = s.av.Pais(ctx, a.ID, "✅", fmt.Sprintf("%s embarcou às %s", nome, regras.Hora(p.Hora)), "Destino: "+escola+". Avisamos quando chegar.")
				tipo := "embarque"
				if p.ProntoEm != "" {
					tipo = "pronto_portao"
				}
				_ = s.av.DarPontos(ctx, a, tipo, "sistema", "", chave)
			} else {
				_ = s.av.Pais(ctx, a.ID, "🚫", "O tio passou e "+nome+" não estava", "Se não for, avise pelo app antes da rota (não perde ponto).")
				_ = s.av.DarPontos(ctx, a, "ausente_sem_aviso", "sistema", "", chave)
			}
		} else if status == "feito" {
			_ = s.av.Pais(ctx, a.ID, "🏠", nome+" foi entregue em casa", "Às "+regras.Hora(p.Hora)+". Até amanhã!")
		}
	} else if status == "feito" {
		e := L.Escolas[p.EscolaID]
		if v.Tipo == "ida" {
			n := 0
			for _, k := range v.Paradas {
				if k.Tipo == "aluno" && k.EscolaID == e.ID && k.Status == "feito" {
					n++
					a := L.Alunos[k.AlunoID]
					quem := "entregue pelo tio no portão"
					if e.ConfirmaEntrada {
						quem = "a portaria confirma a entrada"
					}
					_ = s.av.Familia(ctx, a.ID, "🏫", regras.PrimeiroNome(a.Nome)+" chegou na escola", fmt.Sprintf("%s às %s · %s", e.Nome, regras.Hora(p.Hora), quem), true)
				}
			}
			txt := "Entregues pelo tio às " + regras.Hora(p.Hora)
			if e.ConfirmaEntrada {
				txt = "Confirme a entrada de cada um na portaria"
			}
			_ = s.av.Escola(ctx, e.ID, "🚐", fmt.Sprintf("Van de %s deixou %s", van.Motorista, plural(n, "aluno")), txt)
		} else {
			n := 0
			for _, k := range v.Paradas {
				if k.Tipo == "aluno" && k.EscolaID == e.ID && k.Status == "pendente" {
					n++
					a := L.Alunos[k.AlunoID]
					_ = s.av.Familia(ctx, a.ID, "🚐", regras.PrimeiroNome(a.Nome)+" saiu da escola com o tio", "Às "+regras.Hora(p.Hora)+". Avisamos quando for a vez da sua casa.", true)
				}
			}
			_ = s.av.Escola(ctx, e.ID, "👋", fmt.Sprintf("Van de %s saiu com %s", van.Motorista, plural(n, "aluno")), "Às "+regras.Hora(p.Hora))
		}
	}
	pulou := pularEscolasVazias(v)
	avancarAlvo(v, vanJaChegou)
	s.avisarProximo(ctx, v, L)
	v.AtualizadoEm = models.AgoraIso()
	return pulou
}

func (s *service) MarcarParada(ctx context.Context, e models.Escopo, viagemID, status string) error {
	if status != "feito" && status != "ausente" {
		return core.Invalido("Status inválido.")
	}
	s.mu.Lock()
	v, err := s.viagemDoTio(ctx, e, viagemID)
	if err != nil {
		s.mu.Unlock()
		return err
	}
	if v.Status != "em_andamento" || v.Alvo >= len(v.Paradas) {
		s.mu.Unlock()
		return core.Invalido("Não há parada para confirmar.")
	}
	retracar := s.concluirParada(ctx, &v, s.tx.Locais(ctx, &v), status)
	err = s.repo.SalvarViagem(ctx, v)
	s.mu.Unlock()
	if err != nil {
		return err
	}
	s.tx.Van(ctx, v.VanID)
	s.tx.Viagem(ctx, v, false)
	if retracar {
		go s.retracar(context.Background(), v.ID)
	}
	return nil
}

// MarcarPronto: o aluno avisa "estou no portão" (vale +10 pontos no embarque).
func (s *service) MarcarPronto(ctx context.Context, e models.Escopo, alunoID string) error {
	if !e.TemAluno(alunoID) {
		return core.ErrProibido
	}
	a, err := s.repo.Aluno(ctx, alunoID)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	ativas, err := s.repo.ViagensAtivasDaVan(ctx, a.VanID)
	if err != nil || len(ativas) == 0 {
		return core.Invalido("A van ainda não saiu.")
	}
	v := ativas[0]
	i := regras.IdxAluno(&v, alunoID)
	if v.Tipo != "ida" || i < 0 || v.Paradas[i].Status != "pendente" || v.Paradas[i].ProntoEm != "" {
		return nil
	}
	v.Paradas[i].ProntoEm = models.AgoraIso()
	if err := s.repo.SalvarViagem(ctx, v); err != nil {
		return err
	}
	_ = s.av.Motorista(ctx, a.VanID, "🙋", regras.PrimeiroNome(a.Nome)+" já está no portão", a.Endereco)
	s.tx.Van(ctx, a.VanID)
	s.tx.Viagem(ctx, v, false)
	return nil
}

// retracar: reotimiza as casas que faltam a partir de onde a van está e retraça pelas ruas.
// As escolas mantêm a ordem do horário; na rota fixa a ordem do tio é mantida.
func (s *service) retracar(ctx context.Context, viagemID string) {
	v0, err := s.repo.Viagem(ctx, viagemID)
	if err != nil || v0.Status != "em_andamento" {
		return
	}
	L := s.tx.Locais(ctx, &v0)
	var fixo *models.Parada
	if v0.NaParada && v0.Alvo < len(v0.Paradas) && v0.Paradas[v0.Alvo].Status == "pendente" {
		f := v0.Paradas[v0.Alvo]
		fixo = &f
	}
	var casas, escolas []models.Parada
	for i, p := range v0.Paradas {
		if p.Status != "pendente" || (fixo != nil && i == v0.Alvo) {
			continue
		}
		if p.Tipo == "aluno" {
			casas = append(casas, p)
		} else {
			escolas = append(escolas, p)
		}
	}
	var vivas []models.Parada
	for _, p := range v0.Paradas {
		if p.Tipo == "escola" && p.Status != "ausente" {
			vivas = append(vivas, p)
		}
	}
	destino, destinoNome := v0.Destino, v0.DestinoNome
	if v0.Tipo == "ida" && len(vivas) > 0 {
		ult := vivas[len(vivas)-1]
		destino, destinoNome = localDe(ult, L), L.Escolas[ult.EscolaID].Nome
	}
	de := v0.Pos
	if fixo != nil {
		de = localDe(*fixo, L)
	}
	if v0.Tipo == "volta" && len(escolas) > 0 {
		de = localDe(escolas[len(escolas)-1], L)
	}
	ate := destino
	if v0.Tipo == "ida" && len(escolas) > 0 {
		ate = localDe(escolas[0], L)
	}
	locs := make([]models.LatLng, len(casas))
	for i, p := range casas {
		locs[i] = localDe(p, L)
	}
	ordem := make([]int, len(casas))
	for i := range ordem {
		ordem[i] = i
	}
	if !v0.Fixa && len(casas) > 1 {
		if o := s.osrm.Otimizar(ctx, de, locs, ate); o != nil {
			ordem = o
		} else {
			ordem = geo.OtimizarOrdem(de, locs, ate)
		}
	}
	casasOrd := make([]models.Parada, 0, len(casas))
	for _, i := range ordem {
		casasOrd = append(casasOrd, casas[i])
	}
	var nova []models.Parada
	if fixo != nil {
		nova = append(nova, *fixo)
	}
	if v0.Tipo == "ida" {
		nova = append(append(nova, casasOrd...), escolas...)
	} else {
		nova = append(append(nova, escolas...), casasOrd...)
	}
	pts := []models.LatLng{v0.Pos}
	for _, p := range nova {
		pts = append(pts, localDe(p, L))
	}
	pts = append(pts, destino)
	rota, real := s.osrm.Tracar(ctx, pts)

	s.mu.Lock()
	v, err := s.repo.Viagem(ctx, viagemID)
	if err != nil || v.Status != "em_andamento" {
		s.mu.Unlock()
		return
	}
	pendentes := map[string]models.Parada{}
	var feitas []models.Parada
	for _, p := range v.Paradas {
		if p.Status == "pendente" {
			pendentes[regras.ChaveParada(p)] = p
		} else {
			feitas = append(feitas, p)
		}
	}
	lista := feitas
	for _, p := range nova {
		if x, ok := pendentes[regras.ChaveParada(p)]; ok {
			lista = append(lista, x)
			delete(pendentes, regras.ChaveParada(p))
		}
	}
	for _, x := range pendentes { // mudou enquanto buscava a rota
		lista = append(lista, x)
	}
	v.Paradas = lista
	for i, p := range nova {
		v.Trechos[regras.ChaveParada(p)] = rota[i]
	}
	v.Trechos[regras.Destino] = rota[len(nova)]
	v.RotaReal = v.RotaReal && real
	v.Destino, v.DestinoNome = destino, destinoNome
	v.Alvo = regras.ProximoAlvo(&v)
	if v.NaParada {
		v.Caminho = []models.LatLng{}
	} else {
		v.Caminho = append([]models.LatLng(nil), v.Trechos[regras.ChaveAlvo(&v, v.Alvo)]...)
	}
	s.avisarProximo(ctx, &v, s.tx.Locais(ctx, &v))
	v.AtualizadoEm = models.AgoraIso()
	err = s.repo.SalvarViagem(ctx, v)
	s.mu.Unlock()
	if err == nil {
		s.tx.Van(ctx, v.VanID)
		s.tx.Viagem(ctx, v, false)
	}
}

// AjustarPorPresenca: a família (ou o tio) mudou o combinado do dia; tira o aluno da rota em andamento.
func (s *service) AjustarPorPresenca(ctx context.Context, alunoID string) error {
	a, err := s.repo.Aluno(ctx, alunoID)
	if err != nil {
		return err
	}
	s.mu.Lock()
	ativas, _ := s.repo.ViagensAtivasDaVan(ctx, a.VanID)
	if len(ativas) == 0 {
		s.mu.Unlock()
		return nil
	}
	v := ativas[0]
	pres, _ := s.repo.Presenca(ctx, alunoID, models.Hoje())
	i := regras.IdxAluno(&v, alunoID)
	if regras.VaiNoTrecho(pres, v.Tipo) || i < 0 || v.Paradas[i].Status != "pendente" {
		s.mu.Unlock()
		return nil
	}
	p := &v.Paradas[i]
	p.Status, p.Avisou, p.Hora = "ausente", true, models.AgoraIso()
	if v.Alvo == i {
		v.NaParada = false
	}
	pularEscolasVazias(&v)
	v.Alvo = regras.ProximoAlvo(&v)
	err = s.repo.SalvarViagem(ctx, v)
	s.mu.Unlock()
	if err != nil {
		return err
	}
	_ = s.av.Motorista(ctx, a.VanID, "⚡", "Rota ajustada", fmt.Sprintf("%s saiu da %s de hoje. A rota foi reotimizada.", regras.PrimeiroNome(a.Nome), v.Tipo))
	go s.retracar(context.Background(), v.ID)
	return nil
}

func (s *service) Encerrar(ctx context.Context, e models.Escopo, viagemID string) error {
	s.mu.Lock()
	v, err := s.viagemDoTio(ctx, e, viagemID)
	if err == nil {
		v.Status, v.AtualizadoEm = "cancelada", models.AgoraIso()
		err = s.repo.SalvarViagem(ctx, v)
	}
	s.mu.Unlock()
	if err == nil {
		s.tx.Van(ctx, v.VanID)
		s.tx.Viagem(ctx, v, false)
	}
	return err
}

func (s *service) Configurar(ctx context.Context, e models.Escopo, viagemID string, req entities.ConfigurarRequest) error {
	s.mu.Lock()
	v, err := s.viagemDoTio(ctx, e, viagemID)
	if err == nil {
		if req.Automatico != nil {
			v.Automatico = *req.Automatico
		}
		if req.Velocidade != nil && *req.Velocidade > 0 && *req.Velocidade <= 60 {
			v.Velocidade = *req.Velocidade
		}
		if req.Simulado != nil {
			v.Simulado = *req.Simulado
		}
		err = s.repo.SalvarViagem(ctx, v)
	}
	s.mu.Unlock()
	if err == nil {
		s.tx.Viagem(ctx, v, false)
	}
	return err
}

// ConfirmarEntrada: a portaria confirma que o aluno entrou (só escolas que escolheram confirmar).
func (s *service) ConfirmarEntrada(ctx context.Context, e models.Escopo, viagemID string, alunoIDs []string) error {
	if e.Usuario.Perfil != models.PerfilEscola {
		return core.ErrProibido
	}
	s.mu.Lock()
	v, err := s.repo.Viagem(ctx, viagemID)
	if err != nil {
		s.mu.Unlock()
		return err
	}
	var confirmados []string
	for i := range v.Paradas {
		p := &v.Paradas[i]
		if p.Tipo == "aluno" && p.EscolaID == e.EscolaID && p.Status == "feito" && p.RecebidoEscolaEm == "" && models.Contem(alunoIDs, p.AlunoID) {
			p.RecebidoEscolaEm = models.AgoraIso()
			confirmados = append(confirmados, p.AlunoID)
		}
	}
	err = s.repo.SalvarViagem(ctx, v)
	s.mu.Unlock()
	if err != nil {
		return err
	}
	als, _ := s.repo.MapaAlunos(ctx, confirmados)
	for _, id := range confirmados {
		_ = s.av.Pais(ctx, id, "🏫", regras.PrimeiroNome(als[id].Nome)+" entrou na escola", "Confirmado pela portaria às "+regras.Hora(models.AgoraIso()))
	}
	s.tx.Van(ctx, v.VanID)
	s.tx.Viagem(ctx, v, false)
	return nil
}

// chegou: a van chegou no alvo atual (pelo GPS ou pela simulação).
func (s *service) chegou(ctx context.Context, v *models.Viagem, L locais) {
	if v.Alvo >= len(v.Paradas) {
		v.Status, v.ConcluidaEm = "concluida", models.AgoraIso()
		n := 0
		for _, p := range v.Paradas {
			if p.Tipo == "aluno" && p.Status == "feito" {
				n++
			}
		}
		_ = s.av.Motorista(ctx, v.VanID, "🏁", fmt.Sprintf("Rota da %s concluída (%s)", lower(models.NomeTurno[v.Turno]), v.Tipo),
			fmt.Sprintf("%s · %s", plural(n, "aluno"), plural(len(v.EscolaIDs), "escola")))
		return
	}
	v.NaParada, v.ChegouParadaEm = true, models.AgoraIso()
	p := v.Paradas[v.Alvo]
	van, _ := s.repo.Van(ctx, v.VanID)
	if p.Tipo == "aluno" {
		a := L.Alunos[p.AlunoID]
		if v.Tipo == "ida" {
			_ = s.av.Familia(ctx, a.ID, "📍", van.Motorista+" chegou no seu portão!", regras.PrimeiroNome(a.Nome)+", pode embarcar 🚐", false)
		} else {
			_ = s.av.Familia(ctx, a.ID, "📍", "A van chegou na sua casa", regras.PrimeiroNome(a.Nome)+" está descendo", false)
		}
		return
	}
	e := L.Escolas[p.EscolaID]
	n := 0
	for _, x := range v.Paradas {
		if x.Tipo == "aluno" && x.EscolaID == e.ID && ((v.Tipo == "ida" && x.Status == "feito") || (v.Tipo == "volta" && x.Status == "pendente")) {
			n++
			if v.Tipo == "volta" {
				_ = s.av.Familia(ctx, x.AlunoID, "📍", "O tio chegou na escola", e.Nome, false)
			}
		}
	}
	tit := fmt.Sprintf("Van de %s chegou com %s", van.Motorista, plural(n, "aluno"))
	if v.Tipo == "volta" {
		tit = fmt.Sprintf("Van de %s chegou para buscar %s", van.Motorista, plural(n, "aluno"))
	}
	_ = s.av.Escola(ctx, e.ID, "📍", tit, "Às "+regras.Hora(v.ChegouParadaEm))
}

// Posicao: GPS do celular do tio. Corta o caminho que ficou para trás e detecta a chegada.
func (s *service) Posicao(ctx context.Context, e models.Escopo, viagemID string, pos models.LatLng) error {
	s.mu.Lock()
	v, err := s.viagemDoTio(ctx, e, viagemID)
	if err != nil || v.Status != "em_andamento" {
		s.mu.Unlock()
		return err
	}
	v.Simulado = false
	v.Pos = pos
	v.Rastro = append(v.Rastro, pos)
	if len(v.Rastro) > 1500 {
		v.Rastro = append(v.Rastro[:1], v.Rastro[len(v.Rastro)-1499:]...)
	}
	mudou, retracar := false, false
	if !v.NaParada {
		v.Caminho = geo.Aparar(pos, v.Caminho)
		alvo := v.Destino
		if v.Alvo < len(v.Paradas) {
			alvo = localDe(v.Paradas[v.Alvo], s.tx.Locais(ctx, &v))
		}
		if geo.DistM(pos, alvo) < raioChegada {
			s.chegou(ctx, &v, s.tx.Locais(ctx, &v))
			mudou = true
		}
	} else if v.Alvo < len(v.Paradas) {
		// o tio só dirige: parou na parada e saiu dela → o GPS confirma o embarque/entrega sozinho
		// (ele ainda pode marcar "não estava" antes de sair, ou desligar isso em Configurações)
		L := s.tx.Locais(ctx, &v)
		if van, e2 := s.repo.Van(ctx, v.VanID); e2 == nil && !van.Config.ConfirmarManual && geo.DistM(pos, localDe(v.Paradas[v.Alvo], L)) > raioSaida {
			retracar = s.concluirParada(ctx, &v, L, "feito")
			mudou = true
		}
	}
	v.AtualizadoEm = models.AgoraIso()
	err = s.repo.SalvarViagem(ctx, v)
	s.mu.Unlock()
	if err == nil {
		s.registrar(ctx, v, pos, "gps", mudou)
		if mudou {
			s.tx.Van(ctx, v.VanID)
		}
		s.tx.Viagem(ctx, v, !mudou)
		if retracar {
			go s.retracar(context.Background(), v.ID)
		}
	}
	return err
}

func (s *service) PosicoesLote(ctx context.Context, e models.Escopo, viagemID string, pts []models.PontoTrajeto) error {
	if len(pts) == 0 {
		return nil
	}
	if len(pts) > 5000 {
		return core.Invalido("Posições demais de uma vez.")
	}
	s.mu.Lock()
	v, err := s.viagemDoTio(ctx, e, viagemID)
	s.mu.Unlock()
	if err != nil {
		return err
	}
	validos := make([]models.PontoTrajeto, 0, len(pts))
	for _, p := range pts {
		t := models.ParseIso(p.Em)
		if p.Lat < -90 || p.Lat > 90 || p.Lng < -180 || p.Lng > 180 || t.IsZero() || time.Since(t) > 48*time.Hour || time.Until(t) > time.Minute {
			continue
		}
		validos = append(validos, models.PontoTrajeto{Lat: p.Lat, Lng: p.Lng, Em: models.Iso(t)})
	}
	if len(validos) == 0 {
		return core.Invalido("Nenhuma posição válida.")
	}
	if err := s.repo.InserirPosicoes(ctx, v.ID, v.VanID, "gps", validos); err != nil {
		return err
	}
	if v.Status != "em_andamento" {
		return nil
	}
	u := validos[len(validos)-1]
	return s.Posicao(ctx, e, viagemID, models.LatLng{Lat: u.Lat, Lng: u.Lng})
}

// Simular move as vans em modo demonstração (roda em segundo plano, a cada segundo).
func (s *service) Simular(ctx context.Context) {
	ultimo := time.Now()
	tk := time.NewTicker(time.Second)
	defer tk.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case agora := <-tk.C:
			dt := agora.Sub(ultimo)
			ultimo = agora
			if dt > 15*time.Second {
				dt = 15 * time.Second
			}
			s.passo(ctx, dt)
		}
	}
}

func (s *service) passo(ctx context.Context, dt time.Duration) {
	ativas, err := s.repo.ViagensAtivas(ctx)
	if err != nil {
		log.Printf("simulação: %v", err)
		return
	}
	for _, v0 := range ativas {
		if !v0.Simulado {
			continue
		}
		s.mu.Lock()
		v, err := s.repo.Viagem(ctx, v0.ID)
		if err != nil || v.Status != "em_andamento" || !v.Simulado {
			s.mu.Unlock()
			continue
		}
		L := s.tx.Locais(ctx, &v)
		mudou, retracar := false, false
		if v.NaParada {
			if !v.Automatico || time.Since(models.ParseIso(v.ChegouParadaEm)) < esperaAuto {
				s.mu.Unlock()
				continue
			}
			retracar = s.concluirParada(ctx, &v, L, "feito")
			mudou = true
		} else {
			fator := 1.0
			if !v.RotaReal {
				fator = geo.FatorRua
			}
			metros := geo.VelMediaKmh / 3.6 * v.Velocidade * dt.Seconds() / fator
			pos, resto, chegou := geo.Seguir(v.Pos, v.Caminho, metros)
			v.Pos, v.Caminho = pos, resto
			v.Rastro = append(v.Rastro, pos)
			if len(v.Rastro) > 1500 {
				v.Rastro = append(v.Rastro[:1], v.Rastro[len(v.Rastro)-1499:]...)
			}
			if chegou {
				s.chegou(ctx, &v, L)
				mudou = true
			}
		}
		v.AtualizadoEm = models.AgoraIso()
		err = s.repo.SalvarViagem(ctx, v)
		s.mu.Unlock()
		if err != nil {
			log.Printf("simulação: %v", err)
			continue
		}
		s.registrar(ctx, v, v.Pos, "simulacao", mudou)
		if mudou {
			s.tx.Van(ctx, v.VanID)
		}
		s.tx.Viagem(ctx, v, !mudou)
		if retracar {
			go s.retracar(context.Background(), v.ID)
		}
	}
}
