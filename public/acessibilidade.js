/* VanAaki — acessibilidade aplicada antes de desenhar a página (sem "piscar" no tamanho padrão).
   Tamanho da letra = o que a pessoa escolheu no app × o tamanho de letra do próprio celular/navegador. */
(function () {
  var p = {};
  try { p = JSON.parse(localStorage.getItem('vanaaki-acessibilidade') || '{}') || {}; } catch (e) { p = {}; }
  var r = document.documentElement;
  var base = 1;
  try {
    base = parseFloat(getComputedStyle(r).fontSize) / 16 || 1;
    // iPhone: o "Tamanho do Texto" do sistema (Dynamic Type) só aparece na fonte -apple-system-body
    var t = document.createElement('span');
    t.style.font = '-apple-system-body';
    if (t.style.font) { t.style.position = 'absolute'; t.style.visibility = 'hidden'; r.appendChild(t); base = Math.max(base, parseFloat(getComputedStyle(t).fontSize) / 17 || 1); r.removeChild(t); }
  } catch (e) { /* segue com 1 */ }
  base = Math.min(Math.max(base, 1), 1.6);
  var esc = Math.min((Number(p.texto) || 1) * base, 1.8);
  r.style.setProperty('--esc', String(Math.round(esc * 100) / 100));
  r.setAttribute('data-texto', esc >= 1.25 ? 'grande' : 'normal');
  if (p.contraste) r.setAttribute('data-contraste', '1'); else r.removeAttribute('data-contraste');
  if (p.movimento) r.setAttribute('data-movimento', 'reduzido'); else r.removeAttribute('data-movimento');
  window.__vanaakiBaseTexto = base;
})();
