import type { EventoPontos, Resgate } from '../db/types';
import { hoje, inicioSemana, mesAtual } from './util';

/**
 * Gamificação da van — a ideia é premiar o que ajuda o tio e a segurança:
 * estar pronto no portão, usar cinto, respeitar, avisar ausência. Mau comportamento tira pontos
 * e avisa os pais na hora.
 */
export interface TipoEvento { tipo: string; icone: string; nome: string; pontos: number; grupo: 'auto' | 'elogio' | 'ocorrencia' }

export const CATALOGO: TipoEvento[] = [
  // automáticos (o sistema dá sozinho)
  { tipo: 'pronto_portao', icone: '⏰', nome: 'Pronto no portão', pontos: 10, grupo: 'auto' },
  { tipo: 'embarque', icone: '🚐', nome: 'Embarcou', pontos: 3, grupo: 'auto' },
  { tipo: 'aviso_ausencia', icone: '📣', nome: 'Família avisou a ausência', pontos: 2, grupo: 'auto' },
  { tipo: 'ausente_sem_aviso', icone: '🚫', nome: 'Faltou sem avisar', pontos: -5, grupo: 'auto' },
  { tipo: 'semana_perfeita', icone: '🌟', nome: 'Semana perfeita', pontos: 25, grupo: 'auto' },
  // elogios do tio
  { tipo: 'cinto', icone: '🔒', nome: 'Usou o cinto', pontos: 5, grupo: 'elogio' },
  { tipo: 'educado', icone: '😊', nome: 'Educado com todos', pontos: 5, grupo: 'elogio' },
  { tipo: 'ajudou', icone: '🤝', nome: 'Ajudou um colega', pontos: 10, grupo: 'elogio' },
  { tipo: 'organizado', icone: '🧹', nome: 'Deixou a van limpa', pontos: 5, grupo: 'elogio' },
  // ocorrências do tio (pais são avisados)
  { tipo: 'bagunca', icone: '📢', nome: 'Bagunça / gritaria', pontos: -10, grupo: 'ocorrencia' },
  { tipo: 'sem_cinto', icone: '⚠️', nome: 'Tirou o cinto', pontos: -15, grupo: 'ocorrencia' },
  { tipo: 'desrespeito', icone: '🙅', nome: 'Desrespeito', pontos: -20, grupo: 'ocorrencia' },
  { tipo: 'atrasou', icone: '🐢', nome: 'Atrasou a van', pontos: -5, grupo: 'ocorrencia' },
  { tipo: 'briga', icone: '🥊', nome: 'Briga com colega', pontos: -25, grupo: 'ocorrencia' },
];
export const tipoEvento = (t: string) => CATALOGO.find((c) => c.tipo === t);

export interface Nivel { nome: string; icone: string; min: number }
export const NIVEIS: Nivel[] = [
  { nome: 'Passageiro', icone: '🎒', min: 0 },
  { nome: 'Copiloto', icone: '🧭', min: 100 },
  { nome: 'Navegador', icone: '🗺️', min: 250 },
  { nome: 'Capitão da Van', icone: '🧑‍✈️', min: 500 },
  { nome: 'Lenda da Van', icone: '👑', min: 1000 },
];
export function nivelDe(xp: number) {
  let i = 0; while (i + 1 < NIVEIS.length && xp >= NIVEIS[i + 1].min) i++;
  const atual = NIVEIS[i], prox = NIVEIS[i + 1];
  const pct = prox ? Math.round(((xp - atual.min) / (prox.min - atual.min)) * 100) : 100;
  return { atual, prox, pct, falta: prox ? prox.min - xp : 0 };
}

/** XP = soma de tudo que ganhou (só positivos — perder ponto não tira nível, tira saldo). */
export const xpDe = (ev: EventoPontos[]) => ev.reduce((s, e) => s + Math.max(0, e.pontos), 0);
/** Saldo para gastar na loja = ganhos − perdas − resgates aprovados/pendentes. */
export function saldoDe(ev: EventoPontos[], resgates: Resgate[]) {
  const ganho = ev.reduce((s, e) => s + e.pontos, 0);
  const gasto = resgates.filter((r) => r.status !== 'recusado').reduce((s, r) => s + r.custo, 0);
  return Math.max(0, ganho - gasto);
}

/** Dias seguidos (úteis, com evento) em que esteve pronto no portão — conta de hoje para trás. */
export function sequencia(ev: EventoPontos[]) {
  const dias = new Set(ev.filter((e) => e.tipo === 'pronto_portao').map((e) => e.data));
  let n = 0; const d = new Date();
  for (let k = 0; k < 60; k++) {
    const s = hoje(d), dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      if (dias.has(s)) n++;
      else if (s !== hoje()) break; // hoje ainda pode acontecer
    }
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export interface Selo { id: string; icone: string; nome: string; desc: string; ok: boolean; progresso: string }
export function selosDe(ev: EventoPontos[]): Selo[] {
  const c = (t: string) => ev.filter((e) => e.tipo === t).length;
  const ocorr = ev.filter((e) => tipoEvento(e.tipo)?.grupo === 'ocorrencia');
  const ultimaOc = ocorr.map((e) => e.data).sort().pop();
  const diasSemOc = ultimaOc ? Math.floor((Date.now() - new Date(ultimaOc + 'T12:00').getTime()) / 86400000) : 30;
  const seq = sequencia(ev);
  const s = (id: string, icone: string, nome: string, desc: string, atual: number, meta: number): Selo =>
    ({ id, icone, nome, desc, ok: atual >= meta, progresso: `${Math.min(atual, meta)}/${meta}` });
  return [
    s('pontual', '⏰', 'Pontual', 'Pronto no portão 10 vezes', c('pronto_portao'), 10),
    s('cinto', '🔒', 'Cinto de Ouro', '10 elogios de cinto', c('cinto'), 10),
    s('amigo', '🤝', 'Bom Colega', 'Ajudou colegas 3 vezes', c('ajudou'), 3),
    s('fogo', '🔥', 'Em chamas', '5 dias seguidos pronto no portão', seq, 5),
    s('anjo', '😇', 'Anjo da Van', '30 dias sem ocorrência', Math.min(diasSemOc, 30), 30),
    s('estrela', '🌟', 'Semana Perfeita', 'Ganhou uma semana perfeita', c('semana_perfeita'), 1),
  ];
}

export interface Missao { id: string; icone: string; nome: string; atual: number; meta: number; premio: number }
/** Missões da semana (renovam toda segunda). */
export function missoesDe(ev: EventoPontos[]): Missao[] {
  const ini = inicioSemana();
  const sem = ev.filter((e) => e.data >= ini);
  const c = (t: string) => sem.filter((e) => e.tipo === t).length;
  const semOc = sem.every((e) => tipoEvento(e.tipo)?.grupo !== 'ocorrencia');
  return [
    { id: 'm1', icone: '⏰', nome: 'Esteja no portão antes da van 4 vezes', atual: c('pronto_portao'), meta: 4, premio: 20 },
    { id: 'm2', icone: '🔒', nome: 'Ganhe 3 elogios do tio', atual: sem.filter((e) => tipoEvento(e.tipo)?.grupo === 'elogio').length, meta: 3, premio: 15 },
    { id: 'm3', icone: '😇', nome: 'Semana inteira sem ocorrência', atual: semOc ? 1 : 0, meta: 1, premio: 10 },
  ];
}

export type Periodo = 'semana' | 'mes' | 'geral';
export function filtrarPeriodo(ev: EventoPontos[], p: Periodo) {
  if (p === 'geral') return ev;
  const ini = p === 'semana' ? inicioSemana() : `${mesAtual()}-01`;
  return ev.filter((e) => e.data >= ini);
}
