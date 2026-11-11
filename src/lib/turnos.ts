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
