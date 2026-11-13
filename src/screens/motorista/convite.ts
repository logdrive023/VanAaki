import type { Aluno } from '../../db/types';
import { linkWhats, primeiroNome } from '../../lib/util';

/** Mensagem pronta do convite (abre o WhatsApp do tio com o texto; ele só aperta enviar). O link já entra com o código. */
export function convite(a: Aluno, motorista: string) {
  const link = `${location.origin}${location.pathname}#/pais/convite/${a.codigoFamilia}`;
  return linkWhats(a.telefoneResp, `Olá! Aqui é o ${motorista}, da van de ${primeiroNome(a.nome)}. Pelo app VanAaki você recebe um aviso quando a van estiver chegando, quando ${primeiroNome(a.nome)} embarcar e chegar na escola. É só tocar no link: ${link}`);
}
