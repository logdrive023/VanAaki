import type { ReactNode } from 'react';
import { I, Logo, type NomeIcone } from './Icone';
import { ir, PainelTeste, Sino, Toasts, type FiltroNotif } from './ui';

/** `curto`: nome usado nas abas de baixo do celular (onde cabem ~7 palavras curtas). */
export interface ItemMenu { id: string; ic: NomeIcone; nome: string; curto?: string; badge?: number; grupo?: string; desc?: string
  /** aparece nas abas de baixo do celular; os outros vão para "Mais" */
  principal?: boolean }

/** Lista do "Mais" (celular): o que não cabe nas abas de baixo. */
export function MenuMais({ base, menu }: { base: string; menu: ItemMenu[] }) {
  let grupoAnterior: string | undefined;
  return (
    <section className="card" style={{ padding: 6 }}>
      <div className="mais-lista">
        {menu.filter((m) => !m.principal).map((m) => {
          const rot = m.grupo && m.grupo !== grupoAnterior ? m.grupo : null;
          grupoAnterior = m.grupo;
          return (
            <span key={m.id} style={{ display: 'contents' }}>
              {rot && <span className="mais-rot">{rot}</span>}
              <button type="button" className="mais-item" onClick={() => ir(`${base}/${m.id}`)}>
                <span className="mi-ic"><I n={m.ic} /></span>
                <span className="mi-txt">{m.nome}{m.desc && <small>{m.desc}</small>}</span>
                {!!m.badge && <span className="cont">{m.badge}</span>}
                <I n="chevron" />
              </button>
            </span>
          );
        })}
      </div>
    </section>
  );
}

/** Layout com menu lateral (desktop) e abas embaixo (celular) — motorista e escola. */
export function ShellPainel({ base, menu, atual, perfil, filtro, titulo, sub, acoes, children }: {
  base: string; menu: ItemMenu[]; atual: string; perfil: ReactNode; filtro: FiltroNotif;
  titulo: string; sub?: string; acoes?: ReactNode; children: ReactNode;
}) {
  let grupoAnterior: string | undefined;
  const temMais = menu.some((m) => m.principal) && menu.some((m) => !m.principal);
  const badgeMais = menu.filter((m) => !m.principal).reduce((s, m) => s + (m.badge ?? 0), 0);
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
          <div className="acoes">{acoes}<Sino filtro={filtro} /><span className="so-celular"><PainelTeste compacto /></span></div>
        </div>
        {children}
      </main>
      <nav className="tabs-mobile">
        {(temMais ? menu.filter((m) => m.principal) : menu).map((m) => (
          <a key={m.id} className={atual === m.id ? 'ativo' : ''} onClick={() => ir(`${base}/${m.id}`)}>
            <I n={m.ic} /><span className="rot">{m.curto ?? m.nome}</span>{!!m.badge && <span className="bolinha">{m.badge}</span>}
          </a>
        ))}
        {temMais && (
          <a className={atual === 'mais' || !menu.find((m) => m.id === atual)?.principal ? 'ativo' : ''} onClick={() => ir(`${base}/mais`)}>
            <I n="lista" /><span className="rot">Mais</span>{badgeMais > 0 && <span className="bolinha">{badgeMais}</span>}
          </a>
        )}
      </nav>
      <Toasts filtro={filtro} />
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
