/**
 * Pix "copia e cola" (BR Code estático, padrão EMV do Banco Central).
 * A família paga a mensalidade direto na chave do tio, sem intermediário e sem taxa.
 * O valor e a identificação (ex.: "LUCAS NOV") já vão no código.
 */
import type { ConfigVan } from '../db/types';

const campo = (id: string, valor: string) => `${id}${String(valor.length).padStart(2, '0')}${valor}`;

/** Tira acento e caracteres que os bancos recusam no nome/cidade. */
const limpar = (s: string, max: number) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, '').trim().toUpperCase().slice(0, max);

/** CRC16-CCITT (0x1021, início 0xFFFF), exigido no fim do BR Code. */
function crc16(s: string) {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Chave no formato que o Pix espera (celular com +55, CPF/CNPJ só números). */
export function normalizarChave(tipo: ConfigVan['pixTipo'], chave: string) {
  const c = chave.trim();
  if (tipo === 'cpf' || tipo === 'cnpj') return c.replace(/\D/g, '');
  if (tipo === 'celular') { const d = c.replace(/\D/g, ''); return d.startsWith('55') && d.length > 11 ? `+${d}` : `+55${d}`; }
  if (tipo === 'email') return c.toLowerCase();
  return c;
}

export function pixCopiaECola(cfg: ConfigVan, valorCentavos: number, identificador: string) {
  const chave = normalizarChave(cfg.pixTipo, cfg.pixChave ?? '');
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', chave);
  const txid = limpar(identificador, 25).replace(/ /g, '') || '***';
  const corpo = campo('00', '01')
    + campo('26', conta)
    + campo('52', '0000')
    + campo('53', '986')
    + (valorCentavos > 0 ? campo('54', (valorCentavos / 100).toFixed(2)) : '')
    + campo('58', 'BR')
    + campo('59', limpar(cfg.pixNome ?? '', 25) || 'RECEBEDOR')
    + campo('60', limpar(cfg.pixCidade ?? '', 15) || 'BRASIL')
    + campo('62', campo('05', txid))
    + '6304';
  return corpo + crc16(corpo);
}

export const temPix = (cfg?: ConfigVan) => !!(cfg?.pixChave && cfg.pixNome && cfg.pixCidade && cfg.pixTipo);
