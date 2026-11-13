import { Component, useEffect, useRef, type ReactNode } from 'react';
import { lerSessao } from './api/cliente';
import { useConexao, useEu } from './api/sync';
import { useFila } from './api/fila';
import { useHash } from './components/ui';
import { I } from './components/Icone';
import Fiscal from './screens/Fiscal';
import type { Perfil } from './db/types';
import Aluno from './screens/Aluno';
import Entrar from './screens/Entrar';
import Escola from './screens/Escola';
import Motorista from './screens/motorista/Motorista';
import Pais from './screens/Pais';

/** Se uma tela quebrar, mostra o aviso em vez de página em branco. */
class Protecao extends Component<{ children: ReactNode }, { erro?: Error }> {
  state: { erro?: Error } = {};
  static getDerivedStateFromError(erro: Error) { return { erro }; }
  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="vazio" style={{ maxWidth: 460, margin: '20vh auto' }}>
        <span className="ic"><I n="alerta" /></span>
        <strong>Algo deu errado nesta tela.</strong>
        <p className="small" style={{ margin: '8px 0 14px' }}>{this.state.erro.message}</p>
        <button className="btn btn-primario" onClick={() => location.reload()}>Recarregar</button>
      </div>
    );
  }
}

const PERFIS: Perfil[] = ['motorista', 'pais', 'aluno', 'escola'];
const NOMES: Record<Perfil, string> = { motorista: 'Motorista', pais: 'Família', aluno: 'Aluno', escola: 'Escola' };

function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <div className="carregando"><div className="giro" /><span className="muted">{texto}</span></div>;
}

/**
 * Selo de conexão: sem internet, mostra que as ações ficaram guardadas no aparelho;
 * quando volta, mostra o envio. Nada se perde.
 */
function StatusConexao({ online }: { online: boolean }) {
  const f = useFila();
  if (f.pendentes > 0 && (f.semInternet || !online)) return <div className="offline"><I n="semWifi" tam={15} />Sem internet · {f.pendentes} {f.pendentes === 1 ? 'ação guardada' : 'ações guardadas'} no aparelho</div>;
  if (f.pendentes > 0 && f.enviando) return <div className="offline enviando"><I n="carregando" tam={15} className="girando" />Enviando {f.pendentes}…</div>;
  if (!online) return <div className="offline"><I n="semWifi" tam={15} />Sem conexão · tudo que você fizer fica guardado</div>;
  return null;
}

/** Logado: sincroniza com o servidor, fica ouvindo o tempo real e mostra a área do perfil. */
function Conectado({ perfil, aba, extra }: { perfil: Perfil; aba?: string; extra?: string }) {
  const { online, pronto, erro } = useConexao(perfil);
  const eu = useEu();
  if (!pronto && !eu) return <Carregando texto="Buscando seus dados…" />;
  if (!eu) {
    return (
      <div className="vazio" style={{ maxWidth: 420, margin: '20vh auto' }}>
        <span className="ic"><I n="semWifi" /></span><strong>Não deu para falar com o servidor</strong>
        <p className="small" style={{ margin: '8px 0 14px' }}>{erro}</p>
        <button className="btn btn-primario" onClick={() => location.reload()}>Tentar de novo</button>
      </div>
    );
  }
  const tela = perfil === 'motorista' ? <Motorista aba={aba} extra={extra} />
    : perfil === 'pais' ? <Pais aba={aba} />
    : perfil === 'aluno' ? <Aluno aba={aba} />
    : <Escola aba={aba} />;
  return (
    <>
      <StatusConexao online={online} />
      <Protecao key={`${perfil}/${aba}`}>{tela}</Protecao>
    </>
  );
}

/** Roteia pelo hash: #/motorista, #/pais, #/aluno, #/escola (+ /aba). Sem perfil → landing page. */
export default function App() {
  const [p, aba, extra] = useHash();
  const perfil = PERFIS.find((x) => x === p);
  const inicial = useRef(perfil);
  useEffect(() => {
    if (p === 'fiscal') { document.title = 'VanAaki · Fiscalização'; return; }
    if (!perfil) { window.location.replace('./index.html'); return; }
    // cada perfil usa o próprio banco local: trocou de perfil na mesma aba → recarrega
    if (inicial.current !== perfil) location.reload();
    document.title = `VanAaki · ${NOMES[perfil]}`;
  }, [perfil]);
  // link de fiscalização (PL 1240/2026): página pública, sem login
  if (p === 'fiscal' && aba) return <Fiscal token={aba} />;
  if (!perfil) return <Carregando />;
  // link "#/motorista/demo" (botão do site): entra direto na demonstração
  if (!lerSessao(perfil)) return <Entrar perfil={perfil} autoDemo={aba === 'demo'} />;
  return <Conectado perfil={perfil} aba={aba} extra={extra} />;
}
