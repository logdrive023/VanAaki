import { db } from '../db/db';
import type { Notificacao, Perfil } from '../db/types';
import { agoraIso, uid } from '../lib/util';

type Nova = Omit<Notificacao, 'id' | 'criadoEm' | 'lida'>;

/** Grava a notificação; cada portal mostra as suas (pais/aluno só as do próprio aluno). */
export async function notificar(n: Nova) {
  await db.notificacoes.add({ ...n, id: uid(), criadoEm: agoraIso(), lida: false });
}

/** Mesma mensagem para pais e aluno. */
export async function notificarFamilia(alunoId: string, icone: string, titulo: string, texto: string, soPais = false) {
  await notificar({ para: 'pais', alunoId, icone, titulo, texto });
  if (!soPais) await notificar({ para: 'aluno', alunoId, icone, titulo, texto });
}

export async function marcarLidas(para: Perfil, filtro: { alunoId?: string; vanId?: string; escolaId?: string }) {
  const lista = await db.notificacoes.where('para').equals(para).filter((n) => !n.lida
    && (!filtro.alunoId || n.alunoId === filtro.alunoId)
    && (!filtro.vanId || n.vanId === filtro.vanId)
    && (!filtro.escolaId || n.escolaId === filtro.escolaId)).toArray();
  await db.notificacoes.bulkPut(lista.map((n) => ({ ...n, lida: true })));
}
