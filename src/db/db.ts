import Dexie, { type Table } from 'dexie';
import type {
  Aluno, Config, Escola, EventoPontos, Mensagem, Notificacao, Pagamento, Presenca, Recompensa, Resgate, Van, Viagem,
} from './types';

/**
 * Banco local (IndexedDB) — tudo fica no navegador, sem servidor.
 * Várias abas abertas (motorista, pais, aluno, escola) enxergam as mesmas tabelas e
 * o `useLiveQuery` do Dexie atualiza todas na hora quando uma delas grava.
 */
export class VanDB extends Dexie {
  escolas!: Table<Escola, string>;
  vans!: Table<Van, string>;
  alunos!: Table<Aluno, string>;
  pagamentos!: Table<Pagamento, string>;
  presencas!: Table<Presenca, string>;
  viagens!: Table<Viagem, string>;
  notificacoes!: Table<Notificacao, string>;
  mensagens!: Table<Mensagem, string>;
  pontos!: Table<EventoPontos, string>;
  recompensas!: Table<Recompensa, string>;
  resgates!: Table<Resgate, string>;
  config!: Table<Config, string>;

  constructor() {
    super('vanaaki');
    this.version(1).stores({
      escolas: 'id',
      vans: 'id',
      alunos: 'id, vanId, escolaId, ativo',
      pagamentos: 'id, alunoId, mes, status, [alunoId+mes]',
      presencas: 'id, alunoId, data',
      viagens: 'id, vanId, data, status, [vanId+status]',
      notificacoes: 'id, para, alunoId, criadoEm',
      mensagens: 'id, alunoId, criadoEm',
      pontos: 'id, alunoId, vanId, data, criadoEm',
      recompensas: 'id, vanId',
      resgates: 'id, alunoId, status',
      config: 'id',
    });
  }

  get todas() {
    return [this.escolas, this.vans, this.alunos, this.pagamentos, this.presencas, this.viagens,
      this.notificacoes, this.mensagens, this.pontos, this.recompensas, this.resgates, this.config];
  }
}

export const db = new VanDB();

if (typeof window !== 'undefined') {
  db.on('versionchange', () => { db.close(); window.location.reload(); return false; });
}

/** Pede ao navegador para não apagar os dados quando faltar espaço (igual ao dia-dia). */
export async function pedirPersistencia() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* sem suporte */ }
}
