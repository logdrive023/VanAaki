import type { Aluno, Escola, LatLng, Viagem } from '../db/types';
import { chaveAlvo, idxAluno, idxEscola } from '../services/viagem';
import { etaMin } from './geo';
import { atrasoPrevisto, horarioAlvo } from './turnos';

/**
 * REGRA DE SEGURANÇA (combinada com o time):
 * - A família NÃO vê onde a van está enquanto o tio está em outras casas ou em outra escola,
 *   e NÃO sabe quem são nem onde moram os outros alunos.
 * - Sabe só: do próprio filho, a escola dele e QUANTAS paradas faltam, com a previsão.
 * - O mapa aparece quando o próximo destino da van é a casa dela ou a escola do filho
 *   (ida: indo deixar na escola · volta: indo buscar na escola).
 * A escola segue a mesma ideia: vê a van no mapa só quando o próximo destino é ela.
 */
export type Fase =
  | 'sem_viagem' | 'nao_vai' | 'ausente'
  | 'aguardando' | 'proximo' | 'na_porta'          // casa (ida: buscar · volta: entregar)
  | 'a_bordo' | 'a_bordo_final' | 'chegou_escola'  // ida, depois de embarcar
  | 'volta_outra_escola' | 'volta_indo_escola' | 'volta_na_escola' // volta, antes de sair da escola
  | 'entregue';

export interface VisaoFamilia {
  fase: Fase;
  mostrarMapa: boolean;
  /** caminho visível (só o trecho permitido) */
  caminho: LatLng[];
  /** onde fica o alvo visível (casa ou escola) */
  alvo?: LatLng;
  alvoTipo?: 'casa' | 'escola';
  eta?: number;
  paradasAntes: number;
  /** hora do acontecimento principal da fase (embarque, chegada…) */
  horaFase?: string;
}

/** Caminho do ponto atual até a parada `ate` (inclusive), passando pelas pendentes do meio. */
export function caminhoAte(v: Viagem, ate: number) {
  const pts: LatLng[] = [v.pos, ...v.caminho];
  for (let i = v.alvo + 1; i <= ate; i++) {
    if (i < v.paradas.length && v.paradas[i].status !== 'pendente') continue;
    pts.push(...(v.trechos[chaveAlvo(v, i)] ?? []));
  }
  return pts;
}
const pendentesEntre = (v: Viagem, de: number, ate: number) => v.paradas.slice(de, ate).filter((p) => p.status === 'pendente').length;
/** Minutos até a parada `i` (contando 1 min por parada no meio). */
export function etaAte(v: Viagem, i: number) {
  if (v.status !== 'em_andamento') return 0;
  return etaMin(caminhoAte(v, i), pendentesEntre(v, v.alvo, i), v.rotaReal);
}

export function visaoFamilia(v: Viagem | undefined, aluno: Aluno, escola?: Escola): VisaoFamilia {
  const base = { mostrarMapa: false, caminho: [] as LatLng[], paradasAntes: 0 };
  if (!v) return { ...base, fase: 'sem_viagem' };
  const k = idxAluno(v, aluno.id);
  if (k < 0) return { ...base, fase: 'nao_vai' };
  const p = v.paradas[k];
  const s = idxEscola(v, aluno.escolaId);
  const ps = s >= 0 ? v.paradas[s] : undefined;
  const ativa = v.status === 'em_andamento';
  if (p.status === 'ausente') return { ...base, fase: p.avisou ? 'nao_vai' : 'ausente', horaFase: p.hora };

  const mapa = (i: number, tipo: 'casa' | 'escola') => ({
    mostrarMapa: true, caminho: [v.pos, ...v.caminho], alvoTipo: tipo,
    alvo: tipo === 'casa' ? aluno.local : escola?.local, eta: v.naParada ? 0 : etaAte(v, i), paradasAntes: 0,
  });

  if (v.tipo === 'ida') {
    if (p.status === 'pendente') {
      if (!ativa) return { ...base, fase: 'sem_viagem' };
      if (v.alvo === k) return { fase: v.naParada ? 'na_porta' : 'proximo', ...mapa(k, 'casa') };
      return { ...base, fase: 'aguardando', eta: etaAte(v, k), paradasAntes: pendentesEntre(v, v.alvo, k) };
    }
    // embarcou
    if (!ps || ps.status !== 'pendente' || !ativa) return { ...base, fase: 'chegou_escola', horaFase: ps?.hora ?? v.concluidaEm };
    if (v.alvo === s) return v.naParada ? { ...base, fase: 'chegou_escola', horaFase: v.chegouParadaEm } : { fase: 'a_bordo_final', ...mapa(s, 'escola') };
    return { ...base, fase: 'a_bordo', eta: etaAte(v, s), paradasAntes: pendentesEntre(v, v.alvo, s), horaFase: p.hora };
  }

  // volta
  if (p.status === 'feito') return { ...base, fase: 'entregue', horaFase: p.hora };
  if (!ativa) return { ...base, fase: 'sem_viagem' };
  if (ps && ps.status === 'pendente') {
    if (v.alvo === s) return v.naParada ? { ...base, fase: 'volta_na_escola' } : { fase: 'volta_indo_escola', ...mapa(s, 'escola') };
    return { ...base, fase: 'volta_outra_escola', eta: etaAte(v, s), paradasAntes: pendentesEntre(v, v.alvo, s) };
  }
  // já saiu da escola com o tio, esperando a vez da casa
  if (v.alvo === k) return { fase: v.naParada ? 'na_porta' : 'proximo', ...mapa(k, 'casa') };
  return { ...base, fase: 'aguardando', eta: etaAte(v, k), paradasAntes: pendentesEntre(v, v.alvo, k), horaFase: ps?.hora };
}

/** O que a escola pode ver de uma viagem que passa por ela. */
export function visaoEscola(v: Viagem, escola: Escola) {
  const s = idxEscola(v, escola.id);
  const ps = s >= 0 ? v.paradas[s] : undefined;
  const meus = v.paradas.filter((p) => p.tipo === 'aluno' && p.escolaId === escola.id);
  const ativa = v.status === 'em_andamento';
  const pendente = !!ps && ps.status === 'pendente' && ativa;
  const eta = pendente && s >= 0 ? (v.alvo === s && v.naParada ? 0 : etaAte(v, s)) : 0;
  const horario = horarioAlvo(escola, v.turno, v.tipo);
  const atraso = pendente ? atrasoPrevisto(eta, horario) : null;
  let estado: 'a_caminho' | 'na_porta' | 'feito' | 'pulada' | 'encerrada';
  if (!ps || ps.status === 'ausente') estado = 'pulada';
  else if (ps.status === 'feito') estado = 'feito';
  else if (!ativa) estado = 'encerrada';
  else estado = v.alvo === s && v.naParada ? 'na_porta' : 'a_caminho';
  return {
    estado, eta, horario, atraso, hora: ps?.hora,
    /** ida: já a bordo vindo para cá · volta: quantos vai levar */
    abordo: meus.filter((p) => p.status === 'feito').length,
    aBuscar: meus.filter((p) => p.status === 'pendente').length,
    total: meus.filter((p) => p.status !== 'ausente').length,
    paradasAntes: pendente ? pendentesEntre(v, v.alvo, s) : 0,
    mostrarMapa: pendente && v.alvo === s && !v.naParada,
    caminho: pendente && v.alvo === s ? [v.pos, ...v.caminho] : [],
    alunosIds: meus.map((p) => p.alunoId),
  };
}
