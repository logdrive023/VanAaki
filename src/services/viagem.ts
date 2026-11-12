import { patch, post } from '../api/cliente';
import type { Aluno, Escola, LatLng, Parada, TipoViagem, Turno, Viagem } from '../db/types';
import { otimizarOrdem } from '../lib/geo';

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

export const iniciarViagem = (_vanId: string, turno: Turno, tipo: TipoViagem, op: OpcoesViagem) => post<Viagem>('/viagens', { turno, tipo, ...op });
export const marcarParada = (viagemId: string, status: 'feito' | 'ausente') => post(`/viagens/${viagemId}/parada`, { status });
export const marcarPronto = (alunoId: string) => post('/viagens/pronto', { alunoId });
export const encerrarViagem = (viagemId: string) => post(`/viagens/${viagemId}/encerrar`);
export const configurarViagem = (viagemId: string, mud: Partial<Pick<Viagem, 'automatico' | 'velocidade' | 'simulado'>>) => patch(`/viagens/${viagemId}/config`, mud);
export const enviarPosicao = (viagemId: string, p: LatLng) => post(`/viagens/${viagemId}/posicao`, p);
export const confirmarEntradaEscola = (viagemId: string, alunoIds: string | string[]) =>
  post(`/viagens/${viagemId}/entrada`, { alunoIds: Array.isArray(alunoIds) ? alunoIds : [alunoIds] });
