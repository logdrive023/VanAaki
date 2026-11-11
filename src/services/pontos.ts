import { db } from '../db/db';
import type { Aluno } from '../db/types';
import { tipoEvento } from '../lib/gamificacao';
import { agoraIso, hoje, primeiroNome, uid } from '../lib/util';
import { notificar, notificarFamilia } from './notificar';

/** Registra pontos (positivos ou negativos). Ocorrência avisa os pais na hora. */
export async function darPontos(aluno: Aluno, tipo: string, autor: 'sistema' | 'motorista', observacao?: string, idFixo?: string) {
  const t = tipoEvento(tipo);
  if (!t) throw new Error(`Tipo de ponto desconhecido: ${tipo}`);
  if (idFixo && (await db.pontos.get(idFixo))) return; // já deu hoje
  await db.pontos.add({
    id: idFixo ?? uid(), alunoId: aluno.id, vanId: aluno.vanId, data: hoje(), criadoEm: agoraIso(),
    tipo, pontos: t.pontos, descricao: t.nome, observacao, autor,
  });
  const nome = primeiroNome(aluno.nome);
  const pts = `${t.pontos > 0 ? '+' : ''}${t.pontos} pontos`;
  if (t.grupo === 'ocorrencia') {
    await notificar({ para: 'pais', alunoId: aluno.id, icone: t.icone, titulo: `Ocorrência na van: ${t.nome}`, texto: `${nome} · ${pts}${observacao ? ` · "${observacao}"` : ''}` });
    await notificar({ para: 'aluno', alunoId: aluno.id, icone: t.icone, titulo: `O tio registrou: ${t.nome}`, texto: `${pts}. Bora recuperar amanhã! 💪` });
  } else if (t.grupo === 'elogio') {
    await notificarFamilia(aluno.id, t.icone, `Elogio do tio: ${t.nome}`, `${nome} ganhou ${pts}${observacao ? ` · "${observacao}"` : ''}`);
  } else if (t.pontos > 0) {
    await notificar({ para: 'aluno', alunoId: aluno.id, icone: t.icone, titulo: `${t.nome}!`, texto: `Você ganhou ${pts} ⭐` });
  }
}

export async function resgatar(alunoId: string, recompensaId: string) {
  const [r, aluno] = await Promise.all([db.recompensas.get(recompensaId), db.alunos.get(alunoId)]);
  if (!r || !aluno) return;
  await db.resgates.add({
    id: uid(), alunoId, recompensaId, nome: r.nome, icone: r.icone, custo: r.custo, status: 'pendente', criadoEm: agoraIso(),
  });
  await notificar({ para: 'motorista', vanId: aluno.vanId, icone: '🎁', titulo: 'Pedido de prêmio', texto: `${primeiroNome(aluno.nome)} quer "${r.nome}" (${r.custo} ⭐)` });
}

export async function decidirResgate(id: string, aprovar: boolean) {
  const r = await db.resgates.get(id);
  if (!r) return;
  await db.resgates.update(id, { status: aprovar ? 'aprovado' : 'recusado', decididoEm: agoraIso() });
  await notificarFamilia(r.alunoId, aprovar ? '🎉' : '😕', aprovar ? `Prêmio aprovado: ${r.nome}` : `Prêmio recusado: ${r.nome}`,
    aprovar ? 'Combine com o tio quando vai usar!' : 'Os pontos voltaram para o seu saldo.');
}
