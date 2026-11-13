import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { planoDe, type Plano } from '../../lib/turnos';
import { hoje, mesAtual } from '../../lib/util';

/**
 * Tudo que o painel do motorista precisa, sempre atualizado (inclusive vindo de outras abas).
 * `carregando` fica true até TODAS as consultas responderem — assim nenhuma tela vê uma lista
 * vazia "de mentira" enquanto o IndexedDB ainda está lendo.
 */
export function useDadosVan(vanId: string) {
  const van = useLiveQuery(() => db.vans.get(vanId), [vanId]);
  const alunosR = useLiveQuery(() => db.alunos.where('vanId').equals(vanId).toArray(), [vanId]);
  const viagensR = useLiveQuery(() => db.viagens.where('data').equals(hoje()).filter((v) => v.vanId === vanId).toArray(), [vanId]);
  // hoje e os próximos dias (a agenda mostra os combinados já marcados)
  const agendaR = useLiveQuery(() => db.presencas.where('data').aboveOrEqual(hoje()).toArray());
  const presencasR = agendaR?.filter((p) => p.data === hoje());
  const pagamentosR = useLiveQuery(() => db.pagamentos.where('mes').equals(mesAtual()).toArray());
  const escolasR = useLiveQuery(() => db.escolas.toArray());
  const carregando = [van, alunosR, viagensR, presencasR, pagamentosR, escolasR].some((x) => x === undefined);

  const alunos = alunosR ?? [], viagensHoje = viagensR ?? [], presencas = presencasR ?? [], escolas = escolasR ?? [];
  const ativos = alunos.filter((a) => a.ativo);
  const idsAtivos = new Set(ativos.map((a) => a.id));
  const ativa = viagensHoje.find((v) => v.status === 'em_andamento');
  const concluidas = viagensHoje.filter((v) => v.status === 'concluida');
  const ultima = [...viagensHoje].filter((v) => v.status === 'concluida').sort((a, b) => (b.concluidaEm ?? '').localeCompare(a.concluidaEm ?? ''))[0];
  /** combinado do dia de cada aluno (sem aviso = ida e volta) */
  const presencaPorAluno = new Map(presencas.map((p) => [p.alunoId, p]));
  const plano = (alunoId: string): Plano => planoDe(presencaPorAluno.get(alunoId));
  const avisos = presencas.filter((p) => idsAtivos.has(p.alunoId) && planoDe(p) !== 'ambos');
  return {
    agenda: agendaR ?? [],
    /** configurações com os padrões preenchidos */
    cfg: { diaVencimento: 10, folgaMin: 5, avisoParadas: 1, ...van?.config },
    gamificacao: !van?.config?.semGamificacao,
    van, alunos, ativos, ativa, ultima, concluidas, viagensHoje, presencas, presencaPorAluno, plano, avisos, escolas, carregando,
    mapaEscolas: new Map(escolas.map((e) => [e.id, e])),
    mapaAlunos: new Map(alunos.map((a) => [a.id, a])),
    pagamentosMes: (pagamentosR ?? []).filter((p) => idsAtivos.has(p.alunoId)),
  };
}
export type DadosVan = ReturnType<typeof useDadosVan>;
