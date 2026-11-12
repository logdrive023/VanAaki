import { useState, type FormEvent, type ReactNode } from 'react';
import { api, salvarSessao, type Sessao } from '../api/cliente';
import type { Perfil } from '../db/types';

const INFO: Record<Perfil, { ic: string; nome: string; frase: string; codigo?: string; dicaCodigo?: string }> = {
  motorista: { ic: '🧑‍✈️', nome: 'Motorista', frase: 'Alunos, rota do dia, mensalidades e conduta num lugar só.' },
  pais: { ic: '👨‍👩‍👧', nome: 'Família', frase: 'Saiba quando seu filho é o próximo, embarcou e chegou.', codigo: 'Código de convite', dicaCodigo: 'O tio da van manda esse código pelo WhatsApp.' },
  aluno: { ic: '🎒', nome: 'Aluno', frase: 'Seus pontos, missões e prêmios da van.', codigo: 'Código do aluno', dicaCodigo: 'Seus pais encontram esse código no app deles.' },
  escola: { ic: '🏫', nome: 'Escola', frase: 'As vans chegando na portaria, por turno.', codigo: 'Código da escola', dicaCodigo: 'O código aparece para o tio da van em "Turnos e escolas".' },
};

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return <label className="fld"><span>{rotulo}</span>{children}</label>;
}

export default function Entrar({ perfil }: { perfil: Perfil }) {
  const info = INFO[perfil];
  const [modo, setModo] = useState<'entrar' | 'criar'>(perfil === 'aluno' ? 'criar' : 'entrar');
  const [f, setF] = useState<Record<string, string>>({});
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const concluir = (s: Sessao) => {
    if (s.usuario.perfil !== perfil) { setErro(`Essa conta é de ${INFO[s.usuario.perfil].nome.toLowerCase()}. Entre pela área certa.`); return; }
    salvarSessao(s);
    location.reload();
  };
  const chamar = async (caminho: string, corpo: unknown) => {
    setErro(''); setEnviando(true);
    try { concluir(await api<Sessao>(caminho, { metodo: 'POST', corpo, semToken: true })); } catch (e) { setErro((e as Error).message); }
    setEnviando(false);
  };
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (modo === 'entrar') return void chamar('/auth/entrar', { email: f.email, senha: f.senha });
    if (perfil === 'aluno') return void chamar('/auth/aluno', { codigo: f.codigo });
    if (perfil === 'motorista') return void chamar('/auth/cadastro/motorista', { nome: f.nome, telefone: f.telefone, email: f.email, senha: f.senha, nomeVan: f.nomeVan, placa: f.placa, modelo: f.modelo });
    return void chamar(`/auth/cadastro/${perfil === 'pais' ? 'familia' : 'escola'}`, { codigo: f.codigo, nome: f.nome, telefone: f.telefone, email: f.email, senha: f.senha });
  };

  return (
    <div className="entrar">
      <a href="./index.html" className="logo"><div className="logo-icone">🚐</div><span>Van<b>Aaki</b></span></a>
      <div className="entrar-card">
        <div className="entrar-topo">
          <span className="entrar-ic">{info.ic}</span>
          <div><h1>{info.nome}</h1><p className="muted">{info.frase}</p></div>
        </div>

        {perfil !== 'aluno' && (
          <div className="seg">
            <button type="button" className={modo === 'entrar' ? 'ativo' : ''} onClick={() => setModo('entrar')}>Entrar</button>
            <button type="button" className={modo === 'criar' ? 'ativo' : ''} onClick={() => setModo('criar')}>{perfil === 'motorista' ? 'Criar conta' : 'Primeiro acesso'}</button>
          </div>
        )}

        <form className="form" onSubmit={enviar}>
          {modo === 'criar' && info.codigo && (
            <Campo rotulo={info.codigo}>
              <input className="inp-codigo" required autoFocus value={f.codigo ?? ''} onChange={set('codigo')} placeholder="EX: AB12CD" maxLength={8} autoCapitalize="characters" />
              <small className="muted">{info.dicaCodigo}</small>
            </Campo>
          )}
          {modo === 'criar' && perfil !== 'aluno' && (
            <>
              <Campo rotulo={perfil === 'escola' ? 'Seu nome (portaria/coordenação)' : 'Seu nome'}><input required value={f.nome ?? ''} onChange={set('nome')} autoComplete="name" /></Campo>
              <Campo rotulo="WhatsApp"><input value={f.telefone ?? ''} onChange={set('telefone')} inputMode="tel" autoComplete="tel" placeholder="11 90000-0000" /></Campo>
            </>
          )}
          {perfil !== 'aluno' && (
            <>
              <Campo rotulo="E-mail"><input required type="email" value={f.email ?? ''} onChange={set('email')} autoComplete="email" /></Campo>
              <Campo rotulo="Senha"><input required type="password" minLength={6} value={f.senha ?? ''} onChange={set('senha')} autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} /></Campo>
            </>
          )}
          {modo === 'criar' && perfil === 'motorista' && (
            <div className="dupla">
              <Campo rotulo="Placa da van"><input value={f.placa ?? ''} onChange={set('placa')} placeholder="ABC-1D23" /></Campo>
              <Campo rotulo="Modelo"><input value={f.modelo ?? ''} onChange={set('modelo')} placeholder="Sprinter branca" /></Campo>
            </div>
          )}
          {erro && <div className="aviso-erro">{erro}</div>}
          <button className="btn btn-primario btn-bloco" disabled={enviando}>
            {enviando ? 'Um instante…' : modo === 'entrar' ? 'Entrar' : perfil === 'aluno' ? 'Entrar no app' : 'Criar conta'}
          </button>
        </form>

        <div className="entrar-demo">
          <span className="muted small">Só quer conhecer?</span>
          <button type="button" className="btn btn-claro btn-bloco" disabled={enviando} onClick={() => void chamar('/auth/demo', { perfil })}>Entrar na demonstração</button>
        </div>
      </div>
      <a className="muted small" href="./index.html">← Voltar para o site</a>
    </div>
  );
}
