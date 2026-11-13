import type { Aluno, Presenca, TipoViagem, Turno } from '../../db/types';
import { compCaminho, etaMin } from '../../lib/geo';
import { ordenarEscolas, planejarHorario, vaiNoTrecho } from '../../lib/turnos';
import { chaveRotaFixa, ordemLocal, ordenarPorFixa } from '../../services/viagem';
import type { DadosVan } from './dados';

/**
 * Planejamento de UM trecho (ex.: ida da manhã) num dia: quem vai, quem fica fora, a ordem das paradas,
 * a distância e o horário (hora de sair, chegada em cada escola). Usado pela Agenda, pelo Painel e pela Rota.
 * `presencaDe` = combinado do aluno naquele dia (sem combinado = vai e volta).
 */
export function planejarTrecho(d: DadosVan, turno: Turno, tipo: TipoViagem, presencaDe: (alunoId: string) => Presenca | undefined, agora = new Date(), forcarOtimizado = false) {
  const van = d.van!;
  const cfg = van.turnos.find((t) => t.turno === turno);
  const base = d.ativos.filter((a) => a.turno === turno && !!cfg?.escolaIds.includes(a.escolaId));
  const rf = van.rotasFixas?.[chaveRotaFixa(turno, tipo)];
  const fixa = !!rf?.ativa && !forcarOtimizado;
  const doTurno: Aluno[] = fixa ? ordenarPorFixa(base, rf!.ordem) : base;
  const vao = doTurno.filter((a) => vaiNoTrecho(presencaDe(a.id), tipo));
  const fora = doTurno.filter((a) => !vao.includes(a));
  const escolas = ordenarEscolas([...new Set(vao.map((a) => a.escolaId))].map((id) => d.mapaEscolas.get(id)!).filter(Boolean), turno, tipo);
  const inicio = tipo === 'ida' ? van.garagem : escolas[0]?.local ?? van.garagem;
  const fim = tipo === 'ida' ? escolas[escolas.length - 1]?.local ?? van.garagem : van.garagem;
  const o = ordemLocal(tipo, inicio, vao, escolas, fim, !fixa);
  const min = etaMin(o.pts, o.paradas.length);
  const horario = planejarHorario(tipo, turno, o.paradas, d.mapaEscolas, (i) => etaMin(o.pts.slice(0, i + 2), i), min, agora, d.cfg.folgaMin);
  return { ...o, turno, tipo, vao, fora, doTurno, escolas, fixa, rf, min, km: compCaminho(o.pts) / 1000, horario, inicio, fim };
}
export type PlanoTrecho = ReturnType<typeof planejarTrecho>;

/** Combinado do aluno num dia, a partir da lista de presenças da agenda. */
export const presencasDoDia = (agenda: Presenca[], data: string) => {
  const m = new Map(agenda.filter((p) => p.data === data).map((p) => [p.alunoId, p]));
  return (alunoId: string) => m.get(alunoId);
};
