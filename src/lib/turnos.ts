import type { Escola, Presenca, TipoViagem, Turno } from '../db/types';

export const NOME_TURNO: Record<Turno, string> = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };
export const ICONE_TURNO: Record<Turno, string> = { manha: '☀️', tarde: '🌤️', noite: '🌙' };

/** Turno mais provável agora (para abrir as telas no turno certo). */
export function turnoAgora(d = new Date()): Turno {
  const m = d.getHours() * 60 + d.getMinutes();
  return m < 11 * 60 + 30 ? 'manha' : m < 18 * 60 + 15 ? 'tarde' : 'noite';
}

/** "07:15" → minutos desde meia-noite */
export const minutos = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/** Horário que importa para a viagem: ida → entrada na escola; volta → saída. */
export function horarioAlvo(e: Escola | undefined, turno: Turno, tipo: TipoViagem) {
  const h = e?.horarios[turno];
  return h ? (tipo === 'ida' ? h.entrada : h.saida) : undefined;
}

/** Escolas na ordem em que a van passa: ida pela entrada, volta pela saída (sem horário vai por último). */
export function ordenarEscolas(escolas: Escola[], turno: Turno, tipo: TipoViagem) {
  return [...escolas].sort((a, b) => minutos(horarioAlvo(a, turno, tipo) ?? '99:00') - minutos(horarioAlvo(b, turno, tipo) ?? '99:00'));
}

/**
 * Atraso previsto (min) para chegar à escola, comparando a previsão com o horário.
 * Só faz sentido perto do horário: fora de uma janela de 3 h devolve null (ex.: testar a rota da manhã à noite).
 */
export function atrasoPrevisto(etaMin: number, horario: string | undefined, agora = new Date()) {
  if (!horario) return null;
  const chegada = agora.getHours() * 60 + agora.getMinutes() + etaMin;
  const alvo = minutos(horario);
  if (Math.abs(chegada - alvo) > 180) return null;
  return chegada - alvo;
}

// ---------------- presença por trecho ----------------

/** O combinado do dia: van nos dois trechos, só em um, ou não vai. */
export type Plano = 'ambos' | 'so_ida' | 'so_volta' | 'nao_vai';

export const PLANOS: { id: Plano; icone: string; nome: string; desc: string }[] = [
  { id: 'ambos', icone: '🚐', nome: 'Ida e volta', desc: 'A van leva e traz' },
  { id: 'so_volta', icone: '🏫', nome: 'Só a volta', desc: 'Eu levo, o tio traz' },
  { id: 'so_ida', icone: '🏠', nome: 'Só a ida', desc: 'O tio leva, eu busco' },
  { id: 'nao_vai', icone: '🚫', nome: 'Não vai hoje', desc: 'Sem van nos dois trechos' },
];

export function planoDe(p?: Pick<Presenca, 'ida' | 'volta'>): Plano {
  if (!p || (p.ida && p.volta)) return 'ambos';
  if (p.ida) return 'so_ida';
  if (p.volta) return 'so_volta';
  return 'nao_vai';
}
export const trechosDoPlano = (pl: Plano) => ({ ida: pl === 'ambos' || pl === 'so_ida', volta: pl === 'ambos' || pl === 'so_volta' });
/** A van faz este trecho com o aluno hoje? (sem aviso = sim) */
export const vaiNoTrecho = (p: Presenca | undefined, tipo: TipoViagem) => (p ? p[tipo] : true);
export const nomePlano = (pl: Plano) => PLANOS.find((x) => x.id === pl)!;

// ---------------- horário da escola → horário da van ----------------

/** minutos desde meia-noite → "07:05" */
export const hhmm = (m: number) => { const t = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
/** Folga (min) para o aluno descer e entrar antes do sinal. */
export const FOLGA_MIN = 5;

export interface HorarioEscolaRota { escolaId: string; horario?: string; chegada: string; folga: number | null; espera?: number }
export interface PlanoHorario {
  /** ida: hora limite para sair da garagem · volta: hora de estar na 1ª escola */
  sairAs?: string;
  /** ida: chegada na última escola · volta: chegada na garagem (todos entregues) */
  fimAs: string;
  escolas: HorarioEscolaRota[];
  /** já passou da hora de sair (só perto do horário, janela de 3 h) */
  atrasadoMin: number | null;
}

/**
 * Faz a conta ao contrário a partir do horário das escolas.
 * ida: para cada escola, "entrada − tempo até ela − folga"; o menor desses é a hora de sair da garagem.
 * volta: a van precisa estar na 1ª escola na saída dela; nas seguintes, chega e espera a saída se for cedo.
 * `etaAte(i)` = minutos do início da rota até a parada i (com as paradas no meio).
 */
export function planejarHorario(tipo: TipoViagem, turno: Turno, paradas: { tipo: string; escolaId: string }[], escolas: Map<string, Escola>, etaAte: (i: number) => number, etaTotal: number, agora = new Date()): PlanoHorario {
  const idx = paradas.map((p, i) => (p.tipo === 'escola' ? i : -1)).filter((i) => i >= 0);
  const agoraMin = agora.getHours() * 60 + agora.getMinutes();
  const janela = (d: number) => (Math.abs(d) > 180 ? null : d);
  if (tipo === 'ida') {
    const limites = idx.map((i) => { const h = horarioAlvo(escolas.get(paradas[i].escolaId), turno, 'ida'); return h ? minutos(h) - etaAte(i) - FOLGA_MIN : Infinity; });
    const sair = Math.min(...limites);
    const base = Number.isFinite(sair) ? sair : agoraMin;
    const lista = idx.map((i) => {
      const e = escolas.get(paradas[i].escolaId); const h = horarioAlvo(e, turno, 'ida');
      const chegada = base + etaAte(i);
      return { escolaId: paradas[i].escolaId, horario: h, chegada: hhmm(chegada), folga: h ? minutos(h) - chegada : null };
    });
    return { sairAs: Number.isFinite(sair) ? hhmm(sair) : undefined, fimAs: hhmm(base + etaTotal), escolas: lista, atrasadoMin: Number.isFinite(sair) && agoraMin > sair ? janela(agoraMin - sair) : null };
  }
  // volta
  const h0 = idx.length ? horarioAlvo(escolas.get(paradas[idx[0]].escolaId), turno, 'volta') : undefined;
  let t = h0 ? minutos(h0) : agoraMin; // relógio da van
  let ultimo = idx[0] ?? 0;
  let esperaTotal = 0;
  const lista: HorarioEscolaRota[] = [];
  for (const i of idx) {
    t += etaAte(i) - etaAte(ultimo); ultimo = i;
    const h = horarioAlvo(escolas.get(paradas[i].escolaId), turno, 'volta');
    let espera = 0;
    if (h && t < minutos(h)) { espera = minutos(h) - t; t = minutos(h); }
    esperaTotal += espera;
    lista.push({ escolaId: paradas[i].escolaId, horario: h, chegada: hhmm(t - espera), folga: h ? minutos(h) - (t - espera) : null, espera });
  }
  const fim = t + (etaTotal - etaAte(ultimo));
  return { sairAs: h0, fimAs: hhmm(fim), escolas: lista, atrasadoMin: h0 && agoraMin > minutos(h0) && esperaTotal >= 0 ? janela(agoraMin - minutos(h0)) : null };
}
