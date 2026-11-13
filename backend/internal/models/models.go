// Package models tem os tipos usados por vários domínios. Os nomes JSON são os mesmos do
// frontend (src/db/types.ts), assim o app recebe os dados sem conversão.
package models

import (
	"encoding/json"
	"time"
)

// ---------------- datas ----------------

// Fuso usado para "hoje" (as rotas são do dia local da van).
var Fuso = carregarFuso()

func carregarFuso() *time.Location {
	l, err := time.LoadLocation("America/Sao_Paulo")
	if err != nil {
		return time.FixedZone("BRT", -3*3600)
	}
	return l
}

// Agora devolve o horário atual no fuso da operação.
func Agora() time.Time { return time.Now().In(Fuso) }

// Hoje = data local "2026-11-12".
func Hoje() string { return Agora().Format("2006-01-02") }

// MesAtual = "2026-11".
func MesAtual() string { return Agora().Format("2006-01") }

// Iso formata igual ao Date.toISOString() do JavaScript.
func Iso(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }

// AgoraIso = Iso(agora).
func AgoraIso() string { return Iso(time.Now()) }

// ParseIso lê um ISO gerado por Iso (ou RFC3339).
func ParseIso(s string) time.Time {
	t, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		return time.Time{}
	}
	return t
}

// ---------------- tipos de domínio ----------------

type LatLng struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

type Turno string

const (
	Manha Turno = "manha"
	Tarde Turno = "tarde"
	Noite Turno = "noite"
)

var Turnos = []Turno{Manha, Tarde, Noite}

func (t Turno) Valido() bool { return t == Manha || t == Tarde || t == Noite }

var NomeTurno = map[Turno]string{Manha: "Manhã", Tarde: "Tarde", Noite: "Noite"}

type Horario struct {
	Entrada string `json:"entrada"`
	Saida   string `json:"saida"`
}

type Escola struct {
	ID              string            `json:"id"`
	Nome            string            `json:"nome"`
	Endereco        string            `json:"endereco"`
	Local           LatLng            `json:"local"`
	Horarios        map[Turno]Horario `json:"horarios"`
	ConfirmaEntrada bool              `json:"confirmaEntrada"`
	// código para a escola criar o acesso da portaria (só o tio e a própria escola veem)
	Codigo string `json:"codigo,omitempty"`
}

type TurnoVan struct {
	Turno     Turno    `json:"turno"`
	Ativo     bool     `json:"ativo"`
	EscolaIDs []string `json:"escolaIds"`
}

type RotaFixa struct {
	Ativa        bool     `json:"ativa"`
	Ordem        []string `json:"ordem"`
	AtualizadaEm string   `json:"atualizadaEm"`
}

type Van struct {
	ID             string              `json:"id"`
	Nome           string              `json:"nome"`
	Motorista      string              `json:"motorista"`
	Telefone       string              `json:"telefone"`
	Placa          string              `json:"placa"`
	Modelo         string              `json:"modelo"`
	Garagem        LatLng              `json:"garagem"`
	EscolaIDs      []string            `json:"escolaIds"`
	Turnos         []TurnoVan          `json:"turnos"`
	Credenciamento map[string]string   `json:"credenciamento"`
	PrecoPadrao    int                 `json:"precoPadrao"`
	Vagas          int                 `json:"vagas"`
	Avaliacao      float64             `json:"avaliacao"`
	RotasFixas     map[string]RotaFixa `json:"rotasFixas,omitempty"`
	Config         ConfigVan           `json:"config"`
}

// ConfigVan = o que o tio ajusta em Configurações.
type ConfigVan struct {
	// Pix para as famílias pagarem a mensalidade direto na conta dele (QR Code e copia e cola gerados no app)
	PixTipo   string `json:"pixTipo,omitempty"` // cpf | cnpj | celular | email | aleatoria
	PixChave  string `json:"pixChave,omitempty"`
	PixNome   string `json:"pixNome,omitempty"`
	PixCidade string `json:"pixCidade,omitempty"`
	// dia de vencimento sugerido para aluno novo
	DiaVencimento int `json:"diaVencimento,omitempty"`
	// minutos de folga na hora de sair (padrão 5)
	FolgaMin int `json:"folgaMin,omitempty"`
	// avisar a família quando faltarem N paradas (1 = quando é o próximo)
	AvisoParadas int `json:"avisoParadas,omitempty"`
	// padrão: o GPS confirma sozinho o embarque/entrega quando a van sai da parada. true = só pelo botão
	ConfirmarManual bool `json:"confirmarManual,omitempty"`
	// padrão: conduta, pontos e prêmios ligados. true = esconde tudo (é um extra)
	SemGamificacao bool `json:"semGamificacao,omitempty"`
}

// Normalizar põe os valores padrão no que não foi configurado.
func (c ConfigVan) Normalizar() ConfigVan {
	if c.DiaVencimento < 1 || c.DiaVencimento > 28 {
		c.DiaVencimento = 10
	}
	if c.FolgaMin < 0 || c.FolgaMin > 30 {
		c.FolgaMin = 5
	}
	if c.FolgaMin == 0 {
		c.FolgaMin = 5
	}
	if c.AvisoParadas < 1 || c.AvisoParadas > 3 {
		c.AvisoParadas = 1
	}
	return c
}

func (v *Van) TurnoCfg(t Turno) *TurnoVan {
	for i := range v.Turnos {
		if v.Turnos[i].Turno == t {
			return &v.Turnos[i]
		}
	}
	return nil
}

type Aluno struct {
	ID            string `json:"id"`
	VanID         string `json:"vanId"`
	EscolaID      string `json:"escolaId"`
	Nome          string `json:"nome"`
	Apelido       string `json:"apelido"`
	Cor           string `json:"cor"`
	Serie         string `json:"serie"`
	Turno         Turno  `json:"turno"`
	Responsavel   string `json:"responsavel"`
	TelefoneResp  string `json:"telefoneResp"`
	Endereco      string `json:"endereco"`
	Local         LatLng `json:"local"`
	Mensalidade   int    `json:"mensalidade"`
	DiaVencimento int    `json:"diaVencimento"`
	Ativo         bool   `json:"ativo"`
	CriadoEm      string `json:"criadoEm"`
	// convites (só o tio e a própria família recebem)
	CodigoFamilia string `json:"codigoFamilia,omitempty"`
	CodigoAluno   string `json:"codigoAluno,omitempty"`
	// família já criou a conta no app
	FamiliaConectada bool `json:"familiaConectada,omitempty"`
	// false = só o apelido (ranking); a família recebe os colegas assim
	Completo bool `json:"completo"`
}

type Pagamento struct {
	ID         string `json:"id"`
	AlunoID    string `json:"alunoId"`
	Mes        string `json:"mes"`
	Valor      int    `json:"valor"`
	Vencimento string `json:"vencimento"`
	Status     string `json:"status"`
	PagoEm     string `json:"pagoEm,omitempty"`
	Metodo     string `json:"metodo,omitempty"`
	// a família avisou que pagou (o tio confirma quando o dinheiro cair)
	InformadoEm string `json:"informadoEm,omitempty"`
}

type Presenca struct {
	ID        string `json:"id"`
	AlunoID   string `json:"alunoId"`
	Data      string `json:"data"`
	Ida       bool   `json:"ida"`
	Volta     bool   `json:"volta"`
	Motivo    string `json:"motivo,omitempty"`
	AvisadoEm string `json:"avisadoEm"`
}

type Parada struct {
	Tipo             string `json:"tipo"` // aluno | escola
	AlunoID          string `json:"alunoId"`
	EscolaID         string `json:"escolaId"`
	Status           string `json:"status"` // pendente | feito | ausente
	Hora             string `json:"hora,omitempty"`
	ProntoEm         string `json:"prontoEm,omitempty"`
	Avisou           bool   `json:"avisou,omitempty"`
	RecebidoEscolaEm string `json:"recebidoEscolaEm,omitempty"`
}

type Viagem struct {
	ID             string              `json:"id"`
	VanID          string              `json:"vanId"`
	Data           string              `json:"data"`
	Tipo           string              `json:"tipo"` // ida | volta
	Status         string              `json:"status"`
	Inicio         LatLng              `json:"inicio"`
	Turno          Turno               `json:"turno"`
	EscolaIDs      []string            `json:"escolaIds"`
	Destino        LatLng              `json:"destino"`
	DestinoNome    string              `json:"destinoNome"`
	Paradas        []Parada            `json:"paradas"`
	Alvo           int                 `json:"alvo"`
	Pos            LatLng              `json:"pos"`
	Caminho        []LatLng            `json:"caminho"`
	Trechos        map[string][]LatLng `json:"trechos"`
	RotaReal       bool                `json:"rotaReal"`
	Rastro         []LatLng            `json:"rastro"`
	NaParada       bool                `json:"naParada"`
	ChegouParadaEm string              `json:"chegouParadaEm,omitempty"`
	Automatico     bool                `json:"automatico"`
	// true = o servidor anda com a van (demonstração); false = posição vem do GPS do celular do tio
	Simulado     bool     `json:"simulado"`
	Velocidade   float64  `json:"velocidade"`
	IniciadaEm   string   `json:"iniciadaEm"`
	ConcluidaEm  string   `json:"concluidaEm,omitempty"`
	Avisados     []string `json:"avisados"`
	EconomiaKm   float64  `json:"economiaKm,omitempty"`
	Fixa         bool     `json:"fixa,omitempty"`
	AtualizadoEm string   `json:"atualizadoEm"`
	// horário do último ponto de GPS aplicado (o replay da fila offline não volta no tempo)
	UltimaPosEm string `json:"ultimaPosEm,omitempty"`

	// só nas cópias enviadas para família/escola (calculado no servidor, respeitando a privacidade)
	Visoes       map[string]VisaoFamilia `json:"visoes,omitempty"`
	VisoesEscola map[string]VisaoEscola  `json:"visoesEscola,omitempty"`
}

type VisaoFamilia struct {
	Fase         string   `json:"fase"`
	MostrarMapa  bool     `json:"mostrarMapa"`
	Caminho      []LatLng `json:"caminho"`
	Alvo         *LatLng  `json:"alvo,omitempty"`
	AlvoTipo     string   `json:"alvoTipo,omitempty"`
	Eta          *int     `json:"eta,omitempty"`
	ParadasAntes int      `json:"paradasAntes"`
	HoraFase     string   `json:"horaFase,omitempty"`
	// true = o filho está dentro da van: a família acompanha a posição durante todo o trajeto (PL 1240/2026)
	ABordo bool `json:"aBordo,omitempty"`
}

// ---------------- PL 1240/2026: registro dos trajetos e fiscalização ----------------

// PontoTrajeto = uma posição registrada da van, com o horário.
type PontoTrajeto struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
	Em  string  `json:"em"`
}

// ResumoViagem = uma linha do histórico de trajetos (sem nome nem endereço de aluno).
type ResumoViagem struct {
	ID          string   `json:"id"`
	Data        string   `json:"data"`
	Turno       Turno    `json:"turno"`
	Tipo        string   `json:"tipo"`
	Status      string   `json:"status"`
	IniciadaEm  string   `json:"iniciadaEm"`
	ConcluidaEm string   `json:"concluidaEm,omitempty"`
	Escolas     []string `json:"escolas"`
	Alunos      int      `json:"alunos"`   // embarcados (ida) ou entregues (volta)
	Ausentes    int      `json:"ausentes"` // não estavam / fora do trecho
	Pontos      int      `json:"pontos"`   // posições registradas
	Km          float64  `json:"km"`       // distância percorrida pelo registro
	Origem      string   `json:"origem"`   // gps | simulacao
	PrimeiraEm  string   `json:"primeiraEm,omitempty"`
	UltimaEm    string   `json:"ultimaEm,omitempty"`
}

// AcessoFiscal = link somente leitura para o poder público.
type AcessoFiscal struct {
	Token          string `json:"token"`
	VanID          string `json:"vanId"`
	Nome           string `json:"nome"`
	CriadoEm       string `json:"criadoEm"`
	ExpiraEm       string `json:"expiraEm"`
	RevogadoEm     string `json:"revogadoEm,omitempty"`
	UltimoAcessoEm string `json:"ultimoAcessoEm,omitempty"`
	Acessos        int    `json:"acessos"`
}

type VisaoEscola struct {
	Estado       string   `json:"estado"`
	Eta          int      `json:"eta"`
	Horario      string   `json:"horario,omitempty"`
	Atraso       *int     `json:"atraso"`
	Hora         string   `json:"hora,omitempty"`
	Abordo       int      `json:"abordo"`
	ABuscar      int      `json:"aBuscar"`
	Total        int      `json:"total"`
	ParadasAntes int      `json:"paradasAntes"`
	MostrarMapa  bool     `json:"mostrarMapa"`
	Caminho      []LatLng `json:"caminho"`
	AlunosIDs    []string `json:"alunosIds"`
}

type Notificacao struct {
	ID       string `json:"id"`
	Para     string `json:"para"`
	AlunoID  string `json:"alunoId,omitempty"`
	VanID    string `json:"vanId,omitempty"`
	EscolaID string `json:"escolaId,omitempty"`
	Icone    string `json:"icone"`
	Titulo   string `json:"titulo"`
	Texto    string `json:"texto"`
	CriadoEm string `json:"criadoEm"`
	Lida     bool   `json:"lida"`
}

type Mensagem struct {
	ID       string `json:"id"`
	AlunoID  string `json:"alunoId"`
	De       string `json:"de"`
	Texto    string `json:"texto"`
	CriadoEm string `json:"criadoEm"`
	Lida     bool   `json:"lida"`
}

type EventoPontos struct {
	ID         string `json:"id"`
	AlunoID    string `json:"alunoId"`
	VanID      string `json:"vanId"`
	Data       string `json:"data"`
	CriadoEm   string `json:"criadoEm"`
	Tipo       string `json:"tipo"`
	Pontos     int    `json:"pontos"`
	Descricao  string `json:"descricao"`
	Observacao string `json:"observacao,omitempty"`
	Autor      string `json:"autor"`
}

type Recompensa struct {
	ID    string `json:"id"`
	VanID string `json:"vanId"`
	Icone string `json:"icone"`
	Nome  string `json:"nome"`
	Custo int    `json:"custo"`
	Ativo bool   `json:"ativo"`
}

type Resgate struct {
	ID           string `json:"id"`
	AlunoID      string `json:"alunoId"`
	RecompensaID string `json:"recompensaId"`
	Nome         string `json:"nome"`
	Icone        string `json:"icone"`
	Custo        int    `json:"custo"`
	Status       string `json:"status"`
	CriadoEm     string `json:"criadoEm"`
	DecididoEm   string `json:"decididoEm,omitempty"`
}

// ---------------- usuários ----------------

type Perfil string

const (
	PerfilMotorista Perfil = "motorista"
	PerfilPais      Perfil = "pais"
	PerfilAluno     Perfil = "aluno"
	PerfilEscola    Perfil = "escola"
)

type Usuario struct {
	ID        string `json:"id"`
	Perfil    Perfil `json:"perfil"`
	Nome      string `json:"nome"`
	Email     string `json:"email,omitempty"`
	Telefone  string `json:"telefone,omitempty"`
	VanID     string `json:"vanId,omitempty"`
	EscolaID  string `json:"escolaId,omitempty"`
	AlunoID   string `json:"alunoId,omitempty"`
	SenhaHash string `json:"-"`
	Demo      bool   `json:"demo,omitempty"`
}

// Escopo = o que um usuário pode ver (calculado do banco a cada pedido / conexão).
type Escopo struct {
	Usuario  Usuario
	VanIDs   []string // vans que ele acompanha
	AlunoIDs []string // alunos da família (pais) ou o próprio (aluno)
	EscolaID string
}

func (e Escopo) TemVan(id string) bool   { return contem(e.VanIDs, id) }
func (e Escopo) TemAluno(id string) bool { return contem(e.AlunoIDs, id) }

func contem(l []string, x string) bool {
	for _, v := range l {
		if v == x {
			return true
		}
	}
	return false
}

// Contem é exportado para os domínios.
func Contem(l []string, x string) bool { return contem(l, x) }

// Clone faz uma cópia profunda (via JSON) — usada para montar as versões filtradas da viagem.
func Clone[T any](v T) T {
	b, _ := json.Marshal(v)
	var c T
	_ = json.Unmarshal(b, &c)
	return c
}
