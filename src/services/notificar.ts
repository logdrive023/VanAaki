import { post } from '../api/cliente';
import { db } from '../db/db';
import type { Perfil } from '../db/types';

/** Marca as notificações como lidas (na hora na tela; o servidor grava e avisa os outros aparelhos). */
export async function marcarLidas(_para: Perfil, _filtro?: unknown) {
  const l = await db.notificacoes.filter((n) => !n.lida).toArray();
  if (!l.length) return;
  await db.notificacoes.bulkPut(l.map((n) => ({ ...n, lida: true })));
  await post('/notificacoes/lidas').catch(() => undefined);
}
