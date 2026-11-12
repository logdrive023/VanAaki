import { db } from '../db/db';
import type { Aluno, Pagamento, RotaFixa, TipoViagem, Turno } from '../db/types';
import { agoraIso, hoje, mesAtual, nomeMes, primeiroNome, reais, uid } from '../lib/util';
import { notificar } from './notificar';
import { darPontos } from './pontos';
import { nomePlano, planoDe, trechosDoPlano, type Plano } from '../lib/turnos';
import { ajustarRotaPorPresenca, chaveRotaFixa } from './viagem';

// ---------------- presença (por trecho) ----------------

/**
 * O combinado do dia: van na ida e na volta, só em um trecho ("eu levo, o tio traz") ou não vai.
 * Quem pode mudar: a família e o tio. Se a rota já está andando, ela é reotimizada na hora.
 */
export async function definirPresenca(alunoId: string, plano: Plano, motivo?: string, porQuem: 'pais' | 'motorista' = 'pais') {
  const a = await db.alunos.get(alunoId);
  if (!a) return;
  const data = hoje();
  const antes = planoDe(await db.presencas.get(`${alunoId}|${data}`));
  if (antes === plano) return;
  const { ida, volta } = trechosDoPlano(plano);
  await db.presencas.put({ id: `${alunoId}|${data}`, alunoId, data, ida, volta, motivo, avisadoEm: agoraIso() });
  const pl = nomePlano(plano);
  const nome = primeiroNome(a.nome);
  if (porQuem === 'pais') {
    await notificar({ para: 'motorista', vanId: a.vanId, icone: pl.icone, titulo: `${nome}: ${pl.nome.toLowerCase()} hoje`, texto: `${pl.desc}${motivo ? ` · ${motivo}` : ''}` });
  } else {
    await notificar({ para: 'pais', alunoId, icone: pl.icone, titulo: `O tio marcou: ${pl.nome.toLowerCase()} hoje`, texto: pl.desc });
  }
  if (plano !== 'ambos') await darPontos(a, 'aviso_ausencia', 'sistema', undefined, `aviso|${alunoId}|${data}`);
  await ajustarRotaPorPresenca(alunoId);
}

// ---------------- pagamentos ----------------

export async function pagar(pagamentoId: string, metodo: Pagamento['metodo'], porQuem: 'pais' | 'motorista') {
  const p = await db.pagamentos.get(pagamentoId);
  if (!p || p.status === 'pago') return;
  await db.pagamentos.update(pagamentoId, { status: 'pago', pagoEm: agoraIso(), metodo });
  const a = await db.alunos.get(p.alunoId);
  if (!a) return;
  if (porQuem === 'pais') {
    await notificar({ para: 'motorista', vanId: a.vanId, icone: '💰', titulo: 'Pagamento recebido', texto: `${primeiroNome(a.nome)} · ${nomeMes(p.mes)} · ${reais(p.valor)} (${metodo})` });
  } else {
    await notificar({ para: 'pais', alunoId: a.id, icone: '🧾', titulo: 'Pagamento confirmado', texto: `${nomeMes(p.mes)} · ${reais(p.valor)}. Obrigado!` });
  }
}

export async function desfazerPagamento(pagamentoId: string) {
  await db.pagamentos.update(pagamentoId, { status: 'pendente', pagoEm: undefined, metodo: undefined });
}

/** Gera as cobranças do mês para os alunos ativos que ainda não têm. */
export async function gerarCobrancas(vanId: string, mes: string) {
  const alunos = (await db.alunos.where('vanId').equals(vanId).toArray()).filter((a) => a.ativo);
  let n = 0;
  for (const a of alunos) {
    const existe = await db.pagamentos.where('[alunoId+mes]').equals([a.id, mes]).first();
    if (existe) continue;
    await db.pagamentos.add(novaCobranca(a, mes));
    await notificar({ para: 'pais', alunoId: a.id, icone: '🧾', titulo: `Mensalidade de ${nomeMes(mes)} disponível`, texto: `${reais(a.mensalidade)} · vence dia ${a.diaVencimento}` });
    n++;
  }
  return n;
}

export function novaCobranca(a: Aluno, mes: string): Pagamento {
  return {
    id: uid(), alunoId: a.id, mes, valor: a.mensalidade,
    vencimento: `${mes}-${String(a.diaVencimento).padStart(2, '0')}`, status: 'pendente',
  };
}

export const atrasado = (p: Pagamento) => p.status === 'pendente' && p.vencimento < hoje();

// ---------------- alunos ----------------

export async function salvarAluno(a: Aluno) {
  const novo = !(await db.alunos.get(a.id));
  await db.alunos.put(a);
  if (novo) {
    const mes = mesAtual();
    if (!(await db.pagamentos.where('[alunoId+mes]').equals([a.id, mes]).first())) await db.pagamentos.add(novaCobranca(a, mes));
  }
}

export async function arquivarAluno(id: string, ativo: boolean) {
  await db.alunos.update(id, { ativo });
}

// ---------------- mensagens ----------------

export async function enviarMensagem(alunoId: string, de: 'pais' | 'motorista', texto: string) {
  const t = texto.trim();
  if (!t) return;
  await db.mensagens.add({ id: uid(), alunoId, de, texto: t, criadoEm: agoraIso(), lida: false });
  const a = await db.alunos.get(alunoId);
  if (!a) return;
  if (de === 'pais') await notificar({ para: 'motorista', vanId: a.vanId, icone: '💬', titulo: `Mensagem de ${a.responsavel}`, texto: t.slice(0, 90) });
  else await notificar({ para: 'pais', alunoId, icone: '💬', titulo: 'Mensagem do tio', texto: t.slice(0, 90) });
}

export async function lerMensagens(alunoId: string, quemLe: 'pais' | 'motorista') {
  const outra = quemLe === 'pais' ? 'motorista' : 'pais';
  const l = await db.mensagens.where('alunoId').equals(alunoId).filter((m) => m.de === outra && !m.lida).toArray();
  await db.mensagens.bulkPut(l.map((m) => ({ ...m, lida: true })));
}

// ---------------- escola ----------------

export async function credenciar(vanId: string, escolaId: string, situacao: 'credenciada' | 'pendente' | 'suspensa') {
  const v = await db.vans.get(vanId);
  if (!v) return;
  await db.vans.update(vanId, { credenciamento: { ...v.credenciamento, [escolaId]: situacao } });
}

// ---------------- rota fixa e escola ----------------

/** O tio liga/desliga a rota fixa ou muda a ordem (vale até ele mudar de novo, ex.: o semestre todo). */
export async function salvarRotaFixa(vanId: string, turno: Turno, tipo: TipoViagem, mud: Partial<Pick<RotaFixa, 'ativa' | 'ordem'>>) {
  const van = await db.vans.get(vanId);
  if (!van) return;
  const k = chaveRotaFixa(turno, tipo);
  const atual = van.rotasFixas?.[k] ?? { ativa: false, ordem: [], atualizadaEm: agoraIso() };
  await db.vans.update(vanId, { rotasFixas: { ...van.rotasFixas, [k]: { ...atual, ...mud, atualizadaEm: agoraIso() } } });
}

/** A escola escolhe se a portaria confirma a entrada no app (senão, fica com o tio). */
export async function definirConfirmaEntrada(escolaId: string, confirma: boolean) {
  await db.escolas.update(escolaId, { confirmaEntrada: confirma });
}
