import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { BotaoAcessibilidade } from '../components/Acessibilidade';
import { api, API_URL, salvarSessao, SEM_API, type ErroApi, type Sessao } from '../api/cliente';
import { sessaoDemoLocal } from '../api/demoLocal';
import { CenaLogin, Segmento, Transicao } from '../components/Transicao';
import { I, Marca, type NomeIcone } from '../components/Icone';
import type { Perfil } from '../db/types';

const INFO: Record<Perfil, {
  ic: NomeIcone; nome: string; titulo: string; frase: string; pontos: { ic: NomeIcone; t: string }[];
  criar: string; codigo?: string; dicaCodigo?: string;
}> = {
  motorista: {
    ic: 'van', nome: 'Motorista', titulo: 'Sua van organizada. Você só dirige.', frase: 'Alunos, rota do dia, mensalidades e os trajetos guardados, num app só.',
    pontos: [{ ic: 'navegar', t: 'O GPS confirma o embarque sozinho' }, { ic: 'calendario', t: 'Agenda: quem vai e quem não vai' }, { ic: 'dinheiro', t: 'Mensalidade direto no seu Pix' }],
    criar: 'Criar conta',
  },
  pais: {
    ic: 'casa', nome: 'Família', titulo: 'Saiba quando seu filho é o próximo.', frase: 'Acompanhe a van na sua vez, receba os avisos e pague a mensalidade pelo Pix.',
    pontos: [{ ic: 'sino', t: 'Aviso antes da van chegar' }, { ic: 'escudo', t: 'Ninguém vê a casa das outras crianças' }, { ic: 'calendario', t: 'Avise com antecedência se ele não vai' }],
    criar: 'Primeiro acesso', codigo: 'Código de convite', dicaCodigo: 'O tio da van manda esse código pelo WhatsApp.',
  },
  aluno: {
    ic: 'aluno', nome: 'Aluno', titulo: 'A van, a sua agenda e os seus pontos.', frase: 'Avise que está no portão e veja quando a van chega.',
    pontos: [{ ic: 'mao', t: '"Tô no portão" com um toque' }, { ic: 'calendario', t: 'Sua semana na van' }, { ic: 'trofeu', t: 'Missões e prêmios' }],
    criar: 'Entrar', codigo: 'Código do aluno', dicaCodigo: 'Seus pais encontram esse código no app deles.',
  },
  escola: {
    ic: 'escola', nome: 'Escola', titulo: 'As vans chegando na portaria.', frase: 'Previsão de chegada por turno, credenciamento das vans e ocorrências.',
    pontos: [{ ic: 'portaria', t: 'Chegadas e atrasos ao vivo' }, { ic: 'selo', t: 'Credenciamento das vans' }, { ic: 'lista', t: 'Ocorrências registradas pelo tio' }],
    criar: 'Primeiro acesso', codigo: 'Código da escola', dicaCodigo: 'O tio da van vê esse código em "Turnos e escolas".',
  },
};
const PERFIS: Perfil[] = ['motorista', 'pais', 'aluno', 'escola'];

/** O que a cena animada diz em cada caso (entre "Entrar" e "Primeiro acesso"). */
const CENA: Record<'entrar' | Perfil, { titulo: string; texto: string }> = {
  entrar: { titulo: 'Que bom te ver de novo', texto: 'Entre com o e-mail e a senha de sempre.' },
  motorista: { titulo: 'Bem-vindo, tio!', texto: 'Três passos e a sua van já está no app.' },
  pais: { titulo: 'Primeira vez por aqui?', texto: 'Use o código que o tio da van mandou no WhatsApp.' },
  escola: { titulo: 'Bem-vinda, escola!', texto: 'Use o código que veio com o convite da van.' },
  aluno: { titulo: 'Oi!', texto: 'Digite o código que seus pais receberam.' },
};


type Servidor = 'verificando' | 'online' | 'acordando' | 'fora';

/** Confere se o servidor responde (o plano grátis "dorme" e leva até ~1 min para acordar). */
function useServidor() {
  const [estado, setEstado] = useState<Servidor>(SEM_API ? 'fora' : 'verificando');
  useEffect(() => {
    if (SEM_API) return;
    let vivo = true;
    let nova: ReturnType<typeof setTimeout> | undefined;
    const lento = setTimeout(() => { if (vivo) setEstado((e) => (e === 'verificando' ? 'acordando' : e)); }, 2500);
    const tentar = async (n: number): Promise<void> => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 30000);
      try {
        const r = await fetch(`${API_URL}/saude`, { signal: ctl.signal });
        if (vivo) setEstado(r.ok ? 'online' : 'fora');
      } catch {
        if (!vivo) return;
        if (n < 3) { setEstado('acordando'); return tentar(n + 1); }
        setEstado('fora');
        nova = setTimeout(() => void tentar(0), 10000); // continua tentando: libera sozinho quando o servidor volta
      } finally { clearTimeout(t); }
    };
    void tentar(0);
    return () => { vivo = false; clearTimeout(lento); clearTimeout(nova); };
  }, []);
  return estado;
}

function Campo({ rotulo, ic, dica, children }: { rotulo: string; ic?: NomeIcone; dica?: ReactNode; children: ReactNode }) {
  return (
    <label className="campo-login">
      <span className="cl-rot">{rotulo}</span>
      <span className={`cl-caixa ${ic ? 'com-ic' : ''}`}>{ic && <I n={ic} />}{children}</span>
      {dica && <small className="cl-dica">{dica}</small>}
    </label>
  );
}

export default function Entrar({ perfil, autoDemo, convite }: { perfil: Perfil; autoDemo?: boolean; convite?: string }) {
  const info = INFO[perfil];
  const servidor = useServidor();
  const [modo, setModo] = useState<'entrar' | 'criar'>(perfil === 'aluno' || convite ? 'criar' : 'entrar');
  const [f, setF] = useState<Record<string, string>>(convite ? { codigo: convite.toUpperCase().replace(/[^A-Z0-9]/g, '') } : {});
  const [verSenha, setVerSenha] = useState(false);
  const [etapa, setEtapa] = useState(0);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState<'' | 'form' | 'demo'>('');
  const [demorando, setDemorando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const set = (k: string) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const concluir = (s: Sessao) => {
    if (s.usuario.perfil !== perfil) { setErro(`Essa conta é de ${INFO[s.usuario.perfil].nome.toLowerCase()}. Entre pela área certa.`); return; }
    salvarSessao(s);
    location.reload();
  };
  const chamar = async (caminho: string, corpo: unknown, qual: 'form' | 'demo') => {
    setErro(''); setEnviando(qual); setDemorando(false);
    timer.current = setTimeout(() => setDemorando(true), 4000);
    try {
      // o servidor grátis pode estar acordando: espera até ~70 s antes de desistir
      concluir(await api<Sessao>(caminho, { metodo: 'POST', corpo, semToken: true, timeoutMs: 70000 }));
    } catch (e) {
      const m = (e as Error).message;
      setErro(SEM_API ? 'Contas reais abrem quando o servidor estiver no ar. Por enquanto, use a demonstração acima.' : m);
    }
    clearTimeout(timer.current);
    setEnviando(''); setDemorando(false);
  };
  /** Demonstração: com servidor, a do servidor (as abas conversam pelo tempo real); sem servidor ou com ele fora, a do navegador. */
  const entrarDemo = async () => {
    if (SEM_API) { setEnviando('demo'); try { concluir(await sessaoDemoLocal(perfil)); } catch (e) { setErro((e as Error).message); setEnviando(''); } return; }
    setErro(''); setEnviando('demo'); setDemorando(false);
    timer.current = setTimeout(() => setDemorando(true), 4000);
    try {
      concluir(await api<Sessao>('/auth/demo', { metodo: 'POST', corpo: { perfil }, semToken: true, timeoutMs: 15000 }));
    } catch (e) {
      const st = (e as ErroApi).status;
      if (st === 0 || st >= 500) { try { concluir(await sessaoDemoLocal(perfil)); } catch (e2) { setErro((e2 as Error).message); } }
      else setErro((e as Error).message);
    }
    clearTimeout(timer.current);
    setEnviando(''); setDemorando(false);
  };
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (assistente && etapa < 2) { setErro(''); setEtapa(etapa + 1); return; } // cadastro do tio em 3 passos
    if (modo === 'entrar') return void chamar('/auth/entrar', { email: f.email, senha: f.senha }, 'form');
    if (perfil === 'aluno') return void chamar('/auth/aluno', { codigo: f.codigo }, 'form');
    if (perfil === 'motorista') return void chamar('/auth/cadastro/motorista', { nome: f.nome, telefone: f.telefone, email: f.email, senha: f.senha, nomeVan: f.nomeVan, placa: f.placa, modelo: f.modelo }, 'form');
    return void chamar(`/auth/cadastro/${perfil === 'pais' ? 'familia' : 'escola'}`, { codigo: f.codigo, nome: f.nome, telefone: f.telefone, email: f.email, senha: f.senha }, 'form');
  };
  const ocupado = !!enviando;
  const assistente = perfil === 'motorista' && modo === 'criar';
  const jaFoi = useRef(false);
  useEffect(() => {
    if (!autoDemo || jaFoi.current) return;
    jaFoi.current = true;
    history.replaceState(null, '', `#/${perfil}`);
    void entrarDemo();
  }, [autoDemo]); // eslint-disable-line react-hooks/exhaustive-deps
  // aluno com o link do código: entra sozinho (criança pequena não precisa digitar nada)
  useEffect(() => {
    if (perfil !== 'aluno' || !convite || jaFoi.current || SEM_API) return;
    jaFoi.current = true;
    void chamar('/auth/aluno', { codigo: f.codigo }, 'form');
  }, [convite]); // eslint-disable-line react-hooks/exhaustive-deps
  const fora = SEM_API; // sem servidor configurado não há o que tentar; caído, o botão continua (pode voltar a qualquer momento)

  return (
    <div className="login">
      {/* lado da marca (no celular vira o topo) */}
      <aside className="login-marca">
        <div className="lm-topo">
          <a href="./index.html" className="lm-logo"><Marca tam={34} /><span>Van<b>Aaki</b></span></a>
          <span className="lm-acoes"><BotaoAcessibilidade rotulo /><a href="./index.html" className="lm-voltar"><I n="voltar" tam={16} /><span>Site</span></a></span>
        </div>
        <div className="lm-texto">
          <span className="faixa">{info.nome}</span>
          <h1>{info.titulo}</h1>
          <p>{info.frase}</p>
          <ul>{info.pontos.map((p) => <li key={p.t}><span><I n={p.ic} /></span>{p.t}</li>)}</ul>
        </div>
        <div className="lm-faixa" aria-hidden />
      </aside>

      <main className="login-corpo">
        <div className="login-caixa">
          <nav className="login-perfis" aria-label="Entrar como">
            {PERFIS.map((p) => (
              <a key={p} href={`./app.html#/${p}`} className={p === perfil ? 'ativo' : ''} aria-current={p === perfil ? 'page' : undefined}>
                <I n={INFO[p].ic} /><span>{INFO[p].nome}</span>
              </a>
            ))}
          </nav>

          <StatusServidor estado={servidor} />

          {convite && (
            <section className="login-convite">
              <span className="lc-ic"><I n="mensagem" /></span>
              <div><strong>{perfil === 'aluno' ? 'Oi! Entrando no seu app…' : 'Você foi convidado pelo tio da van'}</strong>
                <span>{perfil === 'aluno' ? 'Já já aparece quando a van vem te buscar.' : 'O código já está preenchido. Falta só o seu nome e uma senha para entrar das próximas vezes.'}</span></div>
            </section>
          )}

          {!convite && <section className="login-demo">
            <div className="ld-txt">
              <strong>Conhecer sem cadastro</strong>
              <span>Dados de exemplo, tudo funcionando. Abra os outros perfis em outra aba e veja ao vivo.</span>
            </div>
            <button type="button" className="btn btn-primario btn-bloco btn-grande" disabled={ocupado} onClick={() => void entrarDemo()}>
              {enviando === 'demo' ? <><I n="carregando" className="girando" />{demorando ? 'Acordando o servidor…' : 'Entrando…'}</> : <><I n="teste" />Entrar na demonstração</>}
            </button>
          </section>}

          {!convite && <div className="login-ou"><span>ou com a sua conta</span></div>}

          {perfil !== 'aluno' && !convite && (
            <>
              <Segmento rotulo="Entrar ou criar a conta" className="login-seg" valor={modo}
                opcoes={[{ valor: 'entrar', nome: 'Entrar' }, { valor: 'criar', nome: info.criar }]}
                onChange={(m) => { setModo(m); setErro(''); setEtapa(0); }} />
              <CenaLogin modo={modo} {...CENA[modo === 'entrar' ? 'entrar' : perfil]} />
            </>
          )}

          <form className="login-form" onSubmit={enviar}>
            {assistente && (
              <ol className="passos-assist" aria-label="Passos">
                {['Você', 'A van', 'Acesso'].map((t, k) => <li key={t} className={etapa > k ? 'feito' : etapa === k ? 'agora' : ''}><b>{etapa > k ? <I n="check" tam={13} /> : k + 1}</b>{t}</li>)}
              </ol>
            )}
            <Transicao chave={`${modo}-${etapa}`} ordem={etapa}>
            {assistente && <h2 className="pergunta">{['Como te chamam?', 'E a sua van?', 'Para entrar das próximas vezes'][etapa]}</h2>}

            {modo === 'criar' && info.codigo && (
              <Campo rotulo={info.codigo} dica={info.dicaCodigo}>
                <input className="inp-codigo" required value={f.codigo ?? ''} onChange={(e) => setF((x) => ({ ...x, codigo: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))} placeholder="AB12CD" maxLength={8} autoCapitalize="characters" autoComplete="one-time-code" />
              </Campo>
            )}
            {modo === 'criar' && perfil !== 'aluno' && (!assistente || etapa === 0) && (
              <div className={assistente ? 'pilha' : 'dupla'} style={assistente ? { gap: 14 } : undefined}>
                <Campo rotulo={perfil === 'escola' ? 'Seu nome (portaria)' : perfil === 'motorista' ? 'Seu nome (ex.: Tio Carlos)' : 'Seu nome'} ic="usuario"><input required value={f.nome ?? ''} onChange={set('nome')} autoComplete="name" autoFocus={assistente} /></Campo>
                <Campo rotulo="WhatsApp" ic="telefone" dica={assistente ? 'As famílias falam com você por aqui.' : undefined}><input value={f.telefone ?? ''} onChange={set('telefone')} inputMode="tel" autoComplete="tel" placeholder="11 90000-0000" /></Campo>
              </div>
            )}
            {assistente && etapa === 1 && (
              <div className="pilha" style={{ gap: 14 }}>
                <Campo rotulo="Placa" ic="van" dica="Aparece para as famílias e na fiscalização."><input value={f.placa ?? ''} onChange={set('placa')} placeholder="ABC-1D23" autoCapitalize="characters" autoFocus /></Campo>
                <Campo rotulo="Modelo e cor"><input value={f.modelo ?? ''} onChange={set('modelo')} placeholder="Sprinter branca" /></Campo>
              </div>
            )}
            {perfil !== 'aluno' && (!assistente || etapa === 2) && (
              <>
                <Campo rotulo="E-mail" ic="email"><input required type="email" value={f.email ?? ''} onChange={set('email')} autoComplete="email" placeholder="voce@email.com" autoFocus={assistente} /></Campo>
                <Campo rotulo="Senha" ic="cadeado" dica={modo === 'criar' ? 'Pelo menos 6 caracteres.' : undefined}>
                  <input required type={verSenha ? 'text' : 'password'} minLength={6} value={f.senha ?? ''} onChange={set('senha')} autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} />
                  <button type="button" className="cl-olho" onClick={() => setVerSenha(!verSenha)} aria-label={verSenha ? 'Esconder senha' : 'Mostrar senha'}>{verSenha ? 'Esconder' : 'Mostrar'}</button>
                </Campo>
              </>
            )}
            </Transicao>
            {erro && <div className="aviso-erro" role="alert">{erro}</div>}
            <div className="linha" style={{ flexWrap: 'nowrap' }}>
              {assistente && etapa > 0 && <button type="button" className="btn btn-claro btn-grande" onClick={() => setEtapa(etapa - 1)} aria-label="Voltar"><I n="voltar" /></button>}
              <button className="btn btn-escuro btn-bloco btn-grande" disabled={ocupado || fora}>
                {enviando === 'form' ? <><I n="carregando" className="girando" />{demorando ? 'Acordando o servidor…' : 'Um instante…'}</>
                  : assistente && etapa < 2 ? <>Continuar<I n="seguir" /></>
                  : modo === 'entrar' ? 'Entrar' : perfil === 'aluno' ? 'Entrar no app' : perfil === 'motorista' ? 'Criar minha conta' : 'Criar acesso'}
              </button>
            </div>
            {assistente && <small className="muted small" style={{ textAlign: 'center' }}>Grátis para testar com todos os seus alunos.</small>}
          </form>
        </div>
        <footer className="login-rodape">© 2026 VanAaki · <a href="./index.html">Site</a> · <a href="./app.html#/privacidade">Privacidade</a> · <a href="./app.html#/termos">Termos</a></footer>
      </main>
    </div>
  );
}

function StatusServidor({ estado }: { estado: Servidor }) {
  if (estado === 'online' || estado === 'verificando') return null;
  if (SEM_API) return <div className="login-status navegador"><I n="teste" /><span><b>Demonstração no seu navegador.</b> Tudo funciona com dados de exemplo, até sem internet. Criar conta de verdade abre quando o servidor estiver no ar.</span></div>;
  if (estado === 'acordando') {
    return <div className="login-status acordando"><I n="carregando" className="girando" /><span><b>Acordando o servidor.</b> No plano gratuito ele dorme quando ninguém usa; leva até 1 minuto. Pode tocar em entrar: o app espera.</span></div>;
  }
  return (
    <div className="login-status fora">
      <I n="semWifi" />
      <span><b>O servidor não respondeu.</b> Confira a internet e tente de novo em instantes. A demonstração continua funcionando.</span>
    </div>
  );
}
