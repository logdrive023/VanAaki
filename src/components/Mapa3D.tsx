import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { Bus, createElement as svgIcone, House, MapPin, School, type IconNode } from 'lucide';
import type { LatLng } from '../db/types';

/**
 * Mapa 3D (MapLibre GL + estilo "liberty" do OpenFreeMap: prédios em 3D, sem chave de API).
 * Os azulejos vêm da internet; os já vistos ficam guardados pelo Service Worker.
 */
const ESTILO = 'https://tiles.openfreemap.org/styles/liberty';

export type TipoMarcador = 'van' | 'casa' | 'escola' | 'garagem' | 'parada' | 'feito' | 'ausente' | 'alvo' | 'pin' | 'inicio' | 'fim';
export interface Marcador { id: string; pos: LatLng; tipo: TipoMarcador; texto?: string; rotulo?: string }
export interface Linha { id: string; pts: LatLng[]; tipo: 'rota' | 'feita' | 'previa' }

interface Props {
  marcadores: Marcador[];
  linhas?: Linha[];
  /** posição que a câmera acompanha (a van) */
  seguir?: LatLng;
  /** pontos para enquadrar quando `chave` muda */
  enquadrar?: LatLng[];
  chave?: string;
  altura?: number | string;
  onClick?: (p: LatLng) => void;
  centro?: LatLng;
}

const ICONE: Partial<Record<TipoMarcador, IconNode>> = { van: Bus, casa: House, escola: School, pin: MapPin };

export default function Mapa3D({ marcadores, linhas = [], seguir, enquadrar, chave, altura = 420, onClick, centro }: Props) {
  const div = useRef<HTMLDivElement>(null);
  const mapa = useRef<maplibregl.Map | null>(null);
  const pins = useRef(new Map<string, { m: maplibregl.Marker; el: HTMLDivElement; sig: string }>());
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState(false);
  const [acompanhar, setAcompanhar] = useState(true);
  const [tresD, setTresD] = useState(true);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  // cria o mapa uma vez
  useEffect(() => {
    const ini = centro ?? seguir ?? enquadrar?.[0] ?? marcadores[0]?.pos ?? { lat: -23.5905, lng: -46.6300 };
    const m = new maplibregl.Map({
      container: div.current!, style: ESTILO, center: [ini.lng, ini.lat], zoom: 16.2, pitch: 58, bearing: -20,
      maxPitch: 75, attributionControl: { compact: true },
    });
    mapa.current = m;
    // 'style.load' chega assim que o estilo carrega ('load' espera TODOS os azulejos baixarem)
    const montar = () => {
      if (m.getSource('linhas')) { setPronto(true); return; }
      m.addSource('linhas', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'l-feita', type: 'line', source: 'linhas', filter: ['==', ['get', 'tipo'], 'feita'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#9A9DA6', 'line-width': 4, 'line-dasharray': [1, 1.5] } });
      m.addLayer({ id: 'l-previa', type: 'line', source: 'linhas', filter: ['==', ['get', 'tipo'], 'previa'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#111318', 'line-width': 3.5, 'line-dasharray': [2, 1.5] } });
      m.addLayer({ id: 'l-rota-borda', type: 'line', source: 'linhas', filter: ['==', ['get', 'tipo'], 'rota'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 10 } });
      m.addLayer({ id: 'l-rota', type: 'line', source: 'linhas', filter: ['==', ['get', 'tipo'], 'rota'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#111318', 'line-width': 5 } });
      setPronto(true);
    };
    m.on('style.load', montar);
    m.on('load', montar);
    m.on('error', (e) => { if (/style|Failed to fetch|NetworkError/i.test(String(e?.error?.message ?? ''))) setErro(true); });
    m.on('dragstart', () => setAcompanhar(false));
    m.on('click', (e) => clickRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(div.current!);
    return () => { ro.disconnect(); pins.current.forEach((p) => p.m.remove()); pins.current.clear(); m.remove(); mapa.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // linhas
  useEffect(() => {
    const m = mapa.current;
    if (!m || !pronto) return;
    const src = m.getSource('linhas') as maplibregl.GeoJSONSource | undefined;
    src?.setData({
      type: 'FeatureCollection',
      features: linhas.filter((l) => l.pts.length > 1).map((l) => ({
        type: 'Feature', properties: { tipo: l.tipo }, geometry: { type: 'LineString', coordinates: l.pts.map((p) => [p.lng, p.lat]) },
      })),
    });
  }, [linhas, pronto]);

  // marcadores (reaproveita os elementos; só move)
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const vivos = new Set<string>();
    for (const mk of marcadores) {
      vivos.add(mk.id);
      const sig = `${mk.tipo}|${mk.texto ?? ''}|${mk.rotulo ?? ''}`;
      let p = pins.current.get(mk.id);
      if (p && p.sig !== sig) { p.m.remove(); pins.current.delete(mk.id); p = undefined; }
      if (!p) {
        const el = document.createElement('div');
        el.className = `mk mk-${mk.tipo}`;
        const ic = ICONE[mk.tipo];
        if (mk.texto !== undefined) el.textContent = mk.texto;
        else if (ic) { const svg = svgIcone(ic); svg.setAttribute('stroke-width', '2.2'); el.appendChild(svg); }
        else if (mk.tipo === 'garagem') el.textContent = 'P';
        if (mk.rotulo) { const r = document.createElement('span'); r.className = 'mk-rotulo'; r.textContent = mk.rotulo; el.appendChild(r); }
        const marker = new maplibregl.Marker({ element: el }).setLngLat([mk.pos.lng, mk.pos.lat]).addTo(m);
        p = { m: marker, el, sig };
        pins.current.set(mk.id, p);
      } else {
        p.m.setLngLat([mk.pos.lng, mk.pos.lat]);
      }
    }
    for (const [id, p] of pins.current) if (!vivos.has(id)) { p.m.remove(); pins.current.delete(id); }
  }, [marcadores]);

  // câmera acompanha a van
  useEffect(() => {
    const m = mapa.current;
    if (!m || !seguir || !acompanhar) return;
    m.easeTo({ center: [seguir.lng, seguir.lat], duration: 450, easing: (t) => t });
  }, [seguir?.lat, seguir?.lng, acompanhar]); // eslint-disable-line react-hooks/exhaustive-deps

  // enquadrar pontos (ao abrir / quando a chave muda)
  useEffect(() => {
    const m = mapa.current;
    if (!m || !enquadrar?.length || seguir) return;
    if (enquadrar.length === 1) { m.jumpTo({ center: [enquadrar[0].lng, enquadrar[0].lat], zoom: 16.5 }); return; }
    const b = new maplibregl.LngLatBounds();
    enquadrar.forEach((p) => b.extend([p.lng, p.lat]));
    m.fitBounds(b, { padding: 70, pitch: tresD ? 50 : 0, bearing: tresD ? -20 : 0, duration: 0, maxZoom: 17 });
  }, [chave, pronto]); // eslint-disable-line react-hooks/exhaustive-deps

  const alternar3D = () => {
    const m = mapa.current; if (!m) return;
    const novo = !tresD; setTresD(novo);
    m.easeTo({ pitch: novo ? 58 : 0, bearing: novo ? -20 : 0, duration: 700 });
  };
  const recentrar = () => {
    const m = mapa.current; if (!m) return;
    setAcompanhar(true);
    if (seguir) m.easeTo({ center: [seguir.lng, seguir.lat], zoom: 16.8, duration: 600 });
    else if (enquadrar?.length) {
      const b = new maplibregl.LngLatBounds(); enquadrar.forEach((p) => b.extend([p.lng, p.lat]));
      m.fitBounds(b, { padding: 70, maxZoom: 17, duration: 600 });
    }
  };

  return (
    <div className="mapa3d" style={{ height: altura }}>
      <div ref={div} style={{ position: 'absolute', inset: 0 }} />
      <div className="mapa-botoes">
        <button type="button" className={tresD ? 'on' : ''} onClick={alternar3D} title="Alternar 3D">3D</button>
        <button type="button" className={seguir && acompanhar ? 'on' : ''} onClick={recentrar} title="Centralizar">◎</button>
        <button type="button" onClick={() => mapa.current?.zoomIn()} title="Aproximar">+</button>
        <button type="button" onClick={() => mapa.current?.zoomOut()} title="Afastar">−</button>
      </div>
      {erro && <div className="mapa-aviso">🌐 Sem internet para carregar o mapa.<br />O resto do app continua funcionando.</div>}
    </div>
  );
}
