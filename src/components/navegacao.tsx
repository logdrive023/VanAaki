import { useEffect, useState } from 'react';
import type { LatLng } from '../db/types';
import { I } from './Icone';

/**
 * WAZE E GOOGLE MAPS
 * O navegador do celular não deixa um site abrir outro app sozinho: precisa de um toque.
 * Então o toque que o tio já dá ("Começar", "Embarcou", "Não estava", "Entregue") também abre
 * a próxima parada no app que ele prefere. No Google Maps dá para mandar várias paradas de uma vez.
 */
export type AppNav = 'waze' | 'maps';
export interface PrefNav { app: AppNav; auto: boolean }

const CHAVE = 'vanaaki-navegacao';
/** "Abrir sozinho" vem ligado no celular (onde o Waze/Maps é app) e desligado no computador. */
const PADRAO: PrefNav = { app: 'waze', auto: typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches };
/** Google Maps aceita até 3 paradas no meio do caminho no celular (+ o destino = 4). */
const MAX_PARADAS_MAPS = 4;

export function lerNav(): PrefNav {
  try { return { ...PADRAO, ...(JSON.parse(localStorage.getItem(CHAVE) ?? '{}') as Partial<PrefNav>) }; } catch { return { ...PADRAO }; }
}
export function useNav(): [PrefNav, (m: Partial<PrefNav>) => void] {
  const [p, setP] = useState(lerNav);
  useEffect(() => {
    const f = () => setP(lerNav());
    window.addEventListener('vanaaki-navegacao', f);
    return () => window.removeEventListener('vanaaki-navegacao', f);
  }, []);
  return [p, (m) => {
    const novo = { ...lerNav(), ...m };
    try { localStorage.setItem(CHAVE, JSON.stringify(novo)); } catch { /* modo privado */ }
    window.dispatchEvent(new Event('vanaaki-navegacao'));
  }];
}

const ll = (p: LatLng) => `${p.lat},${p.lng}`;
export const linkWaze = (p: LatLng) => `https://waze.com/ul?ll=${ll(p)}&navigate=yes`;
/** Uma parada ou várias (as primeiras viram paradas no caminho, a última é o destino). */
export function linkMaps(paradas: LatLng[]) {
  const l = paradas.slice(0, MAX_PARADAS_MAPS);
  const destino = l[l.length - 1];
  const meio = l.slice(0, -1);
  return `https://www.google.com/maps/dir/?api=1&destination=${ll(destino)}&travelmode=driving&dir_action=navigate${meio.length ? `&waypoints=${encodeURIComponent(meio.map(ll).join('|'))}` : ''}`;
}
export const linkNav = (app: AppNav, p: LatLng) => (app === 'waze' ? linkWaze(p) : linkMaps([p]));

/** Abre a navegação (chamar no toque do tio). Devolve false se o celular bloqueou (aí o botão grande resolve). */
export function abrirNavegacao(p: LatLng | undefined, app = lerNav().app) {
  if (!p) return false;
  const w = window.open(linkNav(app, p), '_blank');
  if (w) w.opener = null;
  return !!w;
}

const NOME: Record<AppNav, string> = { waze: 'Waze', maps: 'Maps' };

/**
 * Barra de navegação do cartão da parada: o app preferido em destaque, o outro ao lado,
 * as próximas paradas de uma vez no Maps, e o ajuste (qual app e "abrir sozinho").
 */
export function BarraNavegacao({ destino, seguintes = [] }: { destino?: LatLng; seguintes?: LatLng[] }) {
  const [nav, setNav] = useNav();
  const [ajustes, setAjustes] = useState(false);
  if (!destino) return null;
  const outro: AppNav = nav.app === 'waze' ? 'maps' : 'waze';
  const varias = [destino, ...seguintes].slice(0, MAX_PARADAS_MAPS);
  return (
    <div className="barra-nav">
      <div className="bn-linha">
        <a className="btn btn-escuro bn-principal" href={linkNav(nav.app, destino)} target="_blank" rel="noreferrer"><I n={nav.app === 'waze' ? 'navegar' : 'mapa'} />Ir com {NOME[nav.app]}</a>
        <a className="btn btn-claro" href={linkNav(outro, destino)} target="_blank" rel="noreferrer">{NOME[outro]}</a>
        <button type="button" className="btn btn-claro btn-ic" aria-label="Ajustes da navegação" aria-expanded={ajustes} onClick={() => setAjustes(!ajustes)}><I n="config" /></button>
      </div>
      {varias.length > 1 && (
        <a className="bn-varias" href={linkMaps(varias)} target="_blank" rel="noreferrer"><I n="rota" />Próximas {varias.length} paradas de uma vez no Google Maps</a>
      )}
      {ajustes && (
        <div className="bn-ajustes">
          <span className="bn-rot">Abrir com</span>
          <div className="bn-apps" role="radiogroup" aria-label="App de navegação">
            {(['waze', 'maps'] as const).map((a) => (
              <button key={a} type="button" role="radio" aria-checked={nav.app === a} className={nav.app === a ? 'ativo' : ''} onClick={() => setNav({ app: a })}>{a === 'waze' ? 'Waze' : 'Google Maps'}</button>
            ))}
          </div>
          <label className="bn-auto"><input type="checkbox" checked={nav.auto} onChange={(e) => setNav({ auto: e.target.checked })} />
            <span><b>Abrir sozinho a próxima parada</b>Ao tocar em Começar, Embarcou, Não estava ou Entregue, o {NOME[nav.app]} já abre no próximo endereço.</span></label>
          <small className="muted">Com o {NOME[nav.app]} na frente, o celular pode pausar o GPS do VanAaki (principalmente no iPhone). Volte ao VanAaki em cada parada para as famílias seguirem vendo a van.</small>
        </div>
      )}
    </div>
  );
}
