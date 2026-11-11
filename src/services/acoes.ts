import { db } from '../db/db';
import type { Aluno, Pagamento } from '../db/types';
import { agoraIso, hoje, mesAtual, nomeMes, primeiroNome, reais, uid } from '../lib/util';
import { notificar } from './notificar';
import { darPontos } from './pontos';
import { ajustarRotaPorAusencia } from './viagem';

// ---------------- presença ----------------

export async function definirPresenca(alunoId: string, vai: boolean, motivo?: string) {
  const a = await db.alunos.get(alunoId);
  if (!a) return;
  const data = hoje();
  await db.presencas.put({ id: `${alunoId}|${data}`, alunoId, data, vai, motivo, avisadoEm: agoraIso() });
  if (!vai) {
    await notificar({ para: 'motorista', vanId: a.vanId, icone: '🙋', titulo: `${primeiroNome(a.nome)} não vai hoje`, texto: motivo ? `Motivo: ${motivo}` : 'Aviso da família' });
    await darPontos(a, 'aviso_ausencia', 'sistema', undefined, `aviso|${alunoId}|${data}`);
    await ajustarRotaPorAusencia(alunoId);
  } else {
    await notificar({ para: 'motorista', vanId: a.vanId, icone: '👍', titulo: `${primeiroNome(a.nome)} vai hoje`, texto: 'A família desfez o aviso de ausência.' });
  }
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
