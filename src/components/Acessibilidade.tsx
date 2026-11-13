import { useEffect, useState } from 'react';
import { baseDoCelular, lerPrefs, PADRAO, salvarPrefs, TAMANHOS, type PrefsAcess } from '../lib/acessibilidade';
import { I } from './Icone';
import { Modal } from './ui';

/** Botão "Aa" do topo: abre o painel. Aparece em todas as telas, inclusive antes de entrar. */
export function BotaoAcessibilidade({ rotulo }: { rotulo?: boolean }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" className={rotulo ? 'btn btn-claro btn-sm acess-btn' : 'sino-btn acess-btn'} onClick={() => setAberto(true)} aria-label="Acessibilidade: tamanho da letra e contraste">
        <I n="letra" />{rotulo && <span>Letra</span>}
      </button>
      {aberto && <PainelAcessibilidade onFechar={() => setAberto(false)} />}
    </>
  );
}

export function PainelAcessibilidade({ onFechar }: { onFechar: () => void }) {
  const [p, set] = usePrefs();
  const celular = baseDoCelular();
  return (
    <Modal titulo="Acessibilidade" onFechar={onFechar}>
      <div className="pilha acess" style={{ gap: 18 }}>
        <section>
          <h4 id="acess-tam">Tamanho da letra</h4>
          <div className="acess-tamanhos" role="radiogroup" aria-labelledby="acess-tam">
            {TAMANHOS.map((t) => (
              <button key={t.v} type="button" role="radio" aria-checked={p.texto === t.v} className={p.texto === t.v ? 'ativo' : ''} onClick={() => set({ texto: t.v })}>
                <span style={{ fontSize: `${16 * t.v}px` }}>Aa</span><small>{t.nome}</small>
              </button>
            ))}
          </div>
          <div className="acess-amostra" aria-hidden>
            <strong>A van chega em 7 minutos</strong>
            <span>O tio está a 2 paradas da sua casa.</span>
          </div>
          {celular > 1.02 && <p className="muted small">Já aumentamos {Math.round((celular - 1) * 100)}% porque o seu celular usa letra grande.</p>}
        </section>
        <Chave ic="contraste" titulo="Alto contraste" desc="Letras mais escuras e bordas mais fortes" ligado={p.contraste} onChange={(v) => set({ contraste: v })} />
        <Chave ic="pausa" titulo="Menos animação" desc="Nada se mexe sozinho na tela" ligado={p.movimento} onChange={(v) => set({ movimento: v })} />
        <Chave ic="libras" titulo="Libras" desc="Tradutor VLibras, do governo federal (precisa de internet)" ligado={p.libras} onChange={(v) => set({ libras: v })} />
        <button type="button" className="btn btn-claro btn-bloco" onClick={() => set(PADRAO)}>Voltar ao padrão</button>
        <button type="button" className="btn btn-primario btn-bloco btn-grande" onClick={onFechar}>Pronto</button>
      </div>
    </Modal>
  );
}

function Chave({ ic, titulo, desc, ligado, onChange }: { ic: Parameters<typeof I>[0]['n']; titulo: string; desc: string; ligado: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} className={`acess-chave ${ligado ? 'ligado' : ''}`} onClick={() => onChange(!ligado)}>
      <span className="ac-ic"><I n={ic} /></span>
      <span className="ac-txt"><strong>{titulo}</strong><small>{desc}</small></span>
      <span className="ac-switch" aria-hidden><i /></span>
    </button>
  );
}

export function usePrefs(): [PrefsAcess, (m: Partial<PrefsAcess>) => void] {
  const [p, setP] = useState(lerPrefs);
  useEffect(() => {
    const f = () => setP(lerPrefs());
    window.addEventListener('vanaaki-acessibilidade', f);
    return () => window.removeEventListener('vanaaki-acessibilidade', f);
  }, []);
  return [p, (m) => salvarPrefs({ ...lerPrefs(), ...m })];
}

