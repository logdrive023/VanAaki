// Landing page: só desenha os ícones (lucide) — não carrega o app nem o banco.
import {
  AlarmClock, ArrowDown, ArrowRight, Bell, Bus, CalendarDays, Check, ChevronRight, createIcons, House, MessageCircle, Navigation, Route,
  School, ShieldCheck, Star, UserRound, Wallet,
} from 'lucide';

createIcons({
  icons: { AlarmClock, ArrowDown, ArrowRight, Bell, Bus, CalendarDays, Check, ChevronRight, House, MessageCircle, Navigation, Route, School, ShieldCheck, Star, UserRound, Wallet },
  attrs: { 'stroke-width': 1.9 },
});
