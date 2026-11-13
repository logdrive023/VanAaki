import { useLiveQuery } from 'dexie-react-hooks';
import { useSyncExternalStore } from 'react';
import { db } from '../db/db';
import type { LatLng, Mensagem, OpFila, Parada, Presenca, Recado, TipoOp, Viagem } from '../db/types';
import { distM } from '../lib/geo';
import { agoraIso, uid } from '../lib/util';
import { api, ErroApi } from './cliente';
import { sincronizar } from './sync';
import { ehDemoLocal, espalharOp } from './demoLocal';

/**
 * OFFLINE-FIRST — a fila de ações do aparelho.
 *
 * Toda ação importante (começar rota, embarque, GPS, combinado do dia, "já paguei", mensagem):
 *  1. é gravada na fila (IndexedDB: sobrevive a fechar o app e reiniciar o celular);
 *  2. já muda a tela na hora (efeito "otimista"): o tio segue a rota mesmo sem sinal;
 *  3. é enviada ao servidor em ordem, com uma chave única (Idempotency-Key) e o horário real;
 *  4. sem internet ou com internet ruim, espera e tenta de novo (2 s → 30 s), sem perder nada e sem duplicar.
 * Quando a fila esvazia, o app baixa o estado oficial do servidor. Enquanto houver ação pendente,
 * o efeito dela é reaplicado por cima do que vier do servidor (a tela não "volta no tempo").
 */

// ---------------- estado (para a tela) ----------------

type Estado = { enviando: boolean; semInternet: boolean; ultimoErro: string };
let estado: Estado = { enviando: false, semInternet: false, ultimoErro: '' };
const ouvintes = new Set<() => void>();
const mudar = (m: Partial<Estado>) => { estado = { ...estado, ...m }; ouvintes.forEach((f) => f()); };
export function useFila() {
  const e = useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => estado);
  const pendentes = useLiveQuery(() => db.fila.count()) ?? 0;
  const pontosGps = useLiveQuery(async () => (await db.fila.where('tipo').equals('posicoes').toArray()).reduce((s, o) => s + ((o.corpo.pontos as unknown[])?.length ?? 0), 0)) ?? 0;
  return { ...e, pendentes, pontosGps };
}

// ---------------- enfileirar ----------------

/** Tudo que o efeito local lê ou escreve (numa transação só: ou aplica tudo, ou nada). */
const tabelas = () => [db.fila, db.viagens, db.presencas, db.pagamentos, db.mensagens, db.recados, db.alunos, db.escolas, db.vans, db.config];

export async function enfileirar(op: Omit<OpFila, 'id' | 'criadoEm' | 'tentativas'> & { id?: string }) {
  const o: OpFila = { ...op, id: op.id ?? uid(), criadoEm: agoraIso(), tentativas: 0 };
  await db.transaction('rw', tabelas(), async () => {
    await db.fila.add(o);
    await aplicarLocal(o);
  });
  void processar();
  return o;
}

/** Posições do GPS: vão juntas numa ação só (até 400 pontos), em vez de uma ação por ponto. */
export async function enfileirarPosicao(viagemId: string, p: LatLng) {
  const ponto = { lat: p.lat, lng: p.lng, em: agoraIso() };
  const ultima = await db.fila.orderBy('seq').last();
  if (ultima && ultima.tipo === 'posicoes' && ultima.viagemId === viagemId && ultima.seq !== enviandoSeq && (ultima.corpo.pontos as unknown[]).length < 400) {
    const pontos = [...(ultima.corpo.pontos as typeof ponto[]), ponto];
    await db.transaction('rw', tabelas(), async () => {
      await db.fila.update(ultima.seq!, { corpo: { pontos } });
      await aplicarLocal({ ...ultima, corpo: { pontos: [ponto] } });
    });
    void processar();
    return;
  }
  await enfileirar({ tipo: 'posicoes', caminho: `/viagens/${viagemId}/posicoes`, metodo: 'POST', corpo: { pontos: [ponto] }, viagemId });
}

// ---------------- enviar ----------------

let rodando = false;
let enviandoSeq: number | undefined;
let espera = 2000;
let proxima: ReturnType<typeof setTimeout> | undefined;

/** Manda a fila em ordem. Uma de cada vez: a ordem importa (começar → GPS → embarque → …). */
export async function processar(): Promise<void> {
  if (rodando) return;
  rodando = true;
  clearTimeout(proxima);
  let enviouAlgo = false;
  if (ehDemoLocal()) {
    // demonstração no navegador: já valeu no aparelho; só conta para as outras abas
    try { for (const op of await db.fila.orderBy('seq').toArray()) { await db.fila.delete(op.seq!); espalharOp(op); } } finally { rodando = false; }
    return;
  }
  try {
    for (;;) {
      const op = await db.fila.orderBy('seq').first();
      if (!op) break;
      enviandoSeq = op.seq;
      mudar({ enviando: true });
      try {
        await api(op.caminho, { metodo: op.metodo, corpo: op.corpo, chave: op.id, timeoutMs: 25000 });
        await db.fila.delete(op.seq!);
        enviouAlgo = true;
        espera = 2000;
        mudar({ semInternet: false, ultimoErro: '' });
      } catch (e) {
        const erro = e as ErroApi;
        if (erro.status === 0 || erro.status >= 500 || erro.status === 429) {
          // sem internet, internet ruim ou servidor fora: guarda e tenta de novo depois
          await db.fila.update(op.seq!, { tentativas: op.tentativas + 1 });
          mudar({ semInternet: erro.status === 0, ultimoErro: erro.message });
          proxima = setTimeout(() => void processar(), espera);
          espera = Math.min(espera * 2, 30000);
          return;
        }
        if (erro.status === 401) return; // sessão vencida: o app pede login e a fila continua guardada
        // o servidor recusou (regra de negócio): não adianta repetir; descarta e avisa
        await db.fila.delete(op.seq!);
        avisarErro(`Não deu para registrar: ${erro.message}`);
        enviouAlgo = true;
      }
    }
  } finally {
    enviandoSeq = undefined;
    rodando = false;
    mudar({ enviando: false });
  }
  if (enviouAlgo) await sincronizar().catch(() => undefined);
}

function avisarErro(msg: string) {
  const el = document.createElement('div');
  el.className = 'toast-erro';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

// tenta de novo quando a internet volta, quando o app volta para a tela e de tempos em tempos
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { espera = 2000; void processar(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void processar(); });
  setInterval(() => { void db.fila.count().then((n) => { if (n && !rodando) void processar(); }); }, 20000);
  setTimeout(() => void processar(), 1500);
}

/** Ação vinda de outra aba da demonstração: só aplica (não entra na fila). */
export async function aplicarRecebida(o: OpFila) {
  await db.transaction('rw', tabelas(), () => aplicarLocal(o));
}

/** Algo ainda não foi enviado? (ex.: antes de sair da conta) */
export const pendentes = () => db.fila.count();

// ---------------- efeito na tela (otimista) ----------------

/** Depois de baixar dados do servidor, reaplica o que ainda está na fila (a tela não volta no tempo). */
export async function reaplicar(viagemId?: string) {
  const ops = await db.fila.orderBy('seq').toArray();
  if (!ops.length) return;
  await db.transaction('rw', tabelas(), async () => {
    for (const o of ops) if (!viagemId || !o.viagemId || o.viagemId === viagemId) await aplicarLocal(o);
  });
}

const RAIO_CHEGADA = 45;
const RAIO_SAIDA = 90;

async function locais(v: Viagem) {
  const [alunos, escolas] = await Promise.all([db.alunos.toArray(), db.escolas.toArray()]);
  const ma = new Map(alunos.map((a) => [a.id, a.local])), me = new Map(escolas.map((e) => [e.id, e.local]));
  return (p: Parada) => (p.tipo === 'aluno' ? ma.get(p.alunoId) : me.get(p.escolaId)) ?? v.destino;
}
const chave = (p: Parada) => (p.tipo === 'aluno' ? p.alunoId : `esc:${p.escolaId}`);
const proximaPendente = (v: Viagem, de: number) => { for (let i = de; i < v.paradas.length; i++) if (v.paradas[i].status === 'pendente') return i; return v.paradas.length; };

/** Conclui a parada no aparelho (mesma regra do servidor, em linha reta até a próxima). */
async function concluir(v: Viagem, k: number, status: 'feito' | 'ausente', em: string) {
  v.paradas = v.paradas.map((p, i) => (i === k ? { ...p, status, hora: em } : p));
  if (k === v.alvo) {
    v.naParada = false;
    v.alvo = proximaPendente(v, k + 1);
    const loc = await locais(v);
    v.caminho = [v.alvo < v.paradas.length ? loc(v.paradas[v.alvo]) : v.destino];
  }
}

async function aplicarLocal(o: OpFila) {
  const c = o.corpo;
  switch (o.tipo as TipoOp) {
    case 'iniciar': {
      if (!o.local || await db.viagens.get(o.local.id)) return; // o servidor já tem a dele
      const ativas = await db.viagens.where('status').equals('em_andamento').toArray();
      for (const a of ativas) if (a.vanId === o.local.vanId) await db.viagens.put({ ...a, status: 'cancelada' });
      await db.viagens.put(o.local);
      return;
    }
    case 'parada': {
      const v = await db.viagens.get(o.viagemId!);
      if (!v || v.status !== 'em_andamento') return;
      const k = v.paradas.findIndex((p) => chave(p) === c.chave);
      if (k < 0 || v.paradas[k].status !== 'pendente') return;
      await concluir(v, k, c.status as 'feito' | 'ausente', c.em as string);
      await db.viagens.put({ ...v });
      return;
    }
    case 'posicoes': {
      const v = await db.viagens.get(o.viagemId!);
      if (!v || v.status !== 'em_andamento' || (v.simulado && !ehDemoLocal())) return;
      const auto = !(await db.vans.get(v.vanId))?.config?.confirmarManual;
      const loc = await locais(v);
      for (const p of c.pontos as { lat: number; lng: number; em: string }[]) {
        if (v.ultimaPosEm && p.em <= v.ultimaPosEm) continue; // o servidor já aplicou este ponto
        const pos = { lat: p.lat, lng: p.lng };
        v.pos = pos; v.rastro = [...v.rastro, pos]; v.ultimaPosEm = p.em;
        if (v.alvo >= v.paradas.length) continue;
        const d = distM(pos, loc(v.paradas[v.alvo]));
        if (!v.naParada && d < RAIO_CHEGADA) { v.naParada = true; v.chegouParadaEm = p.em; }
        else if (v.naParada && auto && d > RAIO_SAIDA) await concluir(v, v.alvo, 'feito', p.em);
      }
      await db.viagens.put({ ...v });
      return;
    }
    case 'encerrar': {
      const v = await db.viagens.get(o.viagemId!);
      if (v && v.status === 'em_andamento') await db.viagens.put({ ...v, status: 'cancelada' });
      return;
    }
    case 'pronto': {
      const vs = await db.viagens.where('status').equals('em_andamento').toArray();
      for (const v of vs) {
        const k = v.paradas.findIndex((p) => p.tipo === 'aluno' && p.alunoId === c.alunoId && p.status === 'pendente');
        if (k >= 0 && !v.paradas[k].prontoEm) await db.viagens.put({ ...v, paradas: v.paradas.map((p, i) => (i === k ? { ...p, prontoEm: o.criadoEm } : p)) });
      }
      return;
    }
    case 'presenca': {
      const data = (c.data as string) || (await db.config.get('hoje'))?.valor as string;
      const trechos: Record<string, [boolean, boolean]> = { ambos: [true, true], so_ida: [true, false], so_volta: [false, true], nao_vai: [false, false] };
      const [ida, volta] = trechos[c.plano as string] ?? [true, true];
      const p: Presenca = { id: `${c.alunoId}|${data}`, alunoId: c.alunoId as string, data, ida, volta, motivo: (c.motivo as string) || undefined, avisadoEm: o.criadoEm } as Presenca;
      await db.presencas.put(p);
      return;
    }
    case 'cuidados': {
      const a = await db.alunos.get(c.alunoId as string);
      if (a) await db.alunos.put({ ...a, cuidados: c.cuidados as string, contatoExtra: c.contatoExtra as string, telefoneExtra: c.telefoneExtra as string });
      return;
    }
    case 'pagar': {
      const id = o.caminho.split('/')[2];
      const p = await db.pagamentos.get(id);
      if (!p || p.status === 'pago') return;
      await db.pagamentos.put(c.porPais ? { ...p, informadoEm: p.informadoEm ?? o.criadoEm, metodo: 'pix' } : { ...p, status: 'pago', pagoEm: o.criadoEm, metodo: c.metodo as 'pix' | 'dinheiro' });
      return;
    }
    case 'recado': {
      if (await db.recados.get(o.id)) return;
      const r: Recado = { id: o.id, vanId: c.vanId as string, escolaId: c.escolaId as string, de: c.de as Recado['de'], texto: c.texto as string, criadoEm: o.criadoEm, lida: true, enviando: true };
      await db.recados.put(r);
      return;
    }
    case 'mensagem': {
      if (await db.mensagens.get(o.id)) return;
      const m: Mensagem = { id: o.id, alunoId: c.alunoId as string, de: c.de as Mensagem['de'], texto: c.texto as string, criadoEm: o.criadoEm, lida: true, enviando: true } as Mensagem;
      await db.mensagens.put(m);
      return;
    }
  }
}
