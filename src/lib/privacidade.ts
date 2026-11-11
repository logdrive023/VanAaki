import type { LatLng, Viagem } from '../db/types';
import { DESTINO, chaveAlvo } from '../services/viagem';
import { etaMin } from './geo';

/**
 * REGRA DE SEGURANÇA (combinada com o time):
 * - A família NÃO vê onde a van está enquanto o tio busca outras crianças,
 *   e NÃO sabe quem são nem onde moram os outros alunos.
 * - Sabe só: do próprio filho, o destino final e QUANTAS paradas faltam.
 * - O mapa aparece quando a próxima parada é a casa dela, ou quando o filho já está a bordo
 *   e a van está no último trecho (indo direto para o destino final).
 * A escola segue a mesma ideia: vê a van só no último trecho até ela.
 */
export type Fase =
  | 'sem_viagem' | 'nao_vai' | 'aguardando' | 'proximo' | 'na_porta'
  | 'a_bordo' | 'a_bordo_final' | 'entregue' | 'chegou_destino' | 'ausente';

export interface VisaoFamilia {
  fase: Fase;
  mostrarMapa: boolean;
  /** caminho visível (só o trecho permitido) */
  caminho: LatLng[];
  /** onde fica o alvo visível (casa ou destino) */
  alvo?: LatLng;
  eta?: number;
  paradasAntes: number;
}

/** Caminho do ponto atual até o alvo de índice `ate` (inclusive), passando pelas paradas pendentes do meio. */
export function caminhoAte(v: Viagem, ate: number) {
  const pts: LatLng[] = [v.pos, ...v.caminho];
  for (let i = v.alvo + 1; i <= ate; i++) {
    if (i < v.paradas.length && v.paradas[i].status !== 'pendente') continue;
    pts.push(...(v.trechos[chaveAlvo(v, i)] ?? []));
  }
  return pts;
}
const pendentesEntre = (v: Viagem, de: number, ate: number) => v.paradas.slice(de, ate).filter((p) => p.status === 'pendente').length;

export function visaoFamilia(v: Viagem | undefined, alunoId: string, casa: LatLng): VisaoFamilia {
  const base = { mostrarMapa: false, caminho: [], paradasAntes: 0 };
  if (!v) return { ...base, fase: 'sem_viagem' };
  const idx = v.paradas.findIndex((p) => p.alunoId === alunoId);
  if (idx < 0) return { ...base, fase: 'nao_vai' };
  const p = v.paradas[idx];
  const fim = v.paradas.length;
  if (p.status === 'ausente') return { ...base, fase: p.avisou ? 'nao_vai' : 'ausente' };

  if (p.status === 'pendente') {
    const antes = pendentesEntre(v, v.alvo, idx);
    const cam = caminhoAte(v, idx);
    const eta = etaMin(cam, antes, v.rotaReal);
    if (v.status !== 'em_andamento') return { ...base, fase: 'sem_viagem' };
    if (v.alvo === idx) {
      return { fase: v.naParada ? 'na_porta' : 'proximo', mostrarMapa: true, caminho: [v.pos, ...v.caminho], alvo: casa, eta: v.naParada ? 0 : eta, paradasAntes: 0 };
    }
    return { ...base, fase: 'aguardando', eta, paradasAntes: antes };
  }

  // já embarcou (ida) ou já foi entregue (volta)
  if (v.tipo === 'volta') return { ...base, fase: 'entregue' };
  if (v.status === 'concluida') return { ...base, fase: 'chegou_destino' };
  const restantes = pendentesEntre(v, v.alvo, fim);
  const cam = caminhoAte(v, fim);
  const eta = etaMin(cam, restantes, v.rotaReal);
  if (v.alvo === fim) return { fase: 'a_bordo_final', mostrarMapa: true, caminho: cam, alvo: v.destino, eta, paradasAntes: 0 };
  return { ...base, fase: 'a_bordo', eta, paradasAntes: restantes };
}

/** O que a escola pode ver de uma viagem de ida que vem para ela. */
export function visaoEscola(v: Viagem) {
  const fim = v.paradas.length;
  const abordo = v.paradas.filter((p) => p.status === 'feito').length;
  const faltam = pendentesEntre(v, 0, fim);
  const cam = caminhoAte(v, fim);
  const eta = v.status === 'em_andamento' ? etaMin(cam, faltam, v.rotaReal) : 0;
  const ultimoTrecho = v.status === 'em_andamento' && v.alvo === fim;
  return { abordo, faltam, eta, mostrarMapa: ultimoTrecho, caminho: ultimoTrecho ? cam : [] };
}

export { DESTINO };
