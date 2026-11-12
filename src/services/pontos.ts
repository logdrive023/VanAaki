import { post } from '../api/cliente';
import type { Aluno } from '../db/types';

/** Elogio ou ocorrência do tio (ocorrência avisa os pais na hora — feito no servidor). */
export const darPontos = (aluno: Aluno, tipo: string, _autor: 'sistema' | 'motorista', observacao?: string) =>
  post('/pontos', { alunoId: aluno.id, tipo, observacao: observacao ?? '' });

/** O aluno (ou os pais) pede um prêmio da loja. */
export const resgatar = (alunoId: string, recompensaId: string) => post('/resgates', { alunoId, recompensaId });

export const decidirResgate = (id: string, aprovar: boolean) => post(`/resgates/${id}/decidir`, { aprovar });
