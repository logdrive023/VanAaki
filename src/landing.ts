// Landing page: ícones (lucide), o celular animado, revelar ao rolar e a barra fixa no celular.
// Não carrega o app nem o banco.
import {
  AlarmClock, ArrowDown, ArrowRight, Bell, Bus, CalendarDays, Check, CheckCheck, ChevronDown, ChevronRight, createIcons, House,
  MessageCircle, Navigation, Play, QrCode, Route, School, ShieldCheck, Star, UserRound, Wallet, WifiOff,
} from 'lucide';

createIcons({
  icons: { AlarmClock, ArrowDown, ArrowRight, Bell, Bus, CalendarDays, Check, CheckCheck, ChevronDown, ChevronRight, House, MessageCircle, Navigation, Play, QrCode, Route, School, ShieldCheck, Star, UserRound, Wallet, WifiOff },
  attrs: { 'stroke-width': 1.9 },
});

const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;

// celular do topo: hora de sair → próxima parada → embarque confirmado (a cada 3,5 s)
const cenas = [...document.querySelectorAll<HTMLElement>('.cena')];
const pontos = [...document.querySelectorAll<HTMLElement>('.f-pontos i')];
let atual = 0;
const mostrar = (i: number) => {
  cenas.forEach((c, k) => c.classList.toggle('ativa', k === i));
  pontos.forEach((p, k) => p.classList.toggle('on', k === i));
};
mostrar(0);
if (!calmo && cenas.length) setInterval(() => { atual = (atual + 1) % cenas.length; mostrar(atual); }, 3500);

// aparecer ao rolar (sutil; desligado para quem pede menos movimento)
const itens = document.querySelectorAll<HTMLElement>('.revelar');
if (calmo || !('IntersectionObserver' in window)) itens.forEach((el) => el.classList.add('visivel'));
else {
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visivel'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  itens.forEach((el, i) => { el.style.transitionDelay = `${(i % 4) * 60}ms`; io.observe(el); });
}

// topo com borda ao rolar + barra "Ver a demonstração" no celular depois do primeiro botão sumir
const topo = document.getElementById('topo');
const barra = document.getElementById('barra-cta');
const ctas = document.querySelector('.hero-ctas');
const aoRolar = () => {
  topo?.classList.toggle('rolou', scrollY > 8);
  const fim = document.getElementById('entrar')?.getBoundingClientRect().top ?? Infinity;
  const passou = (ctas?.getBoundingClientRect().bottom ?? 0) < 0 && fim > innerHeight;
  barra?.classList.toggle('visivel', passou);
};
addEventListener('scroll', aoRolar, { passive: true });
aoRolar();

// acorda o servidor da demonstração já na landing (o plano grátis "dorme" quando ninguém usa)
const api = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '');
if (api) void fetch(`${api}/saude`).catch(() => undefined);
