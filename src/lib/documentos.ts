import type { Documento, TipoDocumento } from '../db/types';
import { hoje } from './util';

/** O que a lei pede para o transporte escolar (CTB arts. 136 a 138) e o que as redes costumam exigir. */
export const TIPOS_DOC: { tipo: TipoDocumento; nome: string; de: 'condutor' | 'veiculo'; dica: string }[] = [
  { tipo: 'cnh', nome: 'CNH categoria D', de: 'condutor', dica: 'Carteira de motorista com categoria D (CTB art. 138).' },
  { tipo: 'curso', nome: 'Curso de transporte escolar', de: 'condutor', dica: 'Curso especializado, com a validade que está no certificado.' },
  { tipo: 'vistoria', nome: 'Vistoria do DETRAN', de: 'veiculo', dica: 'Inspeção semestral do veículo (CTB art. 136).' },
  { tipo: 'autorizacao', nome: 'Autorização para transporte escolar', de: 'veiculo', dica: 'Emitida pelo DETRAN ou pela prefeitura.' },
  { tipo: 'seguro', nome: 'Seguro de passageiros (APP)', de: 'veiculo', dica: 'Seguro de acidentes pessoais dos passageiros.' },
  { tipo: 'crlv', nome: 'Licenciamento (CRLV)', de: 'veiculo', dica: 'Licenciamento anual do veículo.' },
];
export const nomeDoc = (t: string) => TIPOS_DOC.find((x) => x.tipo === t)?.nome ?? t;

export type SituacaoDoc = 'ok' | 'vence' | 'vencido' | 'falta';

/** Dias até vencer (negativo = vencido). */
export function diasPara(validade: string) {
  const [a, m, d] = validade.split('-').map(Number);
  const [ha, hm, hd] = hoje().split('-').map(Number);
  return Math.round((new Date(a, m - 1, d).getTime() - new Date(ha, hm - 1, hd).getTime()) / 86400000);
}
export function situacao(d?: Documento): SituacaoDoc {
  if (!d) return 'falta';
  const n = diasPara(d.validade);
  return n < 0 ? 'vencido' : n <= 30 ? 'vence' : 'ok';
}
export const textoSituacao = (d?: Documento) => {
  const s = situacao(d);
  if (s === 'falta') return 'Não cadastrado';
  const n = diasPara(d!.validade);
  const data = d!.validade.split('-').reverse().join('/');
  return s === 'vencido' ? `Venceu em ${data}` : s === 'vence' ? (n === 0 ? 'Vence hoje' : `Vence em ${n} dia${n === 1 ? '' : 's'}`) : `Válido até ${data}`;
};

/** Resumo de uma van: o pior estado manda (vencido > faltando > vencendo > em dia). */
export function resumoDocs(docs: Documento[]) {
  const por = new Map(docs.map((d) => [d.tipo, d]));
  const lista = TIPOS_DOC.map((t) => ({ ...t, doc: por.get(t.tipo), sit: situacao(por.get(t.tipo)) }));
  const vencidos = lista.filter((x) => x.sit === 'vencido').length;
  const faltam = lista.filter((x) => x.sit === 'falta').length;
  const vencendo = lista.filter((x) => x.sit === 'vence').length;
  const geral: SituacaoDoc = vencidos ? 'vencido' : faltam ? 'falta' : vencendo ? 'vence' : 'ok';
  const texto = vencidos ? `${vencidos} vencido${vencidos > 1 ? 's' : ''}` : faltam ? `${faltam} faltando` : vencendo ? `${vencendo} vencendo` : 'Documentos em dia';
  return { lista, geral, texto, vencidos, faltam, vencendo };
}
