/** Coordenada geográfica. */
export interface LatLng { lat: number; lng: number }

export type Turno = 'manha' | 'tarde' | 'noite';
export const TURNOS: Turno[] = ['manha', 'tarde', 'noite'];

/** Horário da escola num turno ("07:15"). */
export interface Horario { entrada: string; saida: string }

export interface Escola {
  id: string;
  nome: string;
  endereco: string;
  local: LatLng;
  /** horários por turno (a escola pode não ter todos os turnos) */
  horarios: Partial<Record<Turno, Horario>>;
}

/** Em qual turno o motorista trabalha e quais escolas atende nele. */
export interface TurnoVan { turno: Turno; ativo: boolean; escolaIds: string[] }

export interface Van {
  id: string;
  /** nome comercial: "Tio Carlos Transportes" */
  nome: string;
  motorista: string;
  telefone: string;
  placa: string;
  modelo: string;
  garagem: LatLng;
  /** todas as escolas que a van atende (em qualquer turno) */
  escolaIds: string[];
  /** turnos de trabalho: manhã, tarde, noite — cada um com as suas escolas */
  turnos: TurnoVan[];
  /** credenciamento por escola: escolaId -> situação */
  credenciamento: Record<string, 'credenciada' | 'pendente' | 'suspensa'>;
  /** mensalidade padrão em centavos */
  precoPadrao: number;
  vagas: number;
  avaliacao: number;
}

export interface Aluno {
  id: string;
  vanId: string;
  escolaId: string;
  nome: string;
  /** usado no ranking — protege o nome completo das outras famílias */
  apelido: string;
  cor: string;
  serie: string;
  turno: Turno;
  responsavel: string;
  telefoneResp: string;
  endereco: string;
  local: LatLng;
  /** mensalidade em centavos */
  mensalidade: number;
  diaVencimento: number;
  ativo: boolean;
  criadoEm: string;
}

export interface Pagamento {
  id: string;
  alunoId: string;
  /** YYYY-MM */
  mes: string;
  valor: number;
  vencimento: string;
  status: 'pendente' | 'pago';
  pagoEm?: string;
  metodo?: 'pix' | 'dinheiro' | 'cartao';
}

/**
 * Aviso de presença do dia, por trecho (padrão: vai e volta de van).
 * Ex.: "eu levo, o tio traz" = { ida: false, volta: true }; "não vai hoje" = os dois false.
 */
export interface Presenca {
  /** `${alunoId}|${data}` */
  id: string;
  alunoId: string;
  data: string;
  /** a van leva para a escola */
  ida: boolean;
  /** a van traz para casa */
  volta: boolean;
  motivo?: string;
  avisadoEm: string;
}

export type TipoViagem = 'ida' | 'volta';

/**
 * Parada da rota: casa de um aluno OU uma escola.
 * Ida: casas → escolas (na ordem do horário de entrada). Volta: escolas (ordem da saída) → casas.
 */
export interface Parada {
  tipo: 'aluno' | 'escola';
  /** aluno da parada ('' quando é parada de escola) */
  alunoId: string;
  /** escola do aluno, ou a própria escola da parada */
  escolaId: string;
  status: 'pendente' | 'feito' | 'ausente';
  hora?: string;
  /** aluno avisou "estou no portão" antes da van chegar */
  prontoEm?: string;
  /** família avisou que não vai (sem perder ponto) */
  avisou?: boolean;
  /** escola confirmou a entrada do aluno */
  recebidoEscolaEm?: string;
}

export interface Viagem {
  id: string;
  vanId: string;
  data: string;
  tipo: TipoViagem;
  status: 'em_andamento' | 'concluida' | 'cancelada';
  inicio: LatLng;
  turno: Turno;
  /** escolas atendidas nesta viagem */
  escolaIds: string[];
  /** ponto final depois da última parada (ida: a última escola · volta: garagem) */
  destino: LatLng;
  destinoNome: string;
  paradas: Parada[];
  /** índice em `paradas` do próximo alvo; === paradas.length → indo para o destino final */
  alvo: number;
  pos: LatLng;
  /** pontos (pelas ruas) que faltam até o alvo atual */
  caminho: LatLng[];
  /** caminho pelas ruas até cada alvo, a partir do alvo anterior (chave: ver chaveParada) */
  trechos: Record<string, LatLng[]>;
  /** true = caminho veio do roteador (ruas reais); false = linha reta (sem internet) */
  rotaReal: boolean;
  /** caminho já percorrido (para desenhar o rastro do motorista) */
  rastro: LatLng[];
  /** van parada no endereço do alvo, esperando o tio confirmar */
  naParada: boolean;
  chegouParadaEm?: string;
  /** demo: embarca sozinho depois de alguns segundos na parada */
  automatico: boolean;
  /** multiplicador da velocidade da simulação */
  velocidade: number;
  iniciadaEm: string;
  concluidaEm?: string;
  /** alunos que já receberam o aviso de "é o próximo" */
  avisados: string[];
  /** km economizados pela otimização */
  economiaKm?: number;
  atualizadoEm: string;
}

export type Perfil = 'motorista' | 'pais' | 'aluno' | 'escola';

export interface Notificacao {
  id: string;
  para: Perfil;
  /** aluno relacionado (pais/aluno só veem as do próprio aluno) */
  alunoId?: string;
  vanId?: string;
  escolaId?: string;
  icone: string;
  titulo: string;
  texto: string;
  criadoEm: string;
  lida: boolean;
}

export interface Mensagem {
  id: string;
  alunoId: string;
  de: 'pais' | 'motorista';
  texto: string;
  criadoEm: string;
  lida: boolean;
}

/** Evento de gamificação (pontos positivos ou negativos). */
export interface EventoPontos {
  id: string;
  alunoId: string;
  vanId: string;
  data: string;
  criadoEm: string;
  /** chave do catálogo em lib/gamificacao.ts */
  tipo: string;
  pontos: number;
  descricao: string;
  observacao?: string;
  autor: 'sistema' | 'motorista';
}

export interface Recompensa {
  id: string;
  vanId: string;
  icone: string;
  nome: string;
  custo: number;
  ativo: boolean;
}

export interface Resgate {
  id: string;
  alunoId: string;
  recompensaId: string;
  nome: string;
  icone: string;
  custo: number;
  status: 'pendente' | 'aprovado' | 'recusado';
  criadoEm: string;
  decididoEm?: string;
}

export interface Config { id: string; valor: unknown }
