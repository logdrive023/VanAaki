import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { db } from '../db/db';
import type { Aluno, Notificacao, Perfil } from '../db/types';
import { api, perfilDaAba, sair } from '../api/cliente';
import { sincronizar, useEu } from '../api/sync';
import { marcarLidas } from '../services/notificar';
import { haQuanto, iniciais } from '../lib/util';

// ---------------- rota (hash) ----------------

/** "#/motorista/rota" → ['motorista', 'rota'] */
export function useHash() {
  const ler = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [partes, setPartes] = useState(ler);
  useEffect(() => {
    const f = () => { setPartes(ler()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return partes;
}
export const ir = (caminho: string) => { window.location.hash = `#/${caminho}`; };

// ---------------- peças ----------------

export function Avatar({ aluno, nome, cor, tam }: { aluno?: Aluno; nome?: string; cor?: string; tam?: number }) {
  const n = aluno?.nome ?? nome ?? '?';
  return (
    <div className="avatar" style={{ background: aluno?.cor ?? cor, ...(tam ? { width: tam, height: tam, fontSize: tam * 0.36 } : {}) }}>{iniciais(n)}</div>
  );
}

export function Modal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: ReactNode }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onFechar]);
  return (
    <div className="modal-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="modal" role="dialog" aria-label={titulo}>
        <div className="entre" style={{ marginBottom: 6 }}><h3 style={{ margin: 0 }}>{titulo}</h3><button className="btn btn-claro btn-sm" onClick={onFechar}>✕</button></div>
        {children}
      </div>
    </div>
  );
}

export function Toggle({ on, onChange, titulo }: { on: boolean; onChange: (v: boolean) => void; titulo?: string }) {
  return <button type="button" className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} title={titulo} aria-pressed={on} />;
}

export function Vazio({ ic, children }: { ic: string; children: ReactNode }) {
  return <div className="vazio"><span className="ic">{ic}</span>{children}</div>;
}

// ---------------- notificações ----------------

export interface FiltroNotif { para: Perfil; alunoId?: string; vanId?: string; escolaId?: string }

export function useNotificacoes(f: FiltroNotif) {
  return useNotificacoesBruto(f) ?? [];
}
/** undefined enquanto o banco ainda não respondeu (para não confundir "carregando" com "vazio"). */
function useNotificacoesBruto(f: FiltroNotif) {
  return useLiveQuery(async () => {
    const l = await db.notificacoes.where('para').equals(f.para).filter((n) =>
      (!f.alunoId || n.alunoId === f.alunoId) && (!f.vanId || n.vanId === f.vanId) && (!f.escolaId || n.escolaId === f.escolaId)).toArray();
    return l.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }, [f.para, f.alunoId, f.vanId, f.escolaId]);
}

/** Mostra um aviso flutuante para cada notificação nova (e a notificação do sistema, se permitida). */
export function Toasts({ filtro }: { filtro: FiltroNotif }) {
  const lista = useNotificacoesBruto(filtro);
  const vistos = useRef<Set<string> | null>(null);
  const [toasts, setToasts] = useState<Notificacao[]>([]);
  const chave = `${filtro.para}|${filtro.alunoId}|${filtro.vanId}|${filtro.escolaId}`;
  useEffect(() => { vistos.current = null; setToasts([]); }, [chave]);
  useEffect(() => {
    if (!lista) return;
    if (!vistos.current) { vistos.current = new Set(lista.map((n) => n.id)); return; }
    const novas = lista.filter((n) => !vistos.current!.has(n.id));
    if (!novas.length) return;
    novas.forEach((n) => vistos.current!.add(n.id));
    setToasts((t) => [...novas.slice(0, 3), ...t].slice(0, 4));
    for (const n of novas) {
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== n.id)), 6000);
      try {
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification(n.titulo, { body: n.texto, icon: './icon-192.png', tag: n.id });
      } catch { /* sem suporte */ }
      try { navigator.vibrate?.(120); } catch { /* sem suporte */ }
    }
  }, [lista]);
  return (
    <div className="toasts">
      {toasts.map((n) => (
        <div key={n.id} className="toast" onClick={() => setToasts((t) => t.filter((x) => x.id !== n.id))}>
          <div className="ic">{n.icone}</div>
          <div><strong>{n.titulo}</strong><small>{n.texto}</small></div>
        </div>
      ))}
    </div>
  );
}

export function Sino({ filtro }: { filtro: FiltroNotif }) {
  const lista = useNotificacoes(filtro);
  const [aberto, setAberto] = useState(false);
  const naoLidas = lista.filter((n) => !n.lida).length;
  const abrir = () => {
    setAberto(!aberto);
    if (!aberto && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  };
  return (
    <>
      <button className="sino-btn" onClick={abrir} aria-label="Notificações">🔔{naoLidas > 0 && <span className="bolinha">{naoLidas}</span>}</button>
      {aberto && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 299 }} onClick={() => { setAberto(false); void marcarLidas(filtro.para, filtro); }} />
          <div className="painel-notif">
            <div className="entre" style={{ padding: '4px 6px 8px' }}>
              <strong>Notificações</strong>
              <button className="btn btn-claro btn-sm" onClick={() => void marcarLidas(filtro.para, filtro)}>Marcar lidas</button>
            </div>
            {lista.length === 0 && <Vazio ic="🔕">Nada por aqui</Vazio>}
            {lista.slice(0, 40).map((n) => (
              <div key={n.id} className={`notif-item ${n.lida ? '' : 'nova'}`}>
                <span className="ic">{n.icone}</span>
                <div><strong>{n.titulo}</strong><small>{n.texto} · {haQuanto(n.criadoEm)}</small></div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ---------------- painel de teste ----------------

interface BIP extends Event { prompt: () => Promise<void> }
let promptInstalar: BIP | null = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); promptInstalar = e as BIP; });

export function PainelTeste() {
  const [aberto, setAberto] = useState(false);
  const eu = useEu();
  const perfil = perfilDaAba();
  const abrirAba = (p: string) => window.open(`./app.html#/${p}`, `vanaaki-${p}`);
  const demo = !!eu?.usuario.demo;
  return (
    <>
      <button className="demo-btn" onClick={() => setAberto(!aberto)} title="Conta">{demo ? '🧪' : '👤'}<span> {demo ? 'Demonstração' : 'Conta'}</span></button>
      {aberto && (
        <div className="demo-painel">
          <strong>{eu?.usuario.nome}</strong>
          <small>{eu?.usuario.email ?? (demo ? 'Conta de demonstração' : '')}</small>
          {demo && (
            <>
              <small>Abra cada perfil numa aba e veja tudo acontecer ao vivo.</small>
              <div className="grade-demo">
                <button onClick={() => abrirAba('motorista')}>🧑‍✈️ Motorista</button>
                <button onClick={() => abrirAba('pais')}>👨‍👩‍👧 Família</button>
                <button onClick={() => abrirAba('aluno')}>🎒 Aluno</button>
                <button onClick={() => abrirAba('escola')}>🏫 Escola</button>
              </div>
              <button onClick={async () => { if (confirm('Voltar os dados da demonstração ao início? (vale para todos que estão testando)')) { await api('/demo/restaurar', { metodo: 'POST', semToken: true }); await sincronizar(); } }}>♻️ Recomeçar a demonstração</button>
            </>
          )}
          {promptInstalar && <button onClick={() => { void promptInstalar?.prompt(); promptInstalar = null; setAberto(false); }}>📲 Instalar o app</button>}
          <a href="./index.html">🏠 Site do VanAaki</a>
          <button onClick={() => sair(perfil)}>↩︎ Sair</button>
        </div>
      )}
    </>
  );
}
