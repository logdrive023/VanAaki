/** Preferências de acessibilidade do aparelho (valem para todos os perfis e para o site). */
export interface PrefsAcess {
  /** multiplicador escolhido no app (o tamanho de letra do celular já entra por baixo) */
  texto: number;
  contraste: boolean;
  /** menos animação */
  movimento: boolean;
  /** tradutor de Libras do governo (VLibras) */
  libras: boolean;
}

const CHAVE = 'vanaaki-acessibilidade';
export const PADRAO: PrefsAcess = { texto: 1, contraste: false, movimento: false, libras: false };
export const TAMANHOS = [
  { v: 1, nome: 'Normal' },
  { v: 1.15, nome: 'Grande' },
  { v: 1.3, nome: 'Maior' },
  { v: 1.5, nome: 'Enorme' },
];

export function lerPrefs(): PrefsAcess {
  try { return { ...PADRAO, ...(JSON.parse(localStorage.getItem(CHAVE) ?? '{}') as Partial<PrefsAcess>) }; } catch { return { ...PADRAO }; }
}

/** O tamanho de letra que o próprio celular já pede (calculado em public/acessibilidade.js). */
export const baseDoCelular = () => (window as unknown as { __vanaakiBaseTexto?: number }).__vanaakiBaseTexto ?? 1;

export function aplicar(p: PrefsAcess) {
  const r = document.documentElement;
  const esc = Math.min(p.texto * baseDoCelular(), 1.8);
  r.style.setProperty('--esc', String(Math.round(esc * 100) / 100));
  r.setAttribute('data-texto', esc >= 1.25 ? 'grande' : 'normal');
  if (p.contraste) r.setAttribute('data-contraste', '1'); else r.removeAttribute('data-contraste');
  if (p.movimento) r.setAttribute('data-movimento', 'reduzido'); else r.removeAttribute('data-movimento');
  if (p.libras) ligarLibras();
  document.querySelector('[vw]')?.classList.toggle('vw-escondido', !p.libras);
}

export function salvarPrefs(p: PrefsAcess) {
  try { localStorage.setItem(CHAVE, JSON.stringify(p)); } catch { /* modo privado: vale só nesta visita */ }
  aplicar(p);
  window.dispatchEvent(new Event('vanaaki-acessibilidade'));
}

/** VLibras (gov.br): só carrega quando a pessoa liga — não pesa para quem não usa. */
let librasCarregado = false;
export function ligarLibras() {
  if (librasCarregado) return;
  librasCarregado = true;
  const caixa = document.createElement('div');
  caixa.setAttribute('vw', '');
  caixa.className = 'enabled';
  caixa.innerHTML = '<div vw-access-button class="active"></div><div vw-plugin-wrapper><div class="vw-plugin-top-wrapper"></div></div>';
  document.body.appendChild(caixa);
  const s = document.createElement('script');
  s.src = 'https://vlibras.gov.br/app/vlibras-plugin.js';
  s.async = true;
  s.onload = () => { const w = window as unknown as { VLibras?: { Widget: new (u: string) => unknown } }; if (!w.VLibras) return; new w.VLibras.Widget('https://vlibras.gov.br/app');
    // o VLibras só se monta no evento "load" da página, que já passou quando a pessoa liga depois
    if (document.readyState === 'complete') window.dispatchEvent(new Event('load'));
  };
  s.onerror = () => { librasCarregado = false; caixa.remove(); };
  document.body.appendChild(s);
}

/** Na abertura do app: liga o que já estava escolhido (o resto o script do <head> já fez). */
export function iniciarAcessibilidade() {
  const p = lerPrefs();
  if (p.libras) ligarLibras();
}
