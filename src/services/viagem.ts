import { db } from '../db/db';
import type { Aluno, Escola, LatLng, Parada, TipoViagem, Turno, Viagem } from '../db/types';
import { compCaminho, otimizarOrdem, seguirCaminho, VEL_MEDIA_KMH } from '../lib/geo';
import { otimizarPelasRuas, tracarRota } from '../lib/rotas';
import { NOME_TURNO, ordenarEscolas, vaiNoTrecho } from '../lib/turnos';
import { agoraIso, hoje, hora, primeiroNome, uid } from '../lib/util';
import { notificar, notificarFamilia } from './notificar';
import { darPontos } from './pontos';

/**
 * Viagem com várias escolas:
 *   ida   = garagem → casas (ordem otimizada) → escolas (ordem do horário de ENTRADA)
 *   volta = escolas (ordem do horário de SAÍDA) → casas (ordem otimizada) → garagem
 * Toda escola é uma parada, igual às casas. O "destino" é o ponto final depois da última parada
 * (na ida é a própria última escola, então a viagem termina ao sair dela).
 */

/** Chave do trecho que leva ao destino final. */
export const DESTINO = '__destino';
/** Tempo (ms, relógio real) que a van espera na parada no modo automático. */
const ESPERA_AUTO_MS = 2500;

export const chaveParada = (p: Parada) => (p.tipo === 'aluno' ? p.alunoId : `esc:${p.escolaId}`);
export const chaveAlvo = (v: Viagem, i: number) => (i < v.paradas.length ? chaveParada(v.paradas[i]) : DESTINO);
/** Próximo índice de parada pendente (ou paradas.length = destino final). */
export const proximoAlvo = (v: Viagem) => { const i = v.paradas.findIndex((p) => p.status === 'pendente'); return i < 0 ? v.paradas.length : i; };
/** Índice da parada da escola na viagem (-1 se não passa lá). */
export const idxEscola = (v: Viagem, escolaId: string) => v.paradas.findIndex((p) => p.tipo === 'escola' && p.escolaId === escolaId);
export const idxAluno = (v: Viagem, alunoId: string) => v.paradas.findIndex((p) => p.tipo === 'aluno' && p.alunoId === alunoId);

export async function viagemAtiva(vanId: string) {
  return db.viagens.where('[vanId+status]').equals([vanId, 'em_andamento']).first();
}

interface Locais { alunos: Map<string, Aluno>; escolas: Map<string, Escola> }
async function carregarLocais(v: Pick<Viagem, 'paradas'>): Promise<Locais> {
  const ids = v.paradas.filter((p) => p.tipo === 'aluno').map((p) => p.alunoId);
  const [al, es] = await Promise.all([db.alunos.bulkGet(ids), db.escolas.toArray()]);
  return { alunos: new Map(al.filter(Boolean).map((a) => [a!.id, a!])), escolas: new Map(es.map((e) => [e.id, e])) };
}
const localDe = (p: Parada, L: Locais): LatLng => (p.tipo === 'aluno' ? L.alunos.get(p.alunoId)!.local : L.escolas.get(p.escolaId)!.local);
const paradaAluno = (a: Aluno): Parada => ({ tipo: 'aluno', alunoId: a.id, escolaId: a.escolaId, status: 'pendente' });
const paradaEscola = (e: Escola): Parada => ({ tipo: 'escola', alunoId: '', escolaId: e.id, status: 'pendente' });

// ---------------- planejamento ----------------

/**
 * Ordem das paradas SEM internet (linha reta): usada na prévia da tela e como reserva.
 * ida: casas otimizadas da garagem até a 1ª escola; volta: casas otimizadas da última escola até a garagem.
 */
export function ordemLocal(tipo: TipoViagem, inicio: LatLng, alunos: Aluno[], escolas: Escola[], destino: LatLng, otimizar = true) {
  if (!escolas.length) return { paradas: [] as Parada[], pts: [inicio, destino] };
  const de = tipo === 'ida' ? inicio : escolas[escolas.length - 1].local;
  const ate = tipo === 'ida' ? escolas[0].local : destino;
  const idx = otimizar ? otimizarOrdem(de, alunos.map((a) => a.local), ate) : alunos.map((_, i) => i);
  const casas = idx.map((i) => paradaAluno(alunos[i]));
  const esc = escolas.map(paradaEscola);
  const paradas = tipo === 'ida' ? [...casas, ...esc] : [...esc, ...casas];
  const L: Locais = { alunos: new Map(alunos.map((a) => [a.id, a])), escolas: new Map(escolas.map((e) => [e.id, e])) };
  return { paradas, pts: [inicio, ...paradas.map((p) => localDe(p, L)), destino] };
}

/** Igual ao ordemLocal, mas otimiza as casas PELAS RUAS (mão única) quando há internet, e traça o caminho. */
async function planejar(tipo: TipoViagem, inicio: LatLng, alunos: Aluno[], escolas: Escola[], destino: LatLng, otimizar: boolean) {
  let { paradas } = ordemLocal(tipo, inicio, alunos, escolas, destino, otimizar);
  if (otimizar && alunos.length > 1) {
    const de = tipo === 'ida' ? inicio : escolas[escolas.length - 1].local;
    const ate = tipo === 'ida' ? escolas[0].local : destino;
    const r = await otimizarPelasRuas(de, alunos.map((a) => a.local), ate);
    if (r) {
      const casas = r.ordem.map((i) => paradaAluno(alunos[i]));
      const esc = escolas.map(paradaEscola);
      paradas = tipo === 'ida' ? [...casas, ...esc] : [...esc, ...casas];
    }
  }
  const L: Locais = { alunos: new Map(alunos.map((a) => [a.id, a])), escolas: new Map(escolas.map((e) => [e.id, e])) };
  const pts = [inicio, ...paradas.map((p) => localDe(p, L)), destino];
  const rota = await tracarRota(pts);
  const trechos: Record<string, LatLng[]> = {};
  paradas.forEach((p, i) => { trechos[chaveParada(p)] = rota.trechos[i]; });
  trechos[DESTINO] = rota.trechos[paradas.length];
  let economiaKm = 0;
  if (otimizar) {
    const base = ordemLocal(tipo, inicio, alunos, escolas, destino, false).pts;
    economiaKm = Math.max(0, (compCaminho(base) - compCaminho(pts)) / 1000);
  }
  return { paradas, trechos, rotaReal: rota.real, economiaKm };
}

/** Alunos e escolas de um turno/trecho (respeita "só ida", "só volta" e "não vai"). */
export async function participantes(vanId: string, turno: Turno, tipo: TipoViagem) {
  const van = await db.vans.get(vanId);
  const cfg = van?.turnos.find((t) => t.turno === turno && t.ativo);
  if (!van || !cfg) return { van, alunos: [] as Aluno[], escolas: [] as Escola[] };
  const presencas = new Map((await db.presencas.where('data').equals(hoje()).toArray()).map((p) => [p.alunoId, p]));
  const alunos = (await db.alunos.where('vanId').equals(vanId).toArray())
    .filter((a) => a.ativo && a.turno === turno && cfg.escolaIds.includes(a.escolaId) && vaiNoTrecho(presencas.get(a.id), tipo));
  const usadas = new Set(alunos.map((a) => a.escolaId));
  const escolas = ordenarEscolas((await db.escolas.bulkGet([...usadas])).filter(Boolean) as Escola[], turno, tipo);
  return { van, alunos, escolas };
}

export interface OpcoesViagem { automatico: boolean; velocidade: number; otimizar: boolean }

export async function iniciarViagem(vanId: string, turno: Turno, tipo: TipoViagem, op: OpcoesViagem) {
  const { van, alunos, escolas } = await participantes(vanId, turno, tipo);
  if (!van) throw new Error('Van não encontrada');
  if (!alunos.length) throw new Error(`Nenhum aluno vai de van na ${tipo} deste turno.`);
  const inicio = tipo === 'ida' ? van.garagem : escolas[0].local;
  const destino = tipo === 'ida' ? escolas[escolas.length - 1].local : van.garagem;
  const plano = await planejar(tipo, inicio, alunos, escolas, destino, op.otimizar);

  return db.transaction('rw', db.todas, async () => {
    const antigas = await db.viagens.where('[vanId+status]').equals([vanId, 'em_andamento']).toArray();
    for (const a of antigas) await db.viagens.update(a.id, { status: 'cancelada' });
    const v: Viagem = {
      id: uid(), vanId, data: hoje(), tipo, turno, status: 'em_andamento', escolaIds: escolas.map((e) => e.id),
      inicio, destino, destinoNome: tipo === 'ida' ? escolas[escolas.length - 1].nome : 'Garagem',
      paradas: plano.paradas, alvo: 0, pos: { ...inicio }, caminho: (plano.trechos[chaveParada(plano.paradas[0])] ?? []).slice(),
      trechos: plano.trechos, rotaReal: plano.rotaReal, rastro: [{ ...inicio }], naParada: false,
      automatico: op.automatico, velocidade: op.velocidade, iniciadaEm: agoraIso(), avisados: [],
      economiaKm: plano.economiaKm, atualizadoEm: agoraIso(),
    };
    const t = NOME_TURNO[turno].toLowerCase();
    for (const a of alunos) {
      const esc = escolas.find((e) => e.id === a.escolaId)!;
      await notificar({
        para: 'pais', alunoId: a.id, icone: '🚐',
        titulo: tipo === 'ida' ? `${van.motorista} saiu para a rota da ${t}` : `${van.motorista} está indo buscar na escola`,
        texto: tipo === 'ida' ? `Você será avisado quando ${primeiroNome(a.nome)} for o próximo.` : `${esc.nome}. Avisamos quando ${primeiroNome(a.nome)} sair e quando for a vez da sua casa.`,
      });
    }
    for (const e of escolas) {
      const n = alunos.filter((a) => a.escolaId === e.id).length;
      await notificar({ para: 'escola', escolaId: e.id, icone: '🚐', titulo: tipo === 'ida' ? `Van de ${van.motorista} saiu (${t})` : `Van de ${van.motorista} vindo buscar (${t})`, texto: `${n} aluno${n > 1 ? 's' : ''} desta escola` });
    }
    await avisarProximo(v, await carregarLocais(v));
    await db.viagens.add(v);
    return v;
  });
}

// ---------------- andamento ----------------

/** Passa para o próximo alvo e monta o caminho até ele. */
function avancarAlvo(v: Viagem, vanJaChegou: boolean) {
  v.alvo = proximoAlvo(v);
  const trecho = v.trechos[chaveAlvo(v, v.alvo)] ?? [];
  // se o tio confirmou antes da van chegar, ela termina o caminho atual e segue
  v.caminho = vanJaChegou ? trecho.slice() : [...v.caminho, ...trecho];
}

/** Escola sem nenhum aluno para deixar/buscar sai da rota. Devolve true se pulou alguma. */
function pularEscolasVazias(v: Viagem) {
  let pulou = false;
  for (const e of v.paradas.filter((p) => p.tipo === 'escola' && p.status === 'pendente')) {
    const tem = v.paradas.some((p) => p.tipo === 'aluno' && p.escolaId === e.escolaId
      && (v.tipo === 'ida' ? p.status !== 'ausente' : p.status === 'pendente'));
    if (!tem) { e.status = 'ausente'; e.hora = agoraIso(); pulou = true; }
  }
  return pulou;
}

/** Avisa a família de quem é o próximo alvo (uma vez por viagem). */
async function avisarProximo(v: Viagem, L: Locais) {
  const p = v.paradas[v.alvo];
  if (!p || p.status !== 'pendente') return;
  if (p.tipo === 'escola') {
    // volta: as famílias dessa escola já podem ver a van indo para lá
    if (v.tipo === 'volta' && !v.avisados.includes(chaveParada(p))) {
      v.avisados.push(chaveParada(p));
      for (const k of v.paradas.filter((x) => x.tipo === 'aluno' && x.escolaId === p.escolaId && x.status === 'pendente')) {
        const a = L.alunos.get(k.alunoId)!;
        await notificar({ para: 'pais', alunoId: a.id, icone: '🏫', titulo: `O tio está indo para ${L.escolas.get(p.escolaId)?.nome}`, texto: `Vai buscar ${primeiroNome(a.nome)}. Dá para ver a van no mapa.` });
      }
    }
    return;
  }
  if (v.avisados.includes(p.alunoId)) return;
  v.avisados.push(p.alunoId);
  const a = L.alunos.get(p.alunoId)!;
  const nome = primeiroNome(a.nome);
  if (v.tipo === 'ida') {
    await notificar({ para: 'pais', alunoId: a.id, icone: '🔔', titulo: `${nome} é o próximo a ser buscado!`, texto: 'Agora você pode ver a van chegando no mapa.' });
    await notificar({ para: 'aluno', alunoId: a.id, icone: '🎒', titulo: 'Você é o próximo!', texto: 'Pega a mochila e vai pro portão ⏰ (+10 pontos se estiver lá antes da van)' });
  } else {
    await notificarFamilia(a.id, '🏠', `${nome} é o próximo a ser entregue!`, 'Acompanhe a van chegando no mapa.', true);
  }
}

/** Efeito de confirmar a parada atual (botão do tio e modo automático). Devolve true se precisa retraçar. */
async function concluirParada(v: Viagem, L: Locais, status: 'feito' | 'ausente') {
  const p = v.paradas[v.alvo];
  const vanJaChegou = v.naParada;
  p.status = status; p.hora = agoraIso(); v.naParada = false;
  const van = await db.vans.get(v.vanId);

  if (p.tipo === 'aluno') {
    const a = L.alunos.get(p.alunoId)!;
    const nome = primeiroNome(a.nome);
    const escola = L.escolas.get(a.escolaId)?.nome ?? 'escola';
    if (v.tipo === 'ida') {
      if (status === 'feito') {
        await notificar({ para: 'pais', alunoId: a.id, icone: '✅', titulo: `${nome} embarcou às ${hora(p.hora)}`, texto: `Destino: ${escola}. Avisamos quando chegar.` });
        await darPontos(a, p.prontoEm ? 'pronto_portao' : 'embarque', 'sistema', undefined, `auto|${a.id}|${v.data}|${v.turno}`);
      } else {
        await notificar({ para: 'pais', alunoId: a.id, icone: '🚫', titulo: `O tio passou e ${nome} não estava`, texto: 'Se ele não vai, avise pelo app antes da rota (não perde ponto).' });
        await darPontos(a, 'ausente_sem_aviso', 'sistema', undefined, `auto|${a.id}|${v.data}|${v.turno}`);
      }
    } else if (status === 'feito') {
      await notificar({ para: 'pais', alunoId: a.id, icone: '🏠', titulo: `${nome} foi entregue em casa`, texto: `Às ${hora(p.hora)}. Até amanhã!` });
    }
  } else if (status === 'feito') {
    const e = L.escolas.get(p.escolaId)!;
    if (v.tipo === 'ida') {
      const desceram = v.paradas.filter((x) => x.tipo === 'aluno' && x.escolaId === e.id && x.status === 'feito');
      for (const k of desceram) {
        const a = L.alunos.get(k.alunoId)!;
        await notificarFamilia(a.id, '🏫', `${primeiroNome(a.nome)} chegou na escola`, `${e.nome} às ${hora(p.hora)}`, true);
      }
      await notificar({ para: 'escola', escolaId: e.id, icone: '🚐', titulo: `Van de ${van?.motorista} deixou ${desceram.length} aluno(s)`, texto: 'Confirme a entrada de cada um na portaria' });
    } else {
      const subiram = v.paradas.filter((x) => x.tipo === 'aluno' && x.escolaId === e.id && x.status === 'pendente');
      for (const k of subiram) {
        const a = L.alunos.get(k.alunoId)!;
        await notificarFamilia(a.id, '🚐', `${primeiroNome(a.nome)} saiu da escola com o tio`, `Às ${hora(p.hora)}. Avisamos quando for a vez da sua casa.`, true);
      }
      await notificar({ para: 'escola', escolaId: e.id, icone: '👋', titulo: `Van de ${van?.motorista} saiu com ${subiram.length} aluno(s)`, texto: `Às ${hora(p.hora)}` });
    }
  }
  const pulou = pularEscolasVazias(v);
  avancarAlvo(v, vanJaChegou);
  await avisarProximo(v, L);
  v.atualizadoEm = agoraIso();
  return pulou;
}

/** O tio confirma a parada atual: embarque/entrega/ausência na casa, desembarque/embarque na escola. */
export async function marcarParada(viagemId: string, status: 'feito' | 'ausente') {
  let retracar = false;
  await db.transaction('rw', db.todas, async () => {
    const v = await db.viagens.get(viagemId);
    if (!v || v.status !== 'em_andamento' || v.alvo >= v.paradas.length) return;
    retracar = await concluirParada(v, await carregarLocais(v), status);
    await db.viagens.put(v);
  });
  if (retracar) await retracarRota(viagemId);
}

/** Aluno avisa "estou no portão" (vale +10 pontos no embarque). */
export async function marcarPronto(alunoId: string) {
  const a = await db.alunos.get(alunoId);
  if (!a) return;
  await db.transaction('rw', db.todas, async () => {
    const v = await viagemAtiva(a.vanId);
    const p = v?.paradas[v ? idxAluno(v, alunoId) : -1];
    if (!v || v.tipo !== 'ida' || !p || p.status !== 'pendente' || p.prontoEm) return;
    p.prontoEm = agoraIso();
    await db.viagens.put(v);
    await notificar({ para: 'motorista', vanId: a.vanId, icone: '🙋', titulo: `${primeiroNome(a.nome)} já está no portão`, texto: a.endereco });
  });
}

/**
 * Reotimiza as casas que faltam a partir de onde a van está e retraça o caminho pelas ruas.
 * As escolas mantêm a ordem do horário. Se a van está parada num ponto, ele continua sendo o primeiro.
 */
export async function retracarRota(viagemId: string) {
  const v0 = await db.viagens.get(viagemId);
  if (!v0 || v0.status !== 'em_andamento') return;
  const L = await carregarLocais(v0);
  const pend = v0.paradas.filter((p) => p.status === 'pendente');
  const fixo = v0.naParada && v0.paradas[v0.alvo]?.status === 'pendente' ? v0.paradas[v0.alvo] : null;
  const resto = pend.filter((p) => p !== fixo);
  const casas = resto.filter((p) => p.tipo === 'aluno');
  const escolas = resto.filter((p) => p.tipo === 'escola');
  // destino da ida = última escola que ainda vai receber alguém
  const escolasVivas = v0.paradas.filter((p) => p.tipo === 'escola' && p.status !== 'ausente');
  const destino = v0.tipo === 'ida' && escolasVivas.length ? localDe(escolasVivas[escolasVivas.length - 1], L) : v0.destino;
  const destinoNome = v0.tipo === 'ida' && escolasVivas.length ? L.escolas.get(escolasVivas[escolasVivas.length - 1].escolaId)!.nome : v0.destinoNome;

  const de = v0.tipo === 'ida' || !escolas.length ? (fixo ? localDe(fixo, L) : v0.pos) : localDe(escolas[escolas.length - 1], L);
  const ate = v0.tipo === 'ida' ? (escolas[0] ? localDe(escolas[0], L) : destino) : destino;
  const locs = casas.map((p) => localDe(p, L));
  const r = casas.length > 1 ? await otimizarPelasRuas(de, locs, ate) : null;
  const ordem = r?.ordem ?? otimizarOrdem(de, locs, ate);
  const casasOrd = ordem.map((i) => casas[i]);
  const novaOrdem = [...(fixo ? [fixo] : []), ...(v0.tipo === 'ida' ? [...casasOrd, ...escolas] : [...escolas, ...casasOrd])];
  const rota = await tracarRota([v0.pos, ...novaOrdem.map((p) => localDe(p, L)), destino]);

  await db.transaction('rw', db.todas, async () => {
    const v = await db.viagens.get(viagemId);
    if (!v || v.status !== 'em_andamento') return;
    const porChave = new Map(v.paradas.filter((p) => p.status === 'pendente').map((p) => [chaveParada(p), p]));
    const pendentes = novaOrdem.map((p) => porChave.get(chaveParada(p))).filter(Boolean) as Parada[];
    const extras = [...porChave.values()].filter((p) => !pendentes.includes(p)); // mudou durante a busca da rota
    v.paradas = [...v.paradas.filter((p) => p.status !== 'pendente'), ...pendentes, ...extras];
    novaOrdem.forEach((p, i) => { v.trechos[chaveParada(p)] = rota.trechos[i]; });
    v.trechos[DESTINO] = rota.trechos[novaOrdem.length];
    v.destino = destino; v.destinoNome = destinoNome;
    v.alvo = proximoAlvo(v);
    v.caminho = v.naParada ? [] : (v.trechos[chaveAlvo(v, v.alvo)] ?? []).slice();
    await avisarProximo(v, await carregarLocais(v));
    v.atualizadoEm = agoraIso();
    await db.viagens.put(v);
  });
}

/** A família (ou o tio) mudou o combinado do dia: tira o aluno da rota em andamento, se for o caso. */
export async function ajustarRotaPorPresenca(alunoId: string) {
  const a = await db.alunos.get(alunoId);
  if (!a) return;
  const v0 = await viagemAtiva(a.vanId);
  if (!v0) return;
  const pres = await db.presencas.get(`${alunoId}|${hoje()}`);
  if (vaiNoTrecho(pres, v0.tipo)) return; // continua indo neste trecho
  let mudou = false;
  await db.transaction('rw', db.todas, async () => {
    const v = await db.viagens.get(v0.id);
    const i = v ? idxAluno(v, alunoId) : -1;
    if (!v || i < 0 || v.paradas[i].status !== 'pendente') return;
    const p = v.paradas[i];
    p.status = 'ausente'; p.avisou = true; p.hora = agoraIso();
    if (v.alvo === i) v.naParada = false;
    pularEscolasVazias(v);
    v.alvo = proximoAlvo(v);
    await db.viagens.put(v);
    mudou = true;
    await notificar({ para: 'motorista', vanId: a.vanId, icone: '⚡', titulo: 'Rota ajustada', texto: `${primeiroNome(a.nome)} saiu da ${v.tipo} de hoje. A rota foi reotimizada.` });
  });
  if (mudou) await retracarRota(v0.id);
}

export async function encerrarViagem(viagemId: string) {
  await db.viagens.update(viagemId, { status: 'cancelada', atualizadoEm: agoraIso() });
}

export async function configurarViagem(viagemId: string, mud: Partial<Pick<Viagem, 'automatico' | 'velocidade'>>) {
  await db.viagens.update(viagemId, mud);
}

/** A escola confirma que o aluno entrou. */
export async function confirmarEntradaEscola(viagemId: string, alunoId: string) {
  await db.transaction('rw', db.todas, async () => {
    const v = await db.viagens.get(viagemId);
    const p = v?.paradas[v ? idxAluno(v, alunoId) : -1];
    if (!v || !p || p.recebidoEscolaEm) return;
    p.recebidoEscolaEm = agoraIso();
    await db.viagens.put(v);
    const a = await db.alunos.get(alunoId);
    await notificar({ para: 'pais', alunoId, icone: '🏫', titulo: `${primeiroNome(a!.nome)} entrou na escola`, texto: `Confirmado pela portaria às ${hora(p.recebidoEscolaEm)}` });
  });
}

/** Chegou no ponto final da viagem. */
async function concluir(v: Viagem) {
  v.status = 'concluida'; v.concluidaEm = agoraIso();
  const n = v.paradas.filter((p) => p.tipo === 'aluno' && p.status === 'feito').length;
  await notificar({ para: 'motorista', vanId: v.vanId, icone: '🏁', titulo: `Rota da ${NOME_TURNO[v.turno].toLowerCase()} concluída (${v.tipo})`, texto: `${n} alunos · ${v.escolaIds.length} escola(s)` });
}

/** Um passo da simulação do GPS. Roda em uma aba só (ver simulador.ts). */
export async function passoSimulacao(dtMs: number) {
  const retracar: string[] = [];
  await db.transaction('rw', db.todas, async () => {
    const ativas = await db.viagens.where('status').equals('em_andamento').toArray();
    for (const v of ativas) {
      const L = await carregarLocais(v);
      if (v.naParada) {
        if (v.automatico && Date.now() - new Date(v.chegouParadaEm!).getTime() > ESPERA_AUTO_MS) {
          if (await concluirParada(v, L, 'feito')) retracar.push(v.id);
          await db.viagens.put(v);
        }
        continue;
      }
      // pelas ruas: velocidade real; em linha reta: desconta o fator de rua
      const metros = (VEL_MEDIA_KMH / 3.6) * v.velocidade * (dtMs / 1000) / (v.rotaReal ? 1 : 1.3);
      const r = seguirCaminho(v.pos, v.caminho, metros);
      v.pos = r.pos; v.caminho = r.caminho;
      v.rastro.push(r.pos);
      if (v.rastro.length > 1500) v.rastro.splice(1, v.rastro.length - 1500);
      if (r.chegou) {
        if (v.alvo < v.paradas.length) {
          v.naParada = true; v.chegouParadaEm = agoraIso();
          const p = v.paradas[v.alvo];
          const van = await db.vans.get(v.vanId);
          if (p.tipo === 'aluno') {
            const a = L.alunos.get(p.alunoId)!;
            await notificarFamilia(a.id, '📍', v.tipo === 'ida' ? `${van?.motorista} chegou no seu portão!` : 'A van chegou na sua casa',
              v.tipo === 'ida' ? `${primeiroNome(a.nome)}, pode embarcar 🚐` : `${primeiroNome(a.nome)} está descendo`);
          } else {
            const e = L.escolas.get(p.escolaId)!;
            const n = v.paradas.filter((x) => x.tipo === 'aluno' && x.escolaId === e.id && (v.tipo === 'ida' ? x.status === 'feito' : x.status === 'pendente')).length;
            await notificar({ para: 'escola', escolaId: e.id, icone: '📍', titulo: v.tipo === 'ida' ? `Van de ${van?.motorista} chegou com ${n} aluno(s)` : `Van de ${van?.motorista} chegou para buscar ${n} aluno(s)`, texto: `Às ${hora(v.chegouParadaEm)}` });
            if (v.tipo === 'volta') {
              for (const k of v.paradas.filter((x) => x.tipo === 'aluno' && x.escolaId === e.id && x.status === 'pendente')) {
                await notificarFamilia(k.alunoId, '📍', 'O tio chegou na escola', `${e.nome}`, false);
              }
            }
          }
        } else {
          await concluir(v);
        }
      }
      v.atualizadoEm = agoraIso();
      await db.viagens.put(v);
    }
  });
  for (const id of retracar) await retracarRota(id);
}
