import { db } from '../db/db';
import type { Aluno, TipoViagem, Viagem } from '../db/types';
import { compCaminho, otimizarOrdem, seguirCaminho, VEL_MEDIA_KMH } from '../lib/geo';
import { tracarRota } from '../lib/rotas';
import { agoraIso, hoje, hora, primeiroNome, uid } from '../lib/util';
import { notificar, notificarFamilia } from './notificar';
import { darPontos } from './pontos';

/** Chave do trecho que leva ao destino final (escola/garagem). */
export const DESTINO = '__destino';
/** Tempo (ms, relógio real) que a van espera na parada no modo automático. */
const ESPERA_AUTO_MS = 2500;

export async function viagemAtiva(vanId: string) {
  return db.viagens.where('[vanId+status]').equals([vanId, 'em_andamento']).first();
}

async function mapaAlunos(ids: string[]) {
  const lista = await db.alunos.bulkGet(ids);
  return new Map(lista.filter(Boolean).map((a) => [a!.id, a!]));
}

/** Próximo índice de parada pendente (ou paradas.length = destino final). */
export const proximoAlvo = (v: Viagem) => { const i = v.paradas.findIndex((p) => p.status === 'pendente'); return i < 0 ? v.paradas.length : i; };
export const chaveAlvo = (v: Viagem, i: number) => (i < v.paradas.length ? v.paradas[i].alunoId : DESTINO);

/** Passa para o próximo alvo e monta o caminho até ele. */
function avancarAlvo(v: Viagem, vanJaChegou: boolean) {
  v.alvo = proximoAlvo(v);
  const trecho = v.trechos[chaveAlvo(v, v.alvo)] ?? [];
  // se o tio confirmou antes da van chegar, ela termina o caminho atual e segue
  v.caminho = vanJaChegou ? trecho.slice() : [...v.caminho, ...trecho];
}

/** Avisa a família de quem é o próximo alvo (uma vez por viagem). */
async function avisarProximo(v: Viagem, alunos: Map<string, Aluno>) {
  const p = v.paradas[v.alvo];
  if (!p || p.status !== 'pendente' || v.avisados.includes(p.alunoId)) return;
  v.avisados.push(p.alunoId);
  const a = alunos.get(p.alunoId)!;
  const nome = primeiroNome(a.nome);
  if (v.tipo === 'ida') {
    await notificar({ para: 'pais', alunoId: a.id, icone: '🔔', titulo: `${nome} é o próximo a ser buscado!`, texto: 'Agora você pode ver a van chegando no mapa.' });
    await notificar({ para: 'aluno', alunoId: a.id, icone: '🎒', titulo: 'Você é o próximo!', texto: 'Pega a mochila e vai pro portão ⏰ (+10 pontos se estiver lá antes da van)' });
  } else {
    await notificarFamilia(a.id, '🏠', `${nome} é o próximo a ser entregue!`, 'Acompanhe a van chegando no mapa.', true);
  }
}

export interface OpcoesViagem { automatico: boolean; velocidade: number; otimizar: boolean }

export async function iniciarViagem(vanId: string, tipo: TipoViagem, op: OpcoesViagem) {
  // 1) leituras e cálculo da rota (fora da transação: o roteador é uma chamada de rede)
  const van = await db.vans.get(vanId);
  if (!van) throw new Error('Van não encontrada');
  const data = hoje();
  const escola = (await db.escolas.get(van.escolaIds[0]))!;
  const alunos = (await db.alunos.where('vanId').equals(vanId).toArray()).filter((a) => a.ativo && a.escolaId === escola.id);
  const presencas = await db.presencas.where('data').equals(data).toArray();
  const naoVai = new Set(presencas.filter((p) => !p.vai).map((p) => p.alunoId));
  const vao = alunos.filter((a) => !naoVai.has(a.id));
  if (!vao.length) throw new Error('Nenhum aluno vai hoje.');

  const inicio = tipo === 'ida' ? van.garagem : escola.local;
  const destino = tipo === 'ida' ? escola.local : van.garagem;
  const locais = vao.map((a) => a.local);
  const ordem = op.otimizar ? otimizarOrdem(inicio, locais, destino) : vao.map((_, i) => i);
  const kmCadastro = compCaminho([inicio, ...locais, destino]) / 1000;
  const kmOtimo = compCaminho([inicio, ...ordem.map((i) => locais[i]), destino]) / 1000;
  const ordenados = ordem.map((i) => vao[i]);
  const rota = await tracarRota([inicio, ...ordenados.map((a) => a.local), destino]);
  const trechos: Record<string, Viagem['caminho']> = {};
  ordenados.forEach((a, i) => { trechos[a.id] = rota.trechos[i]; });
  trechos[DESTINO] = rota.trechos[ordenados.length];

  // 2) grava tudo de uma vez
  return db.transaction('rw', db.todas, async () => {
    const antigas = await db.viagens.where('[vanId+status]').equals([vanId, 'em_andamento']).toArray();
    for (const a of antigas) await db.viagens.update(a.id, { status: 'cancelada' });

    const v: Viagem = {
      id: uid(), vanId, data, tipo, status: 'em_andamento', inicio, destino,
      destinoNome: tipo === 'ida' ? escola.nome : 'Garagem', escolaId: escola.id,
      paradas: ordenados.map((a) => ({ alunoId: a.id, status: 'pendente' as const })),
      alvo: 0, pos: { ...inicio }, caminho: trechos[ordenados[0].id].slice(), trechos, rotaReal: rota.real,
      rastro: [{ ...inicio }], naParada: false,
      automatico: op.automatico, velocidade: op.velocidade, iniciadaEm: agoraIso(), avisados: [],
      economiaKm: op.otimizar ? Math.max(0, kmCadastro - kmOtimo) : 0, atualizadoEm: agoraIso(),
    };
    for (const a of vao) {
      await notificar({
        para: 'pais', alunoId: a.id, icone: '🚐',
        titulo: tipo === 'ida' ? `${van.motorista} saiu para a rota` : `${primeiroNome(a.nome)} saiu da escola`,
        texto: tipo === 'ida' ? `Você será avisado quando ${primeiroNome(a.nome)} for o próximo.` : 'A van está a caminho. Avisamos quando for a vez da sua casa.',
      });
    }
    if (tipo === 'volta') {
      await notificar({ para: 'escola', escolaId: escola.id, icone: '👋', titulo: `Van de ${van.motorista} saiu`, texto: `${vao.length} alunos a bordo` });
    }
    await avisarProximo(v, new Map(vao.map((a) => [a.id, a])));
    await db.viagens.add(v);
    return v;
  });
}

/** Efeito de confirmar a parada atual (usado pelo botão do tio e pelo modo automático). */
async function concluirParada(v: Viagem, alunos: Map<string, Aluno>, status: 'feito' | 'ausente') {
  const p = v.paradas[v.alvo];
  const a = alunos.get(p.alunoId)!;
  const nome = primeiroNome(a.nome);
  const vanJaChegou = v.naParada;
  p.status = status; p.hora = agoraIso(); v.naParada = false;
  if (v.tipo === 'ida') {
    if (status === 'feito') {
      await notificar({ para: 'pais', alunoId: a.id, icone: '✅', titulo: `${nome} embarcou às ${hora(p.hora)}`, texto: `Destino: ${v.destinoNome}. Avisamos quando chegar.` });
      await darPontos(a, p.prontoEm ? 'pronto_portao' : 'embarque', 'sistema', undefined, `auto|${a.id}|${v.data}`);
    } else {
      await notificar({ para: 'pais', alunoId: a.id, icone: '🚫', titulo: `O tio passou e ${nome} não estava`, texto: 'Se ele não vai, avise pelo app antes da rota (não perde ponto).' });
      await darPontos(a, 'ausente_sem_aviso', 'sistema', undefined, `auto|${a.id}|${v.data}`);
    }
  } else if (status === 'feito') {
    await notificar({ para: 'pais', alunoId: a.id, icone: '🏠', titulo: `${nome} foi entregue em casa`, texto: `Às ${hora(p.hora)}. Até amanhã!` });
  }
  avancarAlvo(v, vanJaChegou);
  await avisarProximo(v, alunos);
  v.atualizadoEm = agoraIso();
}

/** O tio confirma embarque/entrega ou ausência na parada atual. */
export async function marcarParada(viagemId: string, status: 'feito' | 'ausente') {
  await db.transaction('rw', db.todas, async () => {
    const v = await db.viagens.get(viagemId);
    if (!v || v.status !== 'em_andamento' || v.alvo >= v.paradas.length) return;
    await concluirParada(v, await mapaAlunos(v.paradas.map((x) => x.alunoId)), status);
    await db.viagens.put(v);
  });
}

/** Aluno avisa "estou no portão" (vale +10 pontos no embarque). */
export async function marcarPronto(alunoId: string) {
  const a = await db.alunos.get(alunoId);
  if (!a) return;
  await db.transaction('rw', db.todas, async () => {
    const v = await viagemAtiva(a.vanId);
    const p = v?.paradas.find((x) => x.alunoId === alunoId);
    if (!v || v.tipo !== 'ida' || !p || p.status !== 'pendente' || p.prontoEm) return;
    p.prontoEm = agoraIso();
    await db.viagens.put(v);
    await notificar({ para: 'motorista', vanId: a.vanId, icone: '🙋', titulo: `${primeiroNome(a.nome)} já está no portão`, texto: a.endereco });
  });
}

/** Família avisou que não vai: tira da rota em andamento, reotimiza a ordem e retraça o caminho. */
export async function ajustarRotaPorAusencia(alunoId: string) {
  const a = await db.alunos.get(alunoId);
  if (!a) return;
  const v0 = await viagemAtiva(a.vanId);
  if (!v0 || !v0.paradas.some((x) => x.alunoId === alunoId && x.status === 'pendente')) return;
  const alunos = await mapaAlunos(v0.paradas.map((x) => x.alunoId));
  const pend = v0.paradas.filter((p) => p.status === 'pendente' && p.alunoId !== alunoId);
  const ordem = otimizarOrdem(v0.pos, pend.map((p) => alunos.get(p.alunoId)!.local), v0.destino);
  const novas = ordem.map((i) => pend[i]);
  const rota = await tracarRota([v0.pos, ...novas.map((p) => alunos.get(p.alunoId)!.local), v0.destino]);

  await db.transaction('rw', db.todas, async () => {
    const v = await db.viagens.get(v0.id);
    if (!v || v.status !== 'em_andamento') return;
    const p = v.paradas.find((x) => x.alunoId === alunoId);
    if (!p || p.status !== 'pendente') return;
    p.status = 'ausente'; p.avisou = true; p.hora = agoraIso();
    const feitas = v.paradas.filter((x) => x.status !== 'pendente');
    const pendAgora = new Map(v.paradas.filter((x) => x.status === 'pendente').map((x) => [x.alunoId, x]));
    v.paradas = [...feitas, ...novas.filter((x) => pendAgora.has(x.alunoId)).map((x) => pendAgora.get(x.alunoId)!)];
    novas.forEach((x, i) => { v.trechos[x.alunoId] = rota.trechos[i]; });
    v.trechos[DESTINO] = rota.trechos[novas.length];
    v.naParada = false;
    v.alvo = proximoAlvo(v);
    v.caminho = (v.trechos[chaveAlvo(v, v.alvo)] ?? []).slice();
    await avisarProximo(v, alunos);
    v.atualizadoEm = agoraIso();
    await db.viagens.put(v);
    await notificar({ para: 'motorista', vanId: a.vanId, icone: '⚡', titulo: 'Rota ajustada', texto: `${primeiroNome(a.nome)} não vai. A rota foi reotimizada.` });
  });
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
    const p = v?.paradas.find((x) => x.alunoId === alunoId);
    if (!v || !p || p.recebidoEscolaEm) return;
    p.recebidoEscolaEm = agoraIso();
    await db.viagens.put(v);
    const a = await db.alunos.get(alunoId);
    await notificar({ para: 'pais', alunoId, icone: '🏫', titulo: `${primeiroNome(a!.nome)} entrou na escola`, texto: `Confirmado pela portaria às ${hora(p.recebidoEscolaEm)}` });
  });
}

/** Chegou no destino final da viagem. */
async function concluir(v: Viagem, alunos: Map<string, Aluno>) {
  v.status = 'concluida'; v.concluidaEm = agoraIso();
  const van = await db.vans.get(v.vanId);
  const abordo = v.paradas.filter((p) => p.status === 'feito');
  if (v.tipo === 'ida') {
    for (const p of abordo) {
      const a = alunos.get(p.alunoId)!;
      await notificarFamilia(a.id, '🏫', `${primeiroNome(a.nome)} chegou na escola`, `${v.destinoNome} às ${hora(v.concluidaEm)}`, true);
    }
    await notificar({ para: 'escola', escolaId: v.escolaId, icone: '🚐', titulo: `Van de ${van?.motorista} chegou`, texto: `${abordo.length} alunos para confirmar na portaria` });
  }
  await notificar({ para: 'motorista', vanId: v.vanId, icone: '🏁', titulo: 'Rota concluída', texto: `${abordo.length} alunos · ${v.destinoNome}` });
}

/** Um passo da simulação do GPS. Roda em uma aba só (ver simulador.ts). */
export async function passoSimulacao(dtMs: number) {
  await db.transaction('rw', db.todas, async () => {
    const ativas = await db.viagens.where('status').equals('em_andamento').toArray();
    for (const v of ativas) {
      const alunos = await mapaAlunos(v.paradas.map((p) => p.alunoId));
      if (v.naParada) {
        if (v.automatico && Date.now() - new Date(v.chegouParadaEm!).getTime() > ESPERA_AUTO_MS) {
          await concluirParada(v, alunos, 'feito');
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
          const a = alunos.get(v.paradas[v.alvo].alunoId)!;
          const van = await db.vans.get(v.vanId);
          await notificarFamilia(a.id, '📍', v.tipo === 'ida' ? `${van?.motorista} chegou no seu portão!` : 'A van chegou na sua casa',
            v.tipo === 'ida' ? `${primeiroNome(a.nome)}, pode embarcar 🚐` : `${primeiroNome(a.nome)} está descendo`);
        } else {
          await concluir(v, alunos);
        }
      }
      v.atualizadoEm = agoraIso();
      await db.viagens.put(v);
    }
  });
}
