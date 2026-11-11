import type { LatLng } from '../db/types';

/** Ruas não são linha reta: fator médio para estimar a distância real a partir da distância em linha reta. */
const FATOR_RUA = 1.3;
/** Velocidade média de van escolar na cidade (km/h). */
export const VEL_MEDIA_KMH = 28;
/** Minutos gastos em cada parada (embarque). */
export const MIN_POR_PARADA = 1;

/** Distância em metros (fórmula de haversine). */
export function distM(a: LatLng, b: LatLng) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const distRuaM = (a: LatLng, b: LatLng) => distM(a, b) * FATOR_RUA;

/** Comprimento de um caminho (estimativa por rua), em metros. */
export function compCaminho(pts: LatLng[]) {
  let t = 0; for (let i = 1; i < pts.length; i++) t += distRuaM(pts[i - 1], pts[i]); return t;
}

/** Anda `metros` (em linha reta no mapa) de `de` em direção a `para`. Devolve a nova posição e se chegou. */
export function andar(de: LatLng, para: LatLng, metros: number): { pos: LatLng; chegou: boolean } {
  const d = distM(de, para);
  if (d <= metros || d < 1) return { pos: { ...para }, chegou: true };
  const f = metros / d;
  return { pos: { lat: de.lat + (para.lat - de.lat) * f, lng: de.lng + (para.lng - de.lng) * f }, chegou: false };
}

/**
 * Anda `metros` seguindo o caminho (lista de pontos pelas ruas).
 * Devolve a nova posição, o que falta do caminho e se chegou ao fim.
 */
export function seguirCaminho(pos: LatLng, caminho: LatLng[], metros: number): { pos: LatLng; caminho: LatLng[]; chegou: boolean } {
  let atual = pos; const resto = caminho.slice(); let falta = metros;
  while (resto.length) {
    const d = distM(atual, resto[0]);
    if (d > falta) return { pos: andar(atual, resto[0], falta).pos, caminho: resto, chegou: false };
    falta -= d; atual = resto.shift()!;
  }
  return { pos: atual, caminho: [], chegou: true };
}

/** Comprimento real (sem fator de rua) — para caminhos que já seguem as ruas. */
export function compReal(pts: LatLng[]) { let t = 0; for (let i = 1; i < pts.length; i++) t += distM(pts[i - 1], pts[i]); return t; }

/** Minutos estimados para percorrer um caminho com `paradasNoMeio` paradas intermediárias. */
export function etaMin(pts: LatLng[], paradasNoMeio = 0, pelasRuas = false) {
  const km = (pelasRuas ? compReal(pts) : compCaminho(pts)) / 1000;
  return Math.max(1, Math.round((km / VEL_MEDIA_KMH) * 60 + paradasNoMeio * MIN_POR_PARADA));
}

/**
 * Otimiza a ordem das paradas (problema do caixeiro viajante com início e fim fixos):
 * vizinho mais próximo para começar + melhoria 2-opt até não ter mais ganho.
 * Devolve os índices de `paradas` na nova ordem.
 */
export function otimizarOrdem(inicio: LatLng, paradas: LatLng[], fim: LatLng): number[] {
  const n = paradas.length;
  if (n <= 1) return paradas.map((_, i) => i);
  // vizinho mais próximo
  const rest = new Set(paradas.map((_, i) => i));
  const ordem: number[] = [];
  let atual = inicio;
  while (rest.size) {
    let melhor = -1, md = Infinity;
    for (const i of rest) { const d = distM(atual, paradas[i]); if (d < md) { md = d; melhor = i; } }
    ordem.push(melhor); rest.delete(melhor); atual = paradas[melhor];
  }
  // 2-opt com pontas fixas
  const pt = (k: number) => (k < 0 ? inicio : k >= n ? fim : paradas[ordem[k]]);
  let melhorou = true, guarda = 0;
  while (melhorou && guarda++ < 200) {
    melhorou = false;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const antes = distM(pt(i - 1), pt(i)) + distM(pt(j), pt(j + 1));
        const depois = distM(pt(i - 1), pt(j)) + distM(pt(i), pt(j + 1));
        if (depois + 0.5 < antes) { ordem.splice(i, j - i + 1, ...ordem.slice(i, j + 1).reverse()); melhorou = true; }
      }
    }
  }
  return ordem;
}
