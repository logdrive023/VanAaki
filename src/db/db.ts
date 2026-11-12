import Dexie, { type Table } from 'dexie';
import type {
  Aluno, Config, Escola, EventoPontos, Mensagem, Notificacao, Pagamento, Presenca, Recompensa, Resgate, Van, Viagem,
} from './types';

/**
 * Cópia local (IndexedDB) do que o servidor mandou para ESTE perfil.
 * O servidor (Go + Postgres) é quem manda: o app só guarda para abrir rápido e funcionar sem sinal,
 * e o `useLiveQuery` do Dexie redesenha a tela quando chega dado novo pelo tempo real.
 * Cada perfil tem o próprio banco (dá para abrir tio, pais, aluno e escola em abas do mesmo navegador).
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

  constructor(nome: string) {
    super(nome);
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

const perfil = location.hash.replace(/^#\/?/, '').split('/')[0] || 'nenhum';
export const db = new VanDB(`vanaaki-${perfil}`);
