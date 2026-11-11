import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
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
  const presencasR = useLiveQuery(() => db.presencas.where('data').equals(hoje()).toArray());
  const pagamentosR = useLiveQuery(() => db.pagamentos.where('mes').equals(mesAtual()).toArray());
  const escolasR = useLiveQuery(() => db.escolas.toArray());
  const carregando = [van, alunosR, viagensR, presencasR, pagamentosR, escolasR].some((x) => x === undefined);

  const alunos = alunosR ?? [], viagensHoje = viagensR ?? [], presencas = presencasR ?? [], escolas = escolasR ?? [];
  const ativos = alunos.filter((a) => a.ativo);
  const idsAtivos = new Set(ativos.map((a) => a.id));
  const ativa = viagensHoje.find((v) => v.status === 'em_andamento');
  const ultima = [...viagensHoje].filter((v) => v.status === 'concluida').sort((a, b) => (b.concluidaEm ?? '').localeCompare(a.concluidaEm ?? ''))[0];
  const naoVao = new Set(presencas.filter((p) => !p.vai && idsAtivos.has(p.alunoId)).map((p) => p.alunoId));
  return {
    van, alunos, ativos, ativa, ultima, presencas, naoVao, escolas, carregando,
    mapaAlunos: new Map(alunos.map((a) => [a.id, a])),
    pagamentosMes: (pagamentosR ?? []).filter((p) => idsAtivos.has(p.alunoId)),
  };
}
export type DadosVan = ReturnType<typeof useDadosVan>;
