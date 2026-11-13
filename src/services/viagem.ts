import { patch, post } from '../api/cliente';
import { enfileirar, enfileirarPosicao } from '../api/fila';
import { db } from '../db/db';
import type { Aluno, Escola, LatLng, Parada, TipoViagem, Turno, Viagem } from '../db/types';
import { otimizarOrdem } from '../lib/geo';
import { ordenarEscolas, vaiNoTrecho } from '../lib/turnos';
import { agoraIso, hoje, uid } from '../lib/util';

/**
 * Viagem com várias escolas (as regras rodam no servidor em Go; aqui ficam só os ajudantes da tela):
 *   ida   = garagem → casas → escolas (ordem do horário de ENTRADA)
 *   volta = escolas (ordem do horário de SAÍDA) → casas → garagem
 */

export const DESTINO = '__destino';

export const chaveParada = (p: Parada) => (p.tipo === 'aluno' ? p.alunoId : `esc:${p.escolaId}`);
export const chaveAlvo = (v: Viagem, i: number) => (i < v.paradas.length ? chaveParada(v.paradas[i]) : DESTINO);
export const proximoAlvo = (v: Viagem) => { const i = v.paradas.findIndex((p) => p.status === 'pendente'); return i < 0 ? v.paradas.length : i; };
export const idxEscola = (v: Viagem, escolaId: string) => v.paradas.findIndex((p) => p.tipo === 'escola' && p.escolaId === escolaId);
export const idxAluno = (v: Viagem, alunoId: string) => v.paradas.findIndex((p) => p.tipo === 'aluno' && p.alunoId === alunoId);

const paradaAluno = (a: Aluno): Parada => ({ tipo: 'aluno', alunoId: a.id, escolaId: a.escolaId, status: 'pendente' });
const paradaEscola = (e: Escola): Parada => ({ tipo: 'escola', alunoId: '', escolaId: e.id, status: 'pendente' });

/** Prévia da ordem (linha reta) para a tela antes de sair; o servidor otimiza pelas ruas ao iniciar. */
export function ordemLocal(tipo: TipoViagem, inicio: LatLng, alunos: Aluno[], escolas: Escola[], destino: LatLng, otimizar = true) {
  if (!escolas.length) return { paradas: [] as Parada[], pts: [inicio, destino] };
  const de = tipo === 'ida' ? inicio : escolas[escolas.length - 1].local;
  const ate = tipo === 'ida' ? escolas[0].local : destino;
  const idx = otimizar ? otimizarOrdem(de, alunos.map((a) => a.local), ate) : alunos.map((_, i) => i);
  const casas = idx.map((i) => paradaAluno(alunos[i]));
  const esc = escolas.map(paradaEscola);
  const paradas = tipo === 'ida' ? [...casas, ...esc] : [...esc, ...casas];
  const loc = (p: Parada) => (p.tipo === 'aluno' ? alunos.find((a) => a.id === p.alunoId)!.local : escolas.find((e) => e.id === p.escolaId)!.local);
  return { paradas, pts: [inicio, ...paradas.map(loc), destino] };
}

export const chaveRotaFixa = (turno: Turno, tipo: TipoViagem) => `${turno}|${tipo}`;

/** Ordena pela rota fixa do tio (quem é novo e não está na lista vai para o fim). */
export function ordenarPorFixa<T extends { id: string }>(alunos: T[], ordem: string[]) {
  const pos = new Map(ordem.map((id, i) => [id, i]));
  return [...alunos].sort((a, b) => (pos.get(a.id) ?? 1e6) - (pos.get(b.id) ?? 1e6));
}

export interface OpcoesViagem { automatico: boolean; velocidade: number; otimizar: boolean; simulado: boolean }

/**
 * Começar a rota. Funciona SEM internet: a viagem é montada no aparelho (ordem em linha reta) e vai para a fila;
 * quando a conexão volta, o servidor cria a mesma viagem (mesmo id), traça pelas ruas e avisa as famílias.
 */
export async function iniciarViagem(vanId: string, turno: Turno, tipo: TipoViagem, op: OpcoesViagem): Promise<Viagem> {
  const local = await montarViagemLocal(vanId, turno, tipo, op);
  await enfileirar({ tipo: 'iniciar', caminho: '/viagens', metodo: 'POST', corpo: { turno, tipo, ...op, id: local.id, em: local.iniciadaEm }, viagemId: local.id, local });
  return local;
}

async function montarViagemLocal(vanId: string, turno: Turno, tipo: TipoViagem, op: OpcoesViagem): Promise<Viagem> {
  const van = await db.vans.get(vanId);
  if (!van) throw new Error('Van não encontrada.');
  const cfg = van.turnos.find((t) => t.turno === turno);
  const data = hoje();
  const pres = new Map((await db.presencas.where('data').equals(data).toArray()).map((p) => [p.alunoId, p]));
  let alunos = (await db.alunos.where('vanId').equals(vanId).toArray())
    .filter((a) => a.ativo && a.turno === turno && !!cfg?.escolaIds.includes(a.escolaId) && vaiNoTrecho(pres.get(a.id), tipo));
  if (!alunos.length) throw new Error(`Nenhum aluno vai de van na ${tipo} deste turno.`);
  const todas = await db.escolas.toArray();
  const escolas = ordenarEscolas([...new Set(alunos.map((a) => a.escolaId))].map((id) => todas.find((e) => e.id === id)!).filter(Boolean), turno, tipo);
  const rf = van.rotasFixas?.[chaveRotaFixa(turno, tipo)];
  if (rf?.ativa) alunos = ordenarPorFixa(alunos, rf.ordem);
  const inicio = tipo === 'ida' ? van.garagem : escolas[0].local;
  const destino = tipo === 'ida' ? escolas[escolas.length - 1].local : van.garagem;
  const o = ordemLocal(tipo, inicio, alunos, escolas, destino, op.otimizar && !rf?.ativa);
  const agora = agoraIso();
  return {
    id: uid(), vanId, data, tipo, status: 'em_andamento', inicio, turno, escolaIds: escolas.map((e) => e.id), destino,
    destinoNome: tipo === 'ida' ? escolas[escolas.length - 1].nome : 'Garagem', paradas: o.paradas, alvo: 0, pos: inicio,
    caminho: o.pts.slice(1, 2), trechos: {}, rotaReal: false, rastro: [inicio], naParada: false, automatico: op.automatico,
    simulado: op.simulado, velocidade: op.velocidade, iniciadaEm: agora, avisados: [], fixa: !!rf?.ativa, atualizadoEm: agora,
  };
}

/** Embarcou / não estava / entregue — vai pela fila com a parada certa e a hora em que o tio tocou. */
export async function marcarParada(viagemId: string, status: 'feito' | 'ausente') {
  const v = await db.viagens.get(viagemId);
  if (!v || v.alvo >= v.paradas.length) return;
  await enfileirar({ tipo: 'parada', caminho: `/viagens/${viagemId}/parada`, metodo: 'POST', corpo: { status, chave: chaveParada(v.paradas[v.alvo]), em: agoraIso() }, viagemId });
}
export const marcarPronto = (alunoId: string) => enfileirar({ tipo: 'pronto', caminho: '/viagens/pronto', metodo: 'POST', corpo: { alunoId } });
export const encerrarViagem = (viagemId: string) => enfileirar({ tipo: 'encerrar', caminho: `/viagens/${viagemId}/encerrar`, metodo: 'POST', corpo: {}, viagemId });
export const configurarViagem = (viagemId: string, mud: Partial<Pick<Viagem, 'automatico' | 'velocidade' | 'simulado'>>) => patch(`/viagens/${viagemId}/config`, mud);

/** Posição do GPS: entra na fila (junta vários pontos numa ação só); sem internet, fica guardada com o horário. */
export async function enviarPosicao(viagemId: string, p: LatLng) {
  await enfileirarPosicao(viagemId, p);
}
export const confirmarEntradaEscola = (viagemId: string, alunoIds: string | string[]) =>
  post(`/viagens/${viagemId}/entrada`, { alunoIds: Array.isArray(alunoIds) ? alunoIds : [alunoIds] });
