import { Component, useEffect, type ReactNode } from 'react';
import { useHash } from './components/ui';
import Aluno from './screens/Aluno';
import Escola from './screens/Escola';
import Motorista from './screens/motorista/Motorista';
import Pais from './screens/Pais';

/** Se uma tela quebrar, mostra o aviso em vez de página em branco (os dados continuam salvos). */
class Protecao extends Component<{ children: ReactNode }, { erro?: Error }> {
  state: { erro?: Error } = {};
  static getDerivedStateFromError(erro: Error) { return { erro }; }
  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="vazio" style={{ maxWidth: 460, margin: '20vh auto' }}>
        <span className="ic">😵</span>
        <strong>Algo deu errado nesta tela.</strong>
        <p className="small" style={{ margin: '8px 0 14px' }}>{this.state.erro.message}</p>
        <button className="btn btn-primario" onClick={() => location.reload()}>Recarregar (os dados continuam salvos)</button>
      </div>
    );
  }
}

/** Roteia pelo hash: #/motorista, #/pais, #/aluno, #/escola (+ /aba). Sem perfil → landing page. */
export default function App() {
  const [perfil, aba, extra] = useHash();
  useEffect(() => {
    if (!perfil) window.location.replace('./index.html');
    const nomes: Record<string, string> = { motorista: 'Motorista', pais: 'Pais', aluno: 'Aluno', escola: 'Escola' };
    document.title = `VanAaki · ${nomes[perfil] ?? ''}`;
  }, [perfil]);
  const tela = perfil === 'motorista' ? <Motorista aba={aba} extra={extra} />
    : perfil === 'pais' ? <Pais aba={aba} />
    : perfil === 'aluno' ? <Aluno aba={aba} />
    : perfil === 'escola' ? <Escola aba={aba} />
    : <div className="vazio">Abrindo…</div>;
  return <Protecao key={`${perfil}/${aba}`}>{tela}</Protecao>;
}
