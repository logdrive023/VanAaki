import type { Perfil, Usuario } from '../db/types';
import { responderDemo, TOKEN_DEMO_LOCAL } from './demoLocal';

/**
 * Cliente da API em Go. O endereço vem de VITE_API_URL (build) e, se faltar, usa o mesmo host na porta 8090
 * (assim o app aberto pelo celular na rede local também acha a API do computador).
 */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '')
  || `${location.protocol}//${location.hostname || 'localhost'}:8090`;

export interface Sessao { token: string; usuario: Usuario }

/** Site publicado sem servidor configurado: a demonstração roda no navegador (api/demoLocal.ts). */
export const SEM_API = !(import.meta.env.VITE_API_URL as string | undefined)?.trim() && !/^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);

/** Cada perfil tem a própria sessão (dá para abrir tio, pais, aluno e escola em abas do mesmo navegador). */
const chave = (p: string) => `vanaaki-sessao-${p}`;

export function lerSessao(perfil: string): Sessao | null {
  try { const s = localStorage.getItem(chave(perfil)); return s ? JSON.parse(s) as Sessao : null; } catch { return null; }
}
export function salvarSessao(s: Sessao) {
  try { localStorage.setItem(chave(s.usuario.perfil), JSON.stringify(s)); } catch { /* sem storage */ }
}
export function sair(perfil: string) {
  try { localStorage.removeItem(chave(perfil)); } catch { /* sem storage */ }
  indexedDB.deleteDatabase(`vanaaki-${perfil}`);
  location.reload();
}

/** Perfil desta aba (pelo endereço #/perfil). */
export const perfilDaAba = (): Perfil | '' => {
  const p = location.hash.replace(/^#\/?/, '').split('/')[0];
  return (['motorista', 'pais', 'aluno', 'escola'] as const).find((x) => x === p) ?? '';
};

export class ErroApi extends Error {
  constructor(msg: string, public status: number) { super(msg); }
}

/** Chama a API. Erros viram ErroApi com a mensagem pronta para a tela. */
export interface OpcoesApi {
  metodo?: string; corpo?: unknown; perfil?: string; semToken?: boolean;
  /** chave da ação (Idempotency-Key): se a internet cair e o app reenviar, o servidor não faz duas vezes */
  chave?: string;
  /** internet ruim não pode travar o app: desiste depois disso e trata como "sem conexão" (padrão 20 s) */
  timeoutMs?: number;
}

export async function api<T = unknown>(caminho: string, op: OpcoesApi = {}): Promise<T> {
  const perfil = op.perfil ?? perfilDaAba();
  const sessao = op.semToken ? null : lerSessao(perfil);
  if (sessao?.token === TOKEN_DEMO_LOCAL) return responderDemo<T>(caminho, op, perfil);
  let r: Response;
  const ctl = new AbortController();
  const limite = setTimeout(() => ctl.abort(), op.timeoutMs ?? 20000);
  try {
    r = await fetch(`${API_URL}/api${caminho}`, {
      method: op.metodo ?? (op.corpo === undefined ? 'GET' : 'POST'),
      headers: {
        'Content-Type': 'application/json',
        ...(sessao ? { Authorization: `Bearer ${sessao.token}` } : {}),
        ...(op.chave ? { 'Idempotency-Key': op.chave } : {}),
      },
      body: op.corpo === undefined ? undefined : JSON.stringify(op.corpo),
      signal: ctl.signal,
    });
  } catch {
    throw new ErroApi('Sem conexão com o servidor. Confira a internet.', 0);
  } finally {
    clearTimeout(limite);
  }
  const j = await r.json().catch(() => ({})) as { sucesso?: boolean; msg?: string; dados?: T };
  if (r.status === 401 && sessao) { sair(perfil); }
  if (!r.ok || !j.sucesso) throw new ErroApi(j.msg ?? 'Algo deu errado.', r.status);
  return j.dados as T;
}

export const post = <T = unknown>(caminho: string, corpo: unknown = {}) => api<T>(caminho, { metodo: 'POST', corpo });
export const put = <T = unknown>(caminho: string, corpo: unknown = {}) => api<T>(caminho, { metodo: 'PUT', corpo });
export const patch = <T = unknown>(caminho: string, corpo: unknown = {}) => api<T>(caminho, { metodo: 'PATCH', corpo });
