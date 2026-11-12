// Package regras: as regras de negócio puras (sem banco), iguais às do app:
// turnos e horários, chaves da rota, privacidade (o que a família e a escola podem ver) e o catálogo de pontos.
package regras

import (
	"math"
	"sort"
	"strconv"
	"strings"

	"github.com/logdrive023/vanaaki/backend/internal/models"
	"github.com/logdrive023/vanaaki/backend/pkg/geo"
)

// ---------------- turnos e horários ----------------

// Minutos "07:15" → 435.
func Minutos(hhmm string) int {
	p := strings.SplitN(hhmm, ":", 2)
	if len(p) != 2 {
		return 99 * 60
	}
	h, _ := strconv.Atoi(p[0])
	m, _ := strconv.Atoi(p[1])
	return h*60 + m
}

// HorarioAlvo: ida → entrada; volta → saída.
func HorarioAlvo(e models.Escola, t models.Turno, tipo string) string {
	h, ok := e.Horarios[t]
	if !ok {
		return ""
	}
	if tipo == "ida" {
		return h.Entrada
	}
	return h.Saida
}

// OrdenarEscolas: ida pela entrada, volta pela saída (sem horário vai por último).
func OrdenarEscolas(l []models.Escola, t models.Turno, tipo string) []models.Escola {
	out := append([]models.Escola(nil), l...)
	chave := func(e models.Escola) int {
		if h := HorarioAlvo(e, t, tipo); h != "" {
			return Minutos(h)
		}
		return 99 * 60
	}
	sort.SliceStable(out, func(a, b int) bool { return chave(out[a]) < chave(out[b]) })
	return out
}

// AtrasoPrevisto (min) da chegada em relação ao horário; nil fora de uma janela de 3 h.
func AtrasoPrevisto(eta int, horario string) *int {
	if horario == "" {
		return nil
	}
	a := models.Agora()
	chegada := a.Hour()*60 + a.Minute() + eta
	d := chegada - Minutos(horario)
	if d > 180 || d < -180 {
		return nil
	}
	return &d
}

// VaiNoTrecho: sem aviso = vai.
func VaiNoTrecho(p *models.Presenca, tipo string) bool {
	if p == nil {
		return true
	}
	if tipo == "ida" {
		return p.Ida
	}
	return p.Volta
}

// Planos do dia: ambos | so_ida | so_volta | nao_vai.
var Planos = map[string][2]bool{"ambos": {true, true}, "so_ida": {true, false}, "so_volta": {false, true}, "nao_vai": {false, false}}

var NomePlano = map[string]string{"ambos": "Ida e volta", "so_volta": "Só a volta", "so_ida": "Só a ida", "nao_vai": "Não vai hoje"}
var DescPlano = map[string]string{"ambos": "A van leva e traz", "so_volta": "Eu levo, o tio traz", "so_ida": "O tio leva, eu busco", "nao_vai": "Sem van nos dois trechos"}
var IconePlano = map[string]string{"ambos": "🚐", "so_volta": "🏫", "so_ida": "🏠", "nao_vai": "🚫"}

func PlanoDe(p *models.Presenca) string {
	if p == nil || (p.Ida && p.Volta) {
		return "ambos"
	}
	if p.Ida {
		return "so_ida"
	}
	if p.Volta {
		return "so_volta"
	}
	return "nao_vai"
}

// ---------------- chaves da viagem ----------------

const Destino = "__destino"

func ChaveParada(p models.Parada) string {
	if p.Tipo == "aluno" {
		return p.AlunoID
	}
	return "esc:" + p.EscolaID
}

func ChaveAlvo(v *models.Viagem, i int) string {
	if i < len(v.Paradas) {
		return ChaveParada(v.Paradas[i])
	}
	return Destino
}

func ProximoAlvo(v *models.Viagem) int {
	for i, p := range v.Paradas {
		if p.Status == "pendente" {
			return i
		}
	}
	return len(v.Paradas)
}

func IdxEscola(v *models.Viagem, escolaID string) int {
	for i, p := range v.Paradas {
		if p.Tipo == "escola" && p.EscolaID == escolaID {
			return i
		}
	}
	return -1
}

func IdxAluno(v *models.Viagem, alunoID string) int {
	for i, p := range v.Paradas {
		if p.Tipo == "aluno" && p.AlunoID == alunoID {
			return i
		}
	}
	return -1
}

// ---------------- previsão ----------------

// CaminhoAte = da posição atual até a parada `ate`, passando pelas pendentes do meio.
func CaminhoAte(v *models.Viagem, ate int) []models.LatLng {
	pts := append([]models.LatLng{v.Pos}, v.Caminho...)
	for i := v.Alvo + 1; i <= ate; i++ {
		if i < len(v.Paradas) && v.Paradas[i].Status != "pendente" {
			continue
		}
		pts = append(pts, v.Trechos[ChaveAlvo(v, i)]...)
	}
	return pts
}

func PendentesEntre(v *models.Viagem, de, ate int) int {
	n := 0
	for i := de; i < ate && i < len(v.Paradas); i++ {
		if i >= 0 && v.Paradas[i].Status == "pendente" {
			n++
		}
	}
	return n
}

func EtaAte(v *models.Viagem, i int) int {
	if v.Status != "em_andamento" {
		return 0
	}
	return geo.EtaMin(CaminhoAte(v, i), PendentesEntre(v, v.Alvo, i), v.RotaReal)
}

// ---------------- privacidade ----------------

func ptr[T any](x T) *T { return &x }

/*
VisaoFamilia — REGRA DE SEGURANÇA combinada com o time:
  - a família NÃO vê onde a van está enquanto o tio está em outras casas ou em outra escola,
    e NÃO sabe quem são nem onde moram os outros alunos;
  - sabe só do próprio filho, da escola dele, quantas paradas faltam e a previsão;
  - o mapa aparece quando o próximo destino da van é a casa dela ou a escola do filho.
*/
func VisaoFamilia(v *models.Viagem, aluno models.Aluno, escola *models.Escola) models.VisaoFamilia {
	base := models.VisaoFamilia{Caminho: []models.LatLng{}}
	if v == nil {
		base.Fase = "sem_viagem"
		return base
	}
	k := IdxAluno(v, aluno.ID)
	if k < 0 {
		base.Fase = "nao_vai"
		return base
	}
	p := v.Paradas[k]
	s := IdxEscola(v, aluno.EscolaID)
	var ps *models.Parada
	if s >= 0 {
		ps = &v.Paradas[s]
	}
	ativa := v.Status == "em_andamento"
	if p.Status == "ausente" {
		if p.Avisou {
			base.Fase = "nao_vai"
		} else {
			base.Fase = "ausente"
		}
		base.HoraFase = p.Hora
		return base
	}
	mapa := func(fase string, i int, tipo string) models.VisaoFamilia {
		eta := 0
		if !v.NaParada {
			eta = EtaAte(v, i)
		}
		vv := models.VisaoFamilia{Fase: fase, MostrarMapa: true, Caminho: append([]models.LatLng{v.Pos}, v.Caminho...), AlvoTipo: tipo, Eta: &eta}
		if tipo == "casa" {
			vv.Alvo = ptr(aluno.Local)
		} else if escola != nil {
			vv.Alvo = ptr(escola.Local)
		}
		return vv
	}
	espera := func(fase string, ate int, hora string) models.VisaoFamilia {
		b := base
		b.Fase, b.Eta, b.ParadasAntes, b.HoraFase = fase, ptr(EtaAte(v, ate)), PendentesEntre(v, v.Alvo, ate), hora
		return b
	}
	casaFase := func() string {
		if v.NaParada {
			return "na_porta"
		}
		return "proximo"
	}

	if v.Tipo == "ida" {
		if p.Status == "pendente" {
			if !ativa {
				base.Fase = "sem_viagem"
				return base
			}
			if v.Alvo == k {
				return mapa(casaFase(), k, "casa")
			}
			return espera("aguardando", k, "")
		}
		// embarcou
		if ps == nil || ps.Status != "pendente" || !ativa {
			base.Fase = "chegou_escola"
			if ps != nil && ps.Hora != "" {
				base.HoraFase = ps.Hora
			} else {
				base.HoraFase = v.ConcluidaEm
			}
			return base
		}
		if v.Alvo == s {
			if v.NaParada {
				base.Fase, base.HoraFase = "chegou_escola", v.ChegouParadaEm
				return base
			}
			return mapa("a_bordo_final", s, "escola")
		}
		return espera("a_bordo", s, p.Hora)
	}

	// volta
	if p.Status == "feito" {
		base.Fase, base.HoraFase = "entregue", p.Hora
		return base
	}
	if !ativa {
		base.Fase = "sem_viagem"
		return base
	}
	if ps != nil && ps.Status == "pendente" {
		if v.Alvo == s {
			if v.NaParada {
				base.Fase = "volta_na_escola"
				return base
			}
			return mapa("volta_indo_escola", s, "escola")
		}
		return espera("volta_outra_escola", s, "")
	}
	if v.Alvo == k {
		return mapa(casaFase(), k, "casa")
	}
	hora := ""
	if ps != nil {
		hora = ps.Hora
	}
	return espera("aguardando", k, hora)
}

// VisaoEscola: a escola vê quantos alunos dela, a previsão e a van no mapa só quando ela é o próximo destino.
func VisaoEscola(v *models.Viagem, escola models.Escola) models.VisaoEscola {
	s := IdxEscola(v, escola.ID)
	var ps *models.Parada
	if s >= 0 {
		ps = &v.Paradas[s]
	}
	ve := models.VisaoEscola{Caminho: []models.LatLng{}, AlunosIDs: []string{}}
	for _, p := range v.Paradas {
		if p.Tipo == "aluno" && p.EscolaID == escola.ID {
			ve.AlunosIDs = append(ve.AlunosIDs, p.AlunoID)
			switch p.Status {
			case "feito":
				ve.Abordo++
				ve.Total++
			case "pendente":
				ve.ABuscar++
				ve.Total++
			}
		}
	}
	ativa := v.Status == "em_andamento"
	pendente := ps != nil && ps.Status == "pendente" && ativa
	if pendente {
		if !(v.Alvo == s && v.NaParada) {
			ve.Eta = EtaAte(v, s)
		}
		ve.ParadasAntes = PendentesEntre(v, v.Alvo, s)
		if v.Alvo == s {
			ve.Caminho = append([]models.LatLng{v.Pos}, v.Caminho...)
			ve.MostrarMapa = !v.NaParada
		}
	}
	ve.Horario = HorarioAlvo(escola, v.Turno, v.Tipo)
	if pendente {
		ve.Atraso = AtrasoPrevisto(ve.Eta, ve.Horario)
	}
	switch {
	case ps == nil || ps.Status == "ausente":
		ve.Estado = "pulada"
	case ps.Status == "feito":
		ve.Estado = "feito"
	case !ativa:
		ve.Estado = "encerrada"
	case v.Alvo == s && v.NaParada:
		ve.Estado = "na_porta"
	default:
		ve.Estado = "a_caminho"
	}
	if ps != nil {
		ve.Hora = ps.Hora
	}
	return ve
}

// ---------------- gamificação ----------------

type TipoEvento struct {
	Tipo   string
	Icone  string
	Nome   string
	Pontos int
	Grupo  string // auto | elogio | ocorrencia
}

var Catalogo = []TipoEvento{
	{"pronto_portao", "⏰", "Pronto no portão", 10, "auto"},
	{"embarque", "🚐", "Embarcou", 3, "auto"},
	{"aviso_ausencia", "📣", "Família avisou a ausência", 2, "auto"},
	{"ausente_sem_aviso", "🚫", "Faltou sem avisar", -5, "auto"},
	{"semana_perfeita", "🌟", "Semana perfeita", 25, "auto"},
	{"cinto", "🔒", "Usou o cinto", 5, "elogio"},
	{"educado", "😊", "Educado com todos", 5, "elogio"},
	{"ajudou", "🤝", "Ajudou um colega", 10, "elogio"},
	{"organizado", "🧹", "Deixou a van limpa", 5, "elogio"},
	{"bagunca", "📢", "Bagunça / gritaria", -10, "ocorrencia"},
	{"sem_cinto", "⚠️", "Tirou o cinto", -15, "ocorrencia"},
	{"desrespeito", "🙅", "Desrespeito", -20, "ocorrencia"},
	{"atrasou", "🐢", "Atrasou a van", -5, "ocorrencia"},
	{"briga", "🥊", "Briga com colega", -25, "ocorrencia"},
}

func TipoDe(t string) *TipoEvento {
	for i := range Catalogo {
		if Catalogo[i].Tipo == t {
			return &Catalogo[i]
		}
	}
	return nil
}

// SaldoDe = ganhos − perdas − prêmios pedidos/aprovados.
func SaldoDe(ev []models.EventoPontos, rs []models.Resgate) int {
	s := 0
	for _, e := range ev {
		s += e.Pontos
	}
	for _, r := range rs {
		if r.Status != "recusado" {
			s -= r.Custo
		}
	}
	return int(math.Max(0, float64(s)))
}

// PrimeiroNome "Lucas Andrade" → "Lucas".
func PrimeiroNome(n string) string {
	if f := strings.Fields(n); len(f) > 0 {
		return f[0]
	}
	return n
}

// Hora "2026-...Z" → "07:15" no fuso local.
func Hora(iso string) string {
	if iso == "" {
		return "—"
	}
	return models.ParseIso(iso).In(models.Fuso).Format("15:04")
}
