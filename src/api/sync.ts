import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '../db/db';
import type { Aluno, Escola, Eu, EventoPontos, LatLng, Mensagem, Notificacao, Pagamento, Presenca, Recompensa, Resgate, Van, Viagem } from '../db/types';
import { api, API_URL, lerSessao } from './cliente';

interface Pacote {
  eu: Eu; hoje: string;
  escolas: Escola[]; vans: Van[]; alunos: Aluno[]; pagamentos: Pagamento[]; presencas: Presenca[]; viagens: Viagem[];
  notificacoes: Notificacao[]; mensagens: Mensagem[]; pontos: EventoPontos[]; recompensas: Recompensa[]; resgates: Resgate[];
}

/** Baixa tudo o que este perfil pode ver e troca a cópia local (numa transação: a tela redesenha uma vez). */
export async function sincronizar() {
  const p = await api<Pacote>('/sync');
  await db.transaction('rw', db.todas, async () => {
    const trocar = async <T,>(t: { clear: () => Promise<void>; bulkPut: (l: T[]) => Promise<unknown> }, l: T[]) => { await t.clear(); await t.bulkPut(l); };
    await trocar(db.escolas, p.escolas);
    await trocar(db.vans, p.vans);
    await trocar(db.alunos, p.alunos);
    await trocar(db.pagamentos, p.pagamentos);
    await trocar(db.presencas, p.presencas);
    await trocar(db.viagens, p.viagens);
    await trocar(db.notificacoes, p.notificacoes);
    await trocar(db.mensagens, p.mensagens);
    await trocar(db.pontos, p.pontos);
    await trocar(db.recompensas, p.recompensas);
    await trocar(db.resgates, p.resgates);
    await db.config.put({ id: 'eu', valor: p.eu });
    await db.config.put({ id: 'hoje', valor: p.hoje });
  });
}

let fila: ReturnType<typeof setTimeout> | undefined;
/** Vários avisos seguidos viram uma sincronização só. */
function sincronizarLogo() {
  clearTimeout(fila);
  fila = setTimeout(() => { void sincronizar().catch(() => undefined); }, 250);
}

interface Movimento { id: string; pos: LatLng; caminho: LatLng[]; naParada: boolean; chegouParadaEm?: string; alvo: number; atualizadoEm: string }

/** Conecta no tempo real (SSE). Reconecta sozinho; ao voltar, sincroniza tudo de novo. */
export function conectarTempoReal(perfil: string, onEstado: (online: boolean) => void) {
  let es: EventSource | null = null;
  let parar = false;
  let espera = 1000;
  const abrir = () => {
    const s = lerSessao(perfil);
    if (!s || parar) return;
    es = new EventSource(`${API_URL}/api/eventos?token=${encodeURIComponent(s.token)}`);
    es.addEventListener('ola', () => { espera = 1000; onEstado(true); sincronizarLogo(); });
    es.addEventListener('sync', sincronizarLogo);
    es.addEventListener('viagem', (e) => { void db.viagens.put(JSON.parse((e as MessageEvent).data) as Viagem); });
    es.addEventListener('mov', (e) => {
      const m = JSON.parse((e as MessageEvent).data) as Movimento;
      void db.viagens.get(m.id).then((v) => {
        if (!v) return;
        const ult = v.rastro[v.rastro.length - 1];
        const rastro = !ult || ult.lat !== m.pos.lat || ult.lng !== m.pos.lng ? [...v.rastro, m.pos] : v.rastro;
        return db.viagens.put({ ...v, pos: m.pos, caminho: m.caminho, naParada: m.naParada, chegouParadaEm: m.chegouParadaEm, alvo: m.alvo, atualizadoEm: m.atualizadoEm, rastro });
      });
    });
    es.onerror = () => {
      onEstado(false);
      es?.close();
      if (!parar) setTimeout(abrir, espera);
      espera = Math.min(espera * 2, 15000);
    };
  };
  abrir();
  const voltou = () => { if (document.visibilityState === 'visible') sincronizarLogo(); };
  document.addEventListener('visibilitychange', voltou);
  return () => { parar = true; es?.close(); document.removeEventListener('visibilitychange', voltou); };
}

/** Quem está logado (e as vans/alunos/escola que ele vê). */
export function useEu() {
  return useLiveQuery(async () => (await db.config.get('eu'))?.valor as Eu | undefined);
}

/** Estado da conexão com o servidor, para o selo "sem conexão". */
export function useConexao(perfil: string) {
  const [online, setOnline] = useState(true);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState('');
  useEffect(() => {
    sincronizar().then(() => setPronto(true)).catch((e: Error) => { setErro(e.message); setPronto(true); });
    return conectarTempoReal(perfil, setOnline);
  }, [perfil]);
  return { online, pronto, erro };
}
