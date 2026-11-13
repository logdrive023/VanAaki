/** UUID v4 (também fora de HTTPS, onde o crypto.randomUUID não existe). */
export const uid = (): string => {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

export const agoraIso = () => new Date().toISOString();

const p2 = (n: number) => String(n).padStart(2, '0');

/** Data local YYYY-MM-DD. */
export function hoje(d = new Date()) { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; }
export function mesAtual(d = new Date()) { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`; }
export function proximoMes(mes: string) {
  const [y, m] = mes.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${p2(m + 1)}`;
}
export function addDias(data: string, n: number) {
  const [y, m, d] = data.split('-').map(Number);
  const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() + n);
  return hoje(dt);
}
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const nomeMes = (mes: string) => MESES[Number(mes.split('-')[1]) - 1];
export function dataLonga(d = new Date()) { return `${SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()}`; }
export function dataCurta(data: string) {
  const [y, m, d] = data.split('-').map(Number);
  return `${SEMANA[new Date(y, m - 1, d).getDay()].slice(0, 3)}, ${p2(d)}/${p2(m)}`;
}
export function hora(iso?: string) { if (!iso) return '—'; const d = new Date(iso); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; }
export function horaMais(minutos: number) { const d = new Date(Date.now() + minutos * 60000); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; }
export function haQuanto(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
}
/** Segunda-feira da semana da data. */
export function inicioSemana(data = hoje()) {
  const [y, m, d] = data.split('-').map(Number);
  const dt = new Date(y, m - 1, d); const dow = (dt.getDay() + 6) % 7; dt.setDate(dt.getDate() - dow);
  return hoje(dt);
}

/** centavos → "R$ 420,00" */
export const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/** "420,50" → 42050 */
export function centavos(txt: string): number | null {
  const n = Number(txt.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
export const primeiroNome = (nome: string) => nome.split(/\s+/)[0];

/** Link do WhatsApp com texto pronto (abre só quando a pessoa clica). */
export const linkWhats = (telefone: string, texto: string) => `https://wa.me/55${telefone.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`;

export const CORES = ['#6C5CE7', '#00B894', '#E17055', '#0984E3', '#D63384', '#F2811D', '#2D3436', '#00A8A8', '#8E44AD', '#C0392B'];
