import {
  AlarmClock, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BadgeCheck, Bell, BellOff, Bus, CalendarDays, Check, CheckCheck, ChevronRight,
  CircleAlert, CircleDollarSign, ClipboardList, Clock, Copy, Download, ExternalLink, FileText, Flag, FlaskConical, Gift, GraduationCap,
  Hand, History, House, Inbox, Landmark, LayoutDashboard, Link2, ListChecks, Loader2, LogOut, MapPin, Map as MapaIc, MessageCircle,
  Moon, Navigation, Phone, Plus, Printer, RefreshCcw, Route, Satellite, School, Search, Send, Settings2, ShieldCheck, Smartphone, Sparkles,
  Square, Star, Sun, Sunset, Target, ThumbsUp, Timer, Trash2, TrafficCone, Trophy, User, UserRound, Users, Wallet, Wifi, WifiOff, X, Zap,
  type LucideProps,
} from 'lucide-react';

/** Ícones do app (lucide), por nome. Um só traço, um só tamanho de linha: visual limpo e consistente. */
const ICONES = {
  painel: LayoutDashboard, rota: Route, mapa: MapaIc, alunos: Users, aluno: UserRound, usuario: User, financeiro: Wallet, dinheiro: CircleDollarSign,
  estrela: Star, premio: Gift, mensagem: MessageCircle, escola: School, formatura: GraduationCap, van: Bus, casa: House, pin: MapPin,
  sino: Bell, semSino: BellOff, check: Check, checks: CheckCheck, mais: Plus, fechar: X, busca: Search, enviar: Send, telefone: Phone,
  navegar: Navigation, relogio: Clock, alarme: AlarmClock, cronometro: Timer, calendario: CalendarDays, alerta: CircleAlert, escudo: ShieldCheck,
  selo: BadgeCheck, lista: ClipboardList, checklist: ListChecks, historico: History, baixar: Download, imprimir: Printer, link: Link2, copiar: Copy,
  externo: ExternalLink, documento: FileText, governo: Landmark, sair: LogOut, recomecar: RefreshCcw, config: Settings2, celular: Smartphone,
  satelite: Satellite, teste: FlaskConical, raio: Zap, alvo: Target, trofeu: Trophy, joinha: ThumbsUp, mao: Hand, brilho: Sparkles, bandeira: Flag,
  lixo: Trash2, parar: Square, cima: ArrowUp, baixo: ArrowDown, voltar: ArrowLeft, seguir: ArrowRight, chevron: ChevronRight, caixa: Inbox,
  portaria: TrafficCone, carregando: Loader2, wifi: Wifi, semWifi: WifiOff, manha: Sun, tarde: Sunset, noite: Moon,
} as const;

export type NomeIcone = keyof typeof ICONES;

export function I({ n, tam, ...p }: { n: NomeIcone; tam?: number } & Omit<LucideProps, 'ref'>) {
  const C = ICONES[n];
  return <C size={tam ?? 18} strokeWidth={1.9} aria-hidden {...p} />;
}

/** Marca do VanAaki: a van amarela sobre o grafite (as cores da faixa ESCOLAR). */
export function Marca({ tam = 30 }: { tam?: number }) {
  return (
    <svg className="logo-marca" width={tam} height={tam} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="16" fill="#111318" />
      <rect x="11" y="18" width="42" height="24" rx="6" fill="#FFC20E" />
      <rect x="16" y="22" width="9" height="7" rx="2" fill="#111318" />
      <rect x="28" y="22" width="9" height="7" rx="2" fill="#111318" />
      <rect x="40" y="22" width="8" height="7" rx="2" fill="#111318" />
      <rect x="11" y="33" width="42" height="3" fill="#111318" opacity=".18" />
      <circle cx="21" cy="44" r="4.5" fill="#fff" />
      <circle cx="43" cy="44" r="4.5" fill="#fff" />
    </svg>
  );
}

export function Logo({ href = './index.html' }: { href?: string }) {
  return <a href={href} className="logo"><Marca /><span>Van<b>Aaki</b></span></a>;
}
