/**
 * Dados da empresa que aparecem na Política de Privacidade, nos Termos e no rodapé do site.
 * PREENCHER antes de vender: enquanto estiverem vazios, as páginas mostram "em definição".
 */
export const EMPRESA = {
  nome: 'VanAaki',
  razaoSocial: '',
  cnpj: '',
  endereco: '',
  /** encarregado pelo tratamento de dados pessoais (LGPD art. 41) */
  encarregado: { nome: '', email: '' },
};

/** Versão da Política de Privacidade. Mudou o texto? Mude aqui e no servidor (privacidade/service): todos aceitam de novo. */
export const VERSAO_POLITICA = '2026-11-13';
export const dataPolitica = () => VERSAO_POLITICA.split('-').reverse().join('/');
