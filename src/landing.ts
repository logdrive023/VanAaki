// Landing page independente: só filtra os cards da busca (não carrega o app nem o banco).
const nomes: Record<string, string> = { 'santa-maria': 'Colégio Santa Maria', horizonte: 'Colégio Horizonte', roberto: 'EE Prof. Roberto Lima' };
const form = document.getElementById('form-busca') as HTMLFormElement;
const escola = document.getElementById('b-escola') as HTMLSelectElement;
const titulo = document.getElementById('titulo-busca')!;
const vazio = document.getElementById('sem-resultado')!;
const cards = [...document.querySelectorAll<HTMLElement>('#lista-vans .van-card')];
const chips = [...document.querySelectorAll<HTMLButtonElement>('#filtros .chip')];
let filtro = 'todas';

function aplicar() {
  const e = escola.value;
  let n = 0;
  for (const c of cards) {
    const ok = (!e || (c.dataset.escolas ?? '').split(' ').includes(e))
      && (filtro !== 'vagas' || Number(c.dataset.vagas) > 0)
      && (filtro !== 'rastreio' || c.dataset.rastreio === '1');
    c.hidden = !ok;
    if (ok) n++;
  }
  titulo.textContent = `${n} van${n === 1 ? '' : 's'} ${e ? `atende${n === 1 ? '' : 'm'} o ${nomes[e]}` : 'na sua região'}`;
  vazio.hidden = n > 0;
}

form.addEventListener('submit', (ev) => { ev.preventDefault(); aplicar(); document.getElementById('vans')?.scrollIntoView({ behavior: 'smooth' }); });
escola.addEventListener('change', aplicar);
chips.forEach((ch) => ch.addEventListener('click', () => {
  filtro = ch.dataset.f ?? 'todas';
  chips.forEach((x) => x.classList.toggle('ativo', x === ch));
  aplicar();
}));
aplicar();
