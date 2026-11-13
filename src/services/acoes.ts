import { post, put } from '../api/cliente';
import { enfileirar } from '../api/fila';
import type { Aluno, ConfigVan, Escola, Horario, LatLng, Pagamento, Recompensa, RotaFixa, TipoViagem, Turno, TurnoVan, Van } from '../db/types';
import type { Plano } from '../lib/turnos';
import { hoje } from '../lib/util';

/**
 * Ações do app. Todas vão para a API (Go), que confere quem pode fazer o quê, grava no Postgres
 * e avisa os outros aparelhos em tempo real.
 */

// ---------------- presença (por trecho) ----------------

/** O combinado do dia. Pais e tio podem mudar; se a rota já está andando, ela é reotimizada. */
export const definirPresenca = (alunoId: string, plano: Plano, motivo?: string, _porQuem?: 'pais' | 'motorista', data?: string) =>
  enfileirar({ tipo: 'presenca', caminho: '/presencas', metodo: 'PUT', corpo: { alunoId, plano, motivo: motivo ?? '', data: data ?? '' } });

// ---------------- pagamentos ----------------

export const pagar = (pagamentoId: string, metodo: Pagamento['metodo'], porQuem?: 'pais' | 'motorista') =>
  enfileirar({ tipo: 'pagar', caminho: `/pagamentos/${pagamentoId}/pagar`, metodo: 'POST', corpo: { metodo, porPais: porQuem === 'pais' } });
export const desfazerPagamento = (pagamentoId: string) => post(`/pagamentos/${pagamentoId}/desfazer`);
export const gerarCobrancas = async (_vanId: string, mes: string) => (await post<{ criadas: number }>('/pagamentos/gerar', { mes })).criadas;
export const atrasado = (p: Pagamento) => p.status === 'pendente' && p.vencimento < hoje();

// ---------------- van, turnos, escolas, alunos ----------------

export const salvarAluno = (a: Aluno, novo: boolean) => (novo ? post<Aluno>('/alunos', a) : put<Aluno>(`/alunos/${a.id}`, a));
export const arquivarAluno = (id: string, ativo: boolean) => put(`/alunos/${id}/ativo`, { ativo });
export const salvarConfig = (c: ConfigVan) => put<Van>('/van/config', c);
export const salvarTurnos = (turnos: TurnoVan[]) => put<Van>('/van/turnos', { turnos });
export const salvarVan = (v: Pick<Van, 'nome' | 'motorista' | 'telefone' | 'placa' | 'modelo' | 'garagem' | 'precoPadrao' | 'vagas'>) => put<Van>('/van', v);

export interface EscolaForm { nome: string; endereco: string; local: LatLng; horarios: Partial<Record<Turno, Horario>> }
export const salvarEscola = (id: string | null, e: EscolaForm) => (id ? put<Escola>(`/escolas/${id}`, e) : post<Escola>('/escolas', e));

/** Rota fixa (vale até o tio mudar de novo, ex.: o semestre todo). */
export const salvarRotaFixa = (_vanId: string, turno: Turno, tipo: TipoViagem, mud: Partial<Pick<RotaFixa, 'ativa' | 'ordem'>>) =>
  put('/van/rota-fixa', { turno, tipo, ...mud });

// ---------------- mensagens ----------------

/** Recado para a escola (tio) ou para a van (escola). Vai pela fila: sem sinal, sai quando voltar. */
export const enviarRecado = (vanId: string, escolaId: string, de: 'motorista' | 'escola', texto: string) =>
  (texto.trim() ? enfileirar({ tipo: 'recado', caminho: '/recados', metodo: 'POST', corpo: { vanId, escolaId, texto: texto.trim(), de } }).then(() => undefined) : Promise.resolve());
export const lerRecados = (vanId: string, escolaId: string) => post('/recados/lidos', { vanId, escolaId });

export const enviarMensagem = (alunoId: string, de: 'pais' | 'motorista', texto: string) =>
  (texto.trim() ? enfileirar({ tipo: 'mensagem', caminho: '/mensagens', metodo: 'POST', corpo: { alunoId, texto: texto.trim(), de } }).then(() => undefined) : Promise.resolve());
export const lerMensagens = (alunoId: string, _quemLe?: 'pais' | 'motorista') => post('/mensagens/lidas', { alunoId });

// ---------------- escola ----------------

export const credenciar = (vanId: string, _escolaId: string, situacao: 'credenciada' | 'pendente' | 'suspensa') => put('/escola/credenciar', { vanId, situacao });
export const definirConfirmaEntrada = (_escolaId: string, confirma: boolean) => put('/escola/confirma-entrada', { confirma });

// ---------------- família ----------------

export const vincularFilho = (codigo: string) => post('/familia/vincular', { codigo });

// ---------------- prêmios ----------------

export const salvarRecompensa = (r: Partial<Recompensa>) => (r.id ? put(`/recompensas/${r.id}`, r) : post('/recompensas', r));
