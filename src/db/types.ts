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
  /**
   * A portaria confirma a entrada de cada aluno no app (opcional — escolas com plano).
   * Desligado: a entrega fica com o tio ("Desceram N" já avisa os pais).
   */
  confirmaEntrada?: boolean;
  /** código para a escola criar o acesso da portaria (o tio vê das escolas que atende) */
  codigo?: string;
}

/** Em qual turno o motorista trabalha e quais escolas atende nele. */
export interface TurnoVan { turno: Turno; ativo: boolean; escolaIds: string[] }

/** O que o tio ajusta em Configurações (o servidor completa os padrões). */
export interface ConfigVan {
  pixTipo?: 'cpf' | 'cnpj' | 'celular' | 'email' | 'aleatoria';
  pixChave?: string;
  pixNome?: string;
  pixCidade?: string;
  /** dia de vencimento sugerido para aluno novo (padrão 10) */
  diaVencimento?: number;
  /** minutos de folga na hora de sair (padrão 5) */
  folgaMin?: number;
  /** avisar a família quando faltarem N paradas (1 = quando é o próximo) */
  avisoParadas?: number;
  /** true = o GPS NÃO confirma sozinho o embarque; só pelo botão */
  confirmarManual?: boolean;
  /** true = esconde conduta, pontos e prêmios */
  semGamificacao?: boolean;
}

export interface Van {
  id: string;
  config?: ConfigVan;
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
  /**
   * Rota fixa definida pelo tio (ex.: para o semestre todo), por `${turno}|${tipo}`.
   * ativa = usa a ordem dele em vez de otimizar; quem não está na lista entra no fim.
   */
  rotasFixas?: Record<string, RotaFixa>;
}

export interface RotaFixa { ativa: boolean; ordem: string[]; atualizadaEm: string }

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
  /** convite da família (o tio manda pelo WhatsApp) */
  codigoFamilia?: string;
  /** o aluno entra no app só com este código */
  codigoAluno?: string;
  /** a família já criou a conta */
  familiaConectada?: boolean;
  /** false = colega da van (só apelido, para o ranking) */
  completo: boolean;
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
  /** a família avisou que pagou; o tio confirma quando o dinheiro cair */
  informadoEm?: string;
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
  /** true = o servidor anda com a van (demonstração) · false = GPS do celular do tio */
  simulado: boolean;
  /** multiplicador da velocidade da simulação */
  velocidade: number;
  iniciadaEm: string;
  concluidaEm?: string;
  /** alunos que já receberam o aviso de "é o próximo" */
  avisados: string[];
  /** ordem fixa do tio: ao reajustar, não reotimiza as casas */
  fixa?: boolean;
  /** km economizados pela otimização */
  economiaKm?: number;
  atualizadoEm: string;
  /** horário do último ponto de GPS aplicado no servidor */
  ultimaPosEm?: string;
  /** só na cópia da família: o que ela pode ver de cada filho (calculado no servidor) */
  visoes?: Record<string, unknown>;
  /** só na cópia da escola */
  visoesEscola?: Record<string, unknown>;
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
  /** ainda na fila do aparelho (sem internet) */
  enviando?: boolean;
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

export interface Usuario {
  id: string;
  perfil: Perfil;
  nome: string;
  email?: string;
  telefone?: string;
  vanId?: string;
  escolaId?: string;
  alunoId?: string;
  demo?: boolean;
}

/** Quem está usando o app e o que pode ver (vem do servidor junto com os dados). */
export interface Eu { usuario: Usuario; vanIds: string[]; alunoIds: string[]; escolaId?: string }

// ---------------- offline-first ----------------

export type TipoOp = 'iniciar' | 'parada' | 'posicoes' | 'encerrar' | 'presenca' | 'pagar' | 'mensagem' | 'pronto';

/** Uma ação guardada no aparelho até o servidor confirmar. `id` vira a Idempotency-Key. */
export interface OpFila {
  seq?: number;
  id: string;
  tipo: TipoOp;
  caminho: string;
  metodo: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  corpo: Record<string, unknown>;
  criadoEm: string;
  viagemId?: string;
  tentativas: number;
  /** viagem montada no aparelho (rota iniciada sem internet) */
  local?: Viagem;
}
