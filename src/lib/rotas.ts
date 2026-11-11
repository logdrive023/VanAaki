import type { LatLng } from '../db/types';

type Leg = { steps: { geometry: { coordinates: [number, number][] } }[] };

function legsParaTrechos(legs: Leg[], destinos: LatLng[]): LatLng[][] {
  return legs.map((leg, i) => {
    const pts: LatLng[] = [];
    for (const s of leg.steps) for (const [lng, lat] of s.geometry.coordinates) {
      const u = pts[pts.length - 1];
      if (!u || u.lat !== lat || u.lng !== lng) pts.push({ lat, lng });
    }
    pts.push(destinos[i]); // termina exatamente no portão
    return pts;
  });
}

async function osrm(servico: 'route' | 'trip', pontos: LatLng[], extra: string) {
  const coords = pontos.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch(`https://router.project-osrm.org/${servico}/v1/driving/${coords}?overview=false&steps=true&geometries=geojson${extra}`, { signal: ctrl.signal });
    return r.ok ? await r.json() : null;
  } finally { clearTimeout(t); }
}

/**
 * Otimiza a ordem das paradas PELAS RUAS (respeita mão única), com início e fim fixos,
 * usando o serviço "trip" do OSRM. Devolve a ordem (índices das paradas) e o caminho de cada perna.
 * Sem internet → null (o app usa a otimização local em linha reta).
 */
export async function otimizarPelasRuas(inicio: LatLng, paradas: LatLng[], fim: LatLng): Promise<{ ordem: number[]; trechos: LatLng[][] } | null> {
  if (paradas.length < 2) return null;
  try {
    const pts = [inicio, ...paradas, fim];
    const j = await osrm('trip', pts, '&source=first&destination=last&roundtrip=false');
    const wps = j?.waypoints as { waypoint_index: number }[] | undefined;
    const legs = j?.trips?.[0]?.legs as Leg[] | undefined;
    if (!wps || !legs || legs.length !== pts.length - 1) return null;
    // waypoint_index = posição de cada ponto de entrada dentro da viagem otimizada
    const ordemPts = pts.map((_, i) => i).sort((a, b) => wps[a].waypoint_index - wps[b].waypoint_index);
    const ordem = ordemPts.slice(1, -1).map((i) => i - 1);
    return { ordem, trechos: legsParaTrechos(legs, ordemPts.slice(1).map((i) => pts[i])) };
  } catch {
    return null;
  }
}

/**
 * Traça o caminho pelas ruas entre os pontos (na ordem), usando o roteador público OSRM.
 * Só manda coordenadas (nenhum dado de pessoa). Sem internet → linha reta entre os pontos.
 * Devolve um trecho por perna: trechos[i] vai de pontos[i] até pontos[i+1].
 */
export async function tracarRota(pontos: LatLng[]): Promise<{ trechos: LatLng[][]; real: boolean }> {
  const reta = () => ({ trechos: pontos.slice(1).map((p, i) => [pontos[i], p]), real: false });
  if (pontos.length < 2) return { trechos: [], real: false };
  try {
    const j = await osrm('route', pontos, '');
    const legs = j?.routes?.[0]?.legs as Leg[] | undefined;
    if (!legs || legs.length !== pontos.length - 1) return reta();
    return { trechos: legsParaTrechos(legs, pontos.slice(1)), real: true };
  } catch {
    return reta();
  }
}
