/** Coordenada geográfica. */
export interface LatLng { lat: number; lng: number }

export interface Escola {
  id: string;
  nome: string;
  endereco: string;
  local: LatLng;
}

export interface Van {
  id: string;
  /** nome comercial: "Tio Carlos Transportes" */
  nome: string;
  motorista: string;
  telefone: string;
  placa: string;
  modelo: string;
  garagem: LatLng;
  escolaIds: string[];
  /** credenciamento por escola: escolaId -> situação */
  credenciamento: Record<string, 'credenciada' | 'pendente' | 'suspensa'>;
  /** mensalidade padrão em centavos */
  precoPadrao: number;
  vagas: number;
  avaliacao: number;
}

export type Turno = 'manha' | 'tarde';

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

/** Aviso de presença do dia (padrão: vai). */
export interface Presenca {
  /** `${alunoId}|${data}` */
  id: string;
  alunoId: string;
  data: string;
  vai: boolean;
  motivo?: string;
  avisadoEm: string;
}

export type TipoViagem = 'ida' | 'volta';

export interface Parada {
  alunoId: string;
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
  /** ida: escola · volta: garagem */
  destino: LatLng;
  destinoNome: string;
  escolaId: string;
  paradas: Parada[];
  /** índice em `paradas` do próximo alvo; === paradas.length → indo para o destino final */
  alvo: number;
  pos: LatLng;
  /** pontos (pelas ruas) que faltam até o alvo atual */
  caminho: LatLng[];
  /** caminho pelas ruas até cada alvo, a partir do alvo anterior (chave: alunoId ou DESTINO) */
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
