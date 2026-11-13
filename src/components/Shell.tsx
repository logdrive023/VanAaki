import type { ReactNode } from 'react';
import { I, Logo, type NomeIcone } from './Icone';
import { ir, PainelTeste, Sino, Toasts, type FiltroNotif } from './ui';

/** `curto`: nome usado nas abas de baixo do celular (onde cabem ~7 palavras curtas). */
export interface ItemMenu { id: string; ic: NomeIcone; nome: string; curto?: string; badge?: number; grupo?: string }

/** Layout com menu lateral (desktop) e abas embaixo (celular) — motorista e escola. */
export function ShellPainel({ base, menu, atual, perfil, filtro, titulo, sub, acoes, children }: {
  base: string; menu: ItemMenu[]; atual: string; perfil: ReactNode; filtro: FiltroNotif;
  titulo: string; sub?: string; acoes?: ReactNode; children: ReactNode;
}) {
  let grupoAnterior: string | undefined;
  return (
    <div className="shell">
      <aside className="sidebar">
        <Logo />
        {perfil}
        <nav className="side-menu">
          {menu.map((m) => {
            const rot = m.grupo && m.grupo !== grupoAnterior ? m.grupo : null;
            grupoAnterior = m.grupo;
            return (
              <span key={m.id} style={{ display: 'contents' }}>
                {rot && <span className="side-rotulo">{rot}</span>}
                <a className={atual === m.id ? 'ativo' : ''} onClick={() => ir(`${base}/${m.id}`)}>
                  <I n={m.ic} />{m.nome}{!!m.badge && <span className="cont">{m.badge}</span>}
                </a>
              </span>
            );
          })}
        </nav>
        <div className="side-rodape"><PainelTeste lateral /></div>
      </aside>
      <main className="main">
        <div className="main-topo">
          <div style={{ minWidth: 0 }}>{sub && <span className="muted small">{sub}</span>}<h1>{titulo}</h1></div>
          <div className="acoes">{acoes}<Sino filtro={filtro} /></div>
        </div>
        {children}
      </main>
      <nav className="tabs-mobile">
        {menu.map((m) => (
          <a key={m.id} className={atual === m.id ? 'ativo' : ''} onClick={() => ir(`${base}/${m.id}`)}>
            <I n={m.ic} /><span className="rot">{m.curto ?? m.nome}</span>{!!m.badge && <span className="bolinha">{m.badge}</span>}
          </a>
        ))}
      </nav>
      <Toasts filtro={filtro} />
      <PainelTeste />
    </div>
  );
}

/** Layout de celular — pais e aluno. */
export function ShellFone({ base, menu, atual, classe, topo, filtro, children }: {
  base: string; menu: ItemMenu[]; atual: string; classe?: string; topo: ReactNode; filtro: FiltroNotif; children: ReactNode;
}) {
  return (
    <div className={`fone-shell ${classe ?? ''}`}>
      <div className="fone-app">
        <div className="fone-topo">{topo}<PainelTeste compacto /><Sino filtro={filtro} /></div>
        <div className="fone-corpo">{children}</div>
        <nav className="tab-bar">
          {menu.map((m) => (
            <a key={m.id} className={atual === m.id ? 'ativo' : ''} onClick={() => ir(`${base}/${m.id}`)}>
              <I n={m.ic} />{m.nome}{!!m.badge && <span className="bolinha">{m.badge}</span>}
            </a>
          ))}
        </nav>
      </div>
      <Toasts filtro={filtro} />
    </div>
  );
}
