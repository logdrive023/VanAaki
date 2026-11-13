import { liveQuery } from 'dexie';
import { db } from '../db/db';
import type { Documento, Eu, LatLng, OpFila, Usuario, Viagem } from '../db/types';
import { distM } from '../lib/geo';
import { ErroApi, lerSessao, perfilDaAba, type OpcoesApi, type Sessao } from './cliente';

/**
 * DEMONSTRAÇÃO NO NAVEGADOR — funciona no site publicado, sem servidor.
 *
 * - Os dados de exemplo vêm de public/demo/dados.json (gerado da API real por scripts/gerar-demo.py)
 *   e as datas são trazidas para "hoje" na hora de abrir: o arquivo nunca envelhece.
 * - As ações já funcionam no aparelho (offline-first); aqui elas só não vão para servidor nenhum.
 * - As abas conversam entre si (BroadcastChannel): o tio começa a rota numa aba e a família vê na outra.
 * - Um simulador leva a van de parada em parada usando a mesma regra do GPS do app.
 */

export const TOKEN_DEMO_LOCAL = 'demo-local';
export const ehDemoLocal = (perfil: string = perfilDaAba()) => lerSessao(perfil)?.token === TOKEN_DEMO_LOCAL;

interface Dados { hoje: string; perfis: Record<string, { usuario: Usuario; sync: unknown }>; rotas: Record<string, unknown> }

// ---------------- dados de exemplo, com as datas trazidas para hoje ----------------

const DIA = 86400000;
const dataLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const somarDias = (iso: string, n: number) => { const [a, m, d] = iso.split('-').map(Number); return dataLocal(new Date(a, m - 1, d + n)); };
const somarMeses = (ym: string, n: number) => { const [a, m] = ym.split('-').map(Number); const d = new Date(a, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

/** Troca todas as datas (inclusive dentro de ids como "aluno|2026-11-13") pelo mesmo dia relativo a hoje. */
function deslocar<T>(valor: T, dias: number, meses: number): T {
  if (typeof valor === 'string') {
    if (/^\d{4}-\d{2}$/.test(valor)) return somarMeses(valor, meses) as T;
    return valor.replace(/\d{4}-\d{2}-\d{2}/g, (d) => somarDias(d, dias)) as T;
  }
  if (Array.isArray(valor)) return valor.map((x) => deslocar(x, dias, meses)) as T;
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, deslocar(v, dias, meses)])) as T;
  return valor;
}

let dados: Promise<Dados> | null = null;
function carregar(): Promise<Dados> {
  dados ??= fetch('./demo/dados.json')
    .then((r) => { if (!r.ok) throw new Error(); return r.json() as Promise<Dados>; })
    .then((d) => {
      const hoje = dataLocal(new Date());
      const [a, m, dd] = d.hoje.split('-').map(Number);
      const dias = Math.round((new Date(`${hoje}T12:00:00`).getTime() - new Date(a, m - 1, dd, 12).getTime()) / DIA);
      const meses = (Number(hoje.slice(0, 4)) - a) * 12 + (Number(hoje.slice(5, 7)) - m);
      return dias === 0 ? d : deslocar(d, dias, meses);
    })
    .catch(() => { dados = null; throw new ErroApi('Não deu para abrir a demonstração. Confira a internet e tente de novo.', 0); });
  return dados;
}

/** "Entrar na demonstração" sem servidor. */
export async function sessaoDemoLocal(perfil: string): Promise<Sessao> {
  const d = await carregar();
  return { token: TOKEN_DEMO_LOCAL, usuario: d.perfis[perfil].usuario };
}

/** Responde no lugar da API quando a sessão é a demonstração do navegador. */
export async function responderDemo<T>(caminho: string, op: OpcoesApi, perfil: string): Promise<T> {
  const d = await carregar();
  const metodo = op.metodo ?? (op.corpo === undefined ? 'GET' : 'POST');
  if (caminho === '/sync') return d.perfis[perfil].sync as T;
  if (metodo === 'GET' && caminho in d.rotas) return d.rotas[caminho] as T;
  const local = await responderLocal(caminho, metodo, op.corpo as Record<string, string> | undefined, perfil);
  if (local !== NAO) return local as T;
  throw new ErroApi(metodo === 'GET'
    ? 'Esta parte precisa do servidor. Na demonstração do site ela fica desligada.'
    : 'Na demonstração do site, cadastros e alterações como esta não são salvos.', 400);
}

const NAO = Symbol('não é daqui');

/** O que a demonstração faz no próprio aparelho: documentos, aceite da política e "meus dados". */
async function responderLocal(caminho: string, metodo: string, corpo: Record<string, string> | undefined, perfil: string): Promise<unknown> {
  const eu = (await db.config.get('eu'))?.valor as Eu | undefined;
  if (caminho === '/privacidade/consentimento') return null; // a tela grava o aceite na cópia local
  if (caminho === '/privacidade/conta') throw new ErroApi('Na demonstração não dá para excluir a conta.', 400);
  if (caminho === '/privacidade/meus-dados') {
    const tabelas = Object.fromEntries(await Promise.all(db.todas.filter((t) => t.name !== 'config').map(async (t) => [t.name, await t.toArray()] as const)));
    return { geradoEm: new Date().toISOString(), versaoPolitica: eu?.consentimento?.versao, conta: eu?.usuario, consentimentos: eu?.consentimento ? [eu.consentimento] : [], dados: tabelas, aviso: 'Demonstração: dados de exemplo.' };
  }
  const doc = caminho.match(/^\/van\/documentos(?:\/(\w+))?$/);
  if (doc && perfil === 'motorista' && eu) {
    const vanId = eu.vanIds[0];
    if (metodo === 'PUT' && corpo) await db.documentos.put({ id: `${vanId}-${corpo.tipo}`, vanId, tipo: corpo.tipo as Documento['tipo'], numero: corpo.numero, validade: corpo.validade, atualizadoEm: new Date().toISOString() });
    if (metodo === 'DELETE' && doc[1]) await db.documentos.where({ vanId, tipo: doc[1] }).delete();
    canal?.postMessage({ tipo: 'documentos', documentos: await db.documentos.toArray() } satisfies Recado);
    return null;
  }
  return NAO;
}

// ---------------- as abas da demonstração conversam ----------------

type Recado = { tipo: 'op'; op: OpFila } | { tipo: 'viagens'; viagens: Viagem[] } | { tipo: 'documentos'; documentos: Documento[] } | { tipo: 'recomecar' };
const canal = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('vanaaki-demo') : null;
const VIAGEM: OpFila['tipo'][] = ['iniciar', 'parada', 'posicoes', 'encerrar'];

/** Ação feita nesta aba: as outras aplicam também (o que mexe na viagem chega pelo estado da viagem). */
export function espalharOp(op: OpFila) {
  if (!VIAGEM.includes(op.tipo)) canal?.postMessage({ tipo: 'op', op } satisfies Recado);
}

/** Liga a demonstração nesta aba: ouvir as outras, mandar a viagem (tio) e rodar o simulador. */
export function ligarDemoLocal(perfil: string, aplicar: (op: OpFila) => Promise<void>) {
  const ouvir = (e: MessageEvent<Recado>) => {
    const m = e.data;
    if (m.tipo === 'recomecar') { location.reload(); return; }
    if (m.tipo === 'viagens' && perfil !== 'motorista') void db.viagens.bulkPut(m.viagens);
    if (m.tipo === 'op') void aplicar(m.op);
    // documentos do tio: a escola vê com número; a família, sem
    if (m.tipo === 'documentos' && perfil !== 'motorista' && perfil !== 'aluno') {
      const docs = m.documentos.filter((x) => perfil === 'escola' || x.vanId === m.documentos[0]?.vanId).map((x) => (perfil === 'pais' ? { ...x, numero: undefined } : x));
      void db.transaction('rw', db.documentos, async () => { await db.documentos.where('vanId').anyOf([...new Set(docs.map((x) => x.vanId))]).delete(); await db.documentos.bulkPut(docs); });
    }
  };
  canal?.addEventListener('message', ouvir);
  let parar = () => {};
  if (perfil === 'motorista') {
    const sub = liveQuery(() => db.viagens.toArray()).subscribe((viagens) => canal?.postMessage({ tipo: 'viagens', viagens } satisfies Recado));
    const sim = simulador();
    parar = () => { sub.unsubscribe(); sim(); };
  }
  return () => { canal?.removeEventListener('message', ouvir); parar(); };
}

/** Recomeçar: apaga a cópia de todos os perfis e recarrega as abas abertas. */
export async function recomecarDemoLocal() {
  canal?.postMessage({ tipo: 'recomecar' } satisfies Recado);
  db.close();
  await Promise.all(['motorista', 'pais', 'aluno', 'escola'].map((p) => new Promise((ok) => { const r = indexedDB.deleteDatabase(`vanaaki-${p}`); r.onsuccess = r.onerror = r.onblocked = ok; })));
  location.reload();
}

// ---------------- simulador: a van anda sozinha ----------------

const PASSO_MS = 1200;
/** metros por passo na velocidade 1 (~30 km/h); a simulação acelera com a velocidade escolhida na tela (ex.: 8×) */
const METROS = 12;

function andar(de: LatLng, para: LatLng, metros: number): LatLng {
  const d = distM(de, para);
  if (d <= metros) return para;
  const f = metros / d;
  return { lat: de.lat + (para.lat - de.lat) * f, lng: de.lng + (para.lng - de.lng) * f };
}

function simulador() {
  const parado = new Map<string, number>(); // passos esperando na parada (o tempo de a criança subir)
  const tick = async () => {
    const { enviarPosicao, encerrarViagem } = await import('../services/viagem');
    const ativas = (await db.viagens.where('status').equals('em_andamento').toArray()).filter((v) => v.simulado);
    const [alunos, escolas] = await Promise.all([db.alunos.toArray(), db.escolas.toArray()]);
    const local = (i: number, v: Viagem) => {
      const p = v.paradas[i];
      if (!p) return v.destino;
      return (p.tipo === 'aluno' ? alunos.find((a) => a.id === p.alunoId)?.local : escolas.find((e) => e.id === p.escolaId)?.local) ?? v.destino;
    };
    for (const v of ativas) {
      const espera = parado.get(v.id) ?? 0;
      if (espera > 0) { parado.set(v.id, espera - 1); continue; }
      // chegou na parada: sem o "automático", espera o tio tocar em Embarcou / Não estava
      if (v.naParada && !v.automatico) continue;
      // no automático: depois da pausa, segue para a próxima (sair do raio confirma o embarque, como no GPS real)
      let alvo = v.alvo;
      if (v.naParada) { alvo = v.alvo + 1; while (alvo < v.paradas.length && v.paradas[alvo].status !== 'pendente') alvo++; }
      const destino = local(alvo, v);
      if (v.alvo >= v.paradas.length && distM(v.pos, v.destino) < 30) { await encerrarViagem(v.id); continue; }
      const nova = andar(v.pos, destino, METROS * (v.velocidade || 1));
      await enviarPosicao(v.id, nova);
      const depois = await db.viagens.get(v.id);
      if (depois?.naParada && !v.naParada) parado.set(v.id, 2);
    }
  };
  const t = setInterval(() => void tick().catch(() => undefined), PASSO_MS);
  return () => clearInterval(t);
}
