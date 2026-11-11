import type { LatLng } from '../db/types';

/**
 * Traça o caminho pelas ruas entre os pontos (na ordem), usando o roteador público OSRM.
 * Só manda coordenadas (nenhum dado de pessoa). Sem internet → linha reta entre os pontos.
 * Devolve um trecho por perna: trechos[i] vai de pontos[i] até pontos[i+1].
 */
export async function tracarRota(pontos: LatLng[]): Promise<{ trechos: LatLng[][]; real: boolean }> {
  const reta = () => ({ trechos: pontos.slice(1).map((p, i) => [pontos[i], p]), real: false });
  if (pontos.length < 2) return { trechos: [], real: false };
  try {
    const coords = pontos.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=false&steps=true&geometries=geojson`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return reta();
    const j = await r.json();
    const legs = j?.routes?.[0]?.legs as { steps: { geometry: { coordinates: [number, number][] } }[] }[] | undefined;
    if (!legs || legs.length !== pontos.length - 1) return reta();
    const trechos = legs.map((leg, i) => {
      const pts: LatLng[] = [];
      for (const s of leg.steps) for (const [lng, lat] of s.geometry.coordinates) {
        const u = pts[pts.length - 1];
        if (!u || u.lat !== lat || u.lng !== lng) pts.push({ lat, lng });
      }
      // garante que termina exatamente no portão do aluno
      pts.push(pontos[i + 1]);
      return pts;
    });
    return { trechos, real: true };
  } catch {
    return reta();
  }
}
