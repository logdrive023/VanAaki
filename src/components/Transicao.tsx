import { useRef, type ReactNode } from 'react';
import { I } from './Icone';

/**
 * TRANSIÇÕES PADRÃO DO APP (uma regra só para todas as telas — styles/movimento.css):
 *   - trocar de aba/tela .......... "surgir"   (sobe 8px e aparece)
 *   - avançar num passo a passo ... "avancar"  (entra pela direita)
 *   - voltar num passo a passo .... "voltar"   (entra pela esquerda)
 * Quem pediu "menos animação" (no app ou no celular) vê a troca direta.
 */
export type Direcao = 'surgir' | 'avancar' | 'voltar';

/** Anima o conteúdo sempre que `chave` muda. Sem `direcao`, descobre sozinho se `ordem` subiu ou desceu. */
export function Transicao({ chave, ordem, direcao, className, children }: { chave: string | number; ordem?: number; direcao?: Direcao; className?: string; children: ReactNode }) {
  const anterior = useRef(ordem);
  let dir: Direcao = direcao ?? 'surgir';
  if (!direcao && ordem !== undefined && anterior.current !== undefined && ordem !== anterior.current) dir = ordem > anterior.current ? 'avancar' : 'voltar';
  anterior.current = ordem;
  return <div key={chave} className={`transicao t-${dir} ${className ?? ''}`}>{children}</div>;
}

/** Duas ou mais opções lado a lado com a marcação deslizando (ex.: Entrar | Primeiro acesso). */
export function Segmento<T extends string>({ opcoes, valor, onChange, rotulo, className }: {
  opcoes: { valor: T; nome: ReactNode }[]; valor: T; onChange: (v: T) => void; rotulo: string; className?: string;
}) {
  const i = Math.max(0, opcoes.findIndex((o) => o.valor === valor));
  return (
    <div className={`segmento ${className ?? ''}`} role="tablist" aria-label={rotulo} style={{ ['--n' as string]: opcoes.length, ['--i' as string]: i }}>
      <span className="seg-marca" aria-hidden />
      {opcoes.map((o) => (
        <button key={o.valor} type="button" role="tab" aria-selected={o.valor === valor} className={o.valor === valor ? 'ativo' : ''} onClick={() => onChange(o.valor)}>{o.nome}</button>
      ))}
    </div>
  );
}

/** A cena animada do login: a van chega (entrar) ou chega com a porta abrindo para alguém novo (primeiro acesso). */
export function CenaLogin({ modo, titulo, texto }: { modo: string; titulo: string; texto: string }) {
  return (
    <div className="cena-login" key={modo} aria-live="polite">
      <div className="cena-estrada" aria-hidden>
        <span className="cena-faixa" />
        <span className={`cena-van cena-${modo}`}><I n="van" /></span>
        <span className="cena-casa"><I n={modo === 'entrar' ? 'casa' : 'usuario'} /></span>
      </div>
      <div className="cena-txt"><strong>{titulo}</strong><span>{texto}</span></div>
    </div>
  );
}
