import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { calcularRanking, Feed, NivelCard, Selos, usePontosAluno, usePontosVan } from '../components/gamificacao';
import { ShellFone, type ItemMenu } from '../components/Shell';
import { Avatar, ir, useNotificacoes, Vazio } from '../components/ui';
import { I } from '../components/Icone';
import { db } from '../db/db';
import type { Pagamento } from '../db/types';
import { saldoDe, sequencia, tipoEvento } from '../lib/gamificacao';
import { nomeMes, primeiroNome, reais } from '../lib/util';
import { atrasado, vincularFilho } from '../services/acoes';
import { useEu } from '../api/sync';
import { CuidadosCard } from '../components/cuidados';
import { PainelTeste } from '../components/ui';
import { Chat } from './motorista/Gestao';
import { EscolhaPlano } from '../components/presenca';
import { NOME_TURNO } from '../lib/turnos';
import { AgendaFamilia, MudarDia, PagarPix, Recibo } from './familiaAgenda';
import type { Plano } from '../lib/turnos';
import { hoje } from '../lib/util';
import { LinhaTempo, MapaFamilia, SeletorAluno, textoStatus, useAlunoPerfil, useFamilia } from './familia';

export default function Pais({ aba = 'inicio' }: { aba?: string }) {
  const [alunoId, setAlunoId] = useAlunoPerfil();
  const f = useFamilia(alunoId);
  const msgs = useLiveQuery(() => db.mensagens.where('alunoId').equals(alunoId).filter((m) => m.de === 'motorista' && !m.lida).count(), [alunoId]) ?? 0;
  const pend = useLiveQuery(() => db.pagamentos.where('alunoId').equals(alunoId).filter((p) => p.status === 'pendente' && !p.informadoEm).count(), [alunoId]) ?? 0;
  const eu = useEu();
  if (eu && !eu.alunoIds.length) return <SemFilho />;
  if (f.carregando || !f.aluno || !f.visao) return <div className="carregando"><div className="giro" /></div>;
  const menu: ItemMenu[] = [
    { id: 'inicio', ic: 'casa', nome: 'Início' },
    { id: 'agenda', ic: 'calendario', nome: 'Agenda' },
    { id: 'rastreio', ic: 'pin', nome: 'Rastreio', badge: f.visao.mostrarMapa ? 1 : 0 },
    { id: 'pagamentos', ic: 'financeiro', nome: 'Pagar', badge: pend },
    { id: 'chat', ic: 'mensagem', nome: 'Tio', badge: msgs },
  ];
  const topo = (
    <div className="linha" style={{ flex: 1, flexWrap: 'nowrap', minWidth: 0 }}>
      <Avatar aluno={f.aluno} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <small>Família {eu?.usuario.nome.split(' ').slice(-1)[0]}</small>
        <SeletorAluno id={alunoId} onChange={setAlunoId} perfis={f.perfis} />
      </div>
    </div>
  );
  return (
    <ShellFone base="pais" menu={menu} atual={aba} topo={topo} filtro={{ para: 'pais', alunoId }}>
      {aba === 'inicio' && <Inicio f={f} />}
      {aba === 'rastreio' && <Rastreio f={f} />}
      {aba === 'pagamentos' && <Pagamentos f={f} />}
      {aba === 'agenda' && <><AgendaFamilia aluno={f.aluno} escola={f.escola} /><AcessoAluno f={f} /></>}
      {aba === 'conduta' && <CondutaPais f={f} />}
      {aba === 'chat' && <div className="m-card"><Chat alunoId={alunoId} eu="pais" titulo={`Conversa com ${f.van?.motorista}`} /></div>}
    </ShellFone>
  );
}

type F = ReturnType<typeof useFamilia>;

function StatusCard({ f, compacto }: { f: F; compacto?: boolean }) {
  const v = f.visao!, a = f.aluno!;
  const s = textoStatus(v, a, f.viagem, f.escola?.nome ?? 'escola', f.plano);
  const destaque = ['proximo', 'na_porta', 'a_bordo_final', 'volta_indo_escola', 'volta_na_escola'].includes(v.fase);
  return (
    <div className={`status-card ${destaque ? 'destaque' : ['aguardando', 'a_bordo', 'volta_outra_escola'].includes(v.fase) ? 'escuro' : ''}`}>
      <div className="entre"><span className="st-ic"><I n={s.ic} /></span>{f.viagem?.status === 'em_andamento' && <span className="tag tag-verde ao-vivo"><span className="ponto" /> Ao vivo</span>}</div>
      <div className="st-titulo">{s.titulo}</div>
      <div className={`st-sub ${destaque ? '' : 'muted'}`}>{s.sub}</div>
      {s.chegada && <div className="eta-num">{s.chegada}<small> {s.rotuloChegada}</small></div>}
      {!compacto && v.mostrarMapa && <button className={`btn ${destaque ? 'btn-escuro' : 'btn-primario'} btn-sm`} style={{ marginTop: 14 }} onClick={() => ir('pais/rastreio')}><I n="mapa" />{v.aBordo ? 'Acompanhar o trajeto' : 'Ver a van no mapa'}</button>}
    </div>
  );
}

function Inicio({ f }: { f: F }) {
  const a = f.aluno!;
  const notifs = useNotificacoes({ para: 'pais', alunoId: a.id });
  const ev = usePontosAluno(a.id);
  const pags = useLiveQuery(() => db.pagamentos.where('alunoId').equals(a.id).toArray(), [a.id]) ?? [];
  const [escolha, setEscolha] = useState<Plano | null>(null);
  const nome = primeiroNome(a.nome);
  const hj = hoje();
  // o que aconteceu hoje (os avisos que a família recebeu) — a prova de que o app está trabalhando
  const deHoje = notifs.filter((n) => n.criadoEm.slice(0, 10) === hj || new Date(n.criadoEm).toDateString() === new Date().toDateString())
    .sort((x, y) => x.criadoEm.localeCompare(y.criadoEm));
  // o mês com a van
  const mes = hj.slice(0, 7);
  const doMes = ev.filter((e) => e.data.startsWith(mes));
  const diasVan = new Set(doMes.filter((e) => e.tipo === 'embarque' || e.tipo === 'pronto_portao').map((e) => e.data)).size;
  const noPortao = doMes.filter((e) => e.tipo === 'pronto_portao').length;
  const avisosMes = notifs.filter((n) => n.criadoEm.slice(0, 7) === mes).length;
  const pendente = pags.find((p) => p.status === 'pendente' && !p.informadoEm);
  const emDia = !pendente;
  const credenciada = f.van && f.escola && f.van.credenciamento?.[f.escola.id] === 'credenciada';
  return (
    <>
      <StatusCard f={f} />

      <div className="acoes-rapidas">
        <button type="button" className="acao-rapida" onClick={() => setEscolha('nao_vai')}><span><I n="calendario" /></span>Não vai hoje</button>
        <button type="button" className="acao-rapida" onClick={() => ir('pais/chat')}><span><I n="mensagem" /></span>Falar com o tio</button>
        <button type="button" className={`acao-rapida ${pendente ? 'destaque' : ''}`} onClick={() => ir('pais/pagamentos')}><span><I n="financeiro" /></span>{pendente ? 'Pagar' : 'Pago'}</button>
        <button type="button" className="acao-rapida" onClick={() => ir('pais/rastreio')}><span><I n="mapa" /></span>Mapa</button>
      </div>

      <div className="m-card">
        <h4>Hoje com {nome} <span className="tag"><I n={a.turno} />{NOME_TURNO[a.turno]}</span></h4>
        {deHoje.length ? (
          <ul className="hoje-lista">
            {deHoje.slice(-6).map((n, k, l) => (
              <li key={n.id} className={k === l.length - 1 && f.viagem?.status === 'em_andamento' ? 'agora' : ''}>
                <time>{new Date(n.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time><i />
                <div><strong>{n.titulo}</strong><small>{n.texto}</small></div>
              </li>
            ))}
          </ul>
        ) : <p className="muted small">Quando o tio sair, cada passo aparece aqui: saiu, está chegando, embarcou, chegou na escola.</p>}
      </div>

      <div className="m-card">
        <h4>Van hoje para {nome}</h4>
        {/* um toque abre a confirmação: um toque errado não avisa o tio por engano */}
        <EscolhaPlano valor={f.plano} onChange={(p) => p !== f.plano && setEscolha(p)} />
        <p className="muted small" style={{ marginTop: 8 }}>{f.plano !== 'ambos' ? `Combinado com o tio${f.presenca?.motivo ? ` · ${f.presenca.motivo}` : ''}. A rota já foi ajustada.` : 'Mudou algo? Avise antes da rota: o tio se organiza e ninguém espera à toa.'}</p>
      </div>

      <div className="m-card">
        <h4>Este mês com a van</h4>
        <div className="valor-grade">
          <div className="valor-item"><b>{diasVan}</b><span>dia{diasVan === 1 ? '' : 's'} de van, com cada embarque avisado</span></div>
          <div className="valor-item"><b>{avisosMes}</b><span>aviso{avisosMes === 1 ? '' : 's'} no seu celular, sem precisar perguntar</span></div>
          <div className="valor-item"><b>{noPortao}</b><span>vez{noPortao === 1 ? '' : 'es'} no portão antes da van chegar</span></div>
          <div className={`valor-item ${emDia ? 'verde' : ''}`}><b>{emDia ? 'Em dia' : reais(pendente!.valor)}</b><span>{emDia ? 'mensalidade paga' : `mensalidade vence ${pendente!.vencimento.split('-').reverse().slice(0, 2).join('/')}`}</span></div>
        </div>
      </div>

      <div className="m-card">
        <h4>Quem leva {nome}</h4>
        <div className="motorista-box">
          <Avatar nome={f.van?.motorista ?? ''} cor="#6C5CE7" />
          <div><strong>{f.van?.motorista}</strong><br /><span className="muted small">{f.van?.modelo} · <span className="placa">{f.van?.placa}</span></span></div>
          <div className="acoes"><button className="icone-btn" onClick={() => ir('pais/chat')} aria-label="Mensagem"><I n="mensagem" /></button><a className="icone-btn verde" href={`tel:${f.van?.telefone}`} aria-label="Ligar"><I n="telefone" /></a></div>
        </div>
        <div className="confianca">
          {credenciada && <span><I n="selo" />Credenciado pelo {f.escola!.nome}</span>}
          <span><I n="escudo" />Ninguém vê a sua casa: o mapa abre só na sua vez e com {nome} a bordo</span>
          <span><I n="historico" />Cada trajeto fica registrado com data e hora</span>
        </div>
      </div>

      <CuidadosCard a={a} />

      {!f.van?.config?.semGamificacao && (
        <button type="button" className="m-card mais-item" style={{ padding: 14 }} onClick={() => ir('pais/conduta')}>
          <span className="mi-ic"><I n="estrela" /></span>
          <span className="mi-txt">Conduta de {nome}<small>Pontos, elogios e ocorrências do tio</small></span>
          <I n="chevron" />
        </button>
      )}
      {escolha && <MudarDia aluno={a} dia={hoje()} atual={escolha} motivoAtual={f.presenca?.motivo ?? ''} nome={nome} onFechar={() => setEscolha(null)} />}
    </>
  );
}

function Rastreio({ f }: { f: F }) {
  const v = f.visao!, a = f.aluno!;
  return (
    <>
      <StatusCard f={f} compacto />
      {v.mostrarMapa && f.viagem
        ? <div className="m-card" style={{ padding: 8 }}>
            {v.aBordo && <div className="alerta-otim" style={{ marginBottom: 8 }}><I n="van" />{primeiroNome(a.nome)} está a bordo: você acompanha o trajeto até {v.alvoTipo === 'escola' ? 'a escola' : 'em casa'}.</div>}
            <MapaFamilia v={v} aluno={a} escola={f.escola} viagem={f.viagem} altura="48vh" />
          </div>
        : (['aguardando', 'a_bordo', 'volta_outra_escola'].includes(v.fase) || (v.fase === 'sem_viagem' && f.plano === 'ambos')) && (
          <div className="m-card vazio" style={{ padding: 26 }}>
            <span className="ic"><I n="escudo" /></span>
            <strong style={{ fontSize: 16 }}>O mapa aparece quando for a sua vez</strong>
            <p className="muted small">Para a segurança de todas as crianças, a van aparece quando o próximo destino for a sua casa ou a escola de {primeiroNome(a.nome)}, e durante todo o tempo em que {primeiroNome(a.nome)} estiver a bordo.{v.paradasAntes > 0 ? ` Agora faltam ${v.paradasAntes} parada(s) antes.` : ''}</p>
          </div>
        )}
      <div className="m-card"><h4>Hoje</h4>{f.viagem ? <LinhaTempo viagem={f.viagem} aluno={a} escola={f.escola} v={v} /> : <Vazio ic="van">A van ainda não saiu hoje</Vazio>}</div>
    </>
  );
}

function Pagamentos({ f }: { f: F }) {
  const alunoId = f.aluno!.id;
  const pags = useLiveQuery(() => db.pagamentos.where('alunoId').equals(alunoId).toArray(), [alunoId]) ?? [];
  const [pix, setPix] = useState<Pagamento | null>(null);
  const [recibo, setRecibo] = useState<Pagamento | null>(null);
  const lista = [...pags].sort((a, b) => b.mes.localeCompare(a.mes));
  const aberto = lista.filter((p) => p.status === 'pendente' && !p.informadoEm);
  return (
    <>
      <div className={`status-card ${aberto.length ? 'destaque' : ''}`}>
        <span className="muted small" style={{ fontWeight: 600 }}>{aberto.length ? 'Em aberto' : 'Tudo em dia'}</span>
        <div className="big" style={{ marginTop: 4 }}>{reais(aberto.reduce((s, p) => s + p.valor, 0))}</div>
        {aberto.some(atrasado) && <span className="tag tag-vermelho" style={{ marginTop: 6 }}>Mensalidade atrasada</span>}
      </div>
      <div className="m-card">
        <h4>Mensalidades</h4>
        {lista.map((p) => (
          <div key={p.id} className="linha-item">
            <div><strong>{nomeMes(p.mes)} {p.mes.slice(0, 4)}</strong><span className="muted small">{p.status === 'pago' ? `Pago em ${p.pagoEm?.slice(0, 10).split('-').reverse().join('/')} · ${p.metodo}` : `Vence ${p.vencimento.split('-').reverse().join('/')} · ${reais(p.valor)}`}</span></div>
            {p.status === 'pago' ? <button className="btn btn-claro btn-sm" onClick={() => setRecibo(p)}><I n="check" />Recibo</button>
              : p.informadoEm ? <span className="tag tag-amarelo"><I n="relogio" />Tio vai confirmar</span>
              : <button className="btn btn-primario btn-sm" onClick={() => setPix(p)}>Pagar com Pix</button>}
          </div>
        ))}
      </div>
      {pix && <PagarPix p={pix} aluno={f.aluno!} van={f.van} onFechar={() => setPix(null)} />}
      {recibo && <Recibo p={recibo} aluno={f.aluno!} van={f.van} onFechar={() => setRecibo(null)} />}
    </>
  );
}

function CondutaPais({ f }: { f: F }) {
  const a = f.aluno!;
  const ev = usePontosAluno(a.id);
  const evVan = usePontosVan(a.vanId);
  const resgates = useLiveQuery(() => db.resgates.where('alunoId').equals(a.id).toArray(), [a.id]) ?? [];
  const alunosVan = useLiveQuery(() => db.alunos.where('vanId').equals(a.vanId).toArray(), [a.vanId]) ?? [];
  const pos = calcularRanking(alunosVan, evVan, 'semana').find((l) => l.aluno.id === a.id);
  const ocorr = ev.filter((e) => tipoEvento(e.tipo)?.grupo === 'ocorrencia');
  const elogios = ev.filter((e) => tipoEvento(e.tipo)?.grupo === 'elogio');
  return (
    <>
      <NivelCard ev={ev} saldo={saldoDe(ev, resgates)} sequencia={sequencia(ev)} />
      <div className="selos" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="selo ok"><span>🏆</span>{pos ? `${pos.pos}º de ${alunosVan.filter((x) => x.ativo).length}` : '—'}<small>na semana</small></div>
        <div className="selo ok"><span>👍</span>{elogios.length}<small>elogios</small></div>
        <div className={`selo ${ocorr.length ? '' : 'ok'}`} style={ocorr.length ? { background: 'var(--vermelho-claro)', color: '#B4252A' } : undefined}><span>⚠️</span>{ocorr.length}<small>ocorrências</small></div>
      </div>
      {ocorr.length > 0 && (
        <div className="m-card" style={{ borderColor: 'var(--vermelho-suave)' }}>
          <h4 className="vermelho">Ocorrências registradas pelo tio</h4>
          <Feed ev={ocorr} limite={5} />
          <button className="btn btn-claro btn-sm" style={{ marginTop: 8 }} onClick={() => ir('pais/chat')}><I n="mensagem" />Conversar com o tio</button>
        </div>
      )}
      <div className="m-card"><h4>Conquistas de {primeiroNome(a.nome)}</h4><Selos ev={ev} /></div>
      <div className="m-card"><h4>Histórico de pontos</h4><Feed ev={ev} limite={15} /></div>
    </>
  );
}

/** Código para o filho entrar no app dele + adicionar outro filho com o convite do tio. */
function AcessoAluno({ f }: { f: F }) {
  const a = f.aluno!;
  const [codigo, setCodigo] = useState('');
  const [msg, setMsg] = useState('');
  const [aberto, setAberto] = useState(false);
  const app = `${location.origin}${location.pathname}#/aluno/convite/${a.codigoAluno}`;
  return (
    <div className="m-card">
      <h4>App do {primeiroNome(a.nome)}</h4>
      <p className="muted small">No celular dele, abra o app em <b>Aluno</b> e digite o código:</p>
      <div className="codigo-grande">{a.codigoAluno ?? '—'}</div>
      <div className="linha" style={{ marginTop: 10 }}>
        <button className="btn btn-claro btn-sm" onClick={() => void navigator.clipboard?.writeText(`${app}
Código: ${a.codigoAluno}`)}>Copiar link e código</button>
        <button className="btn btn-claro btn-sm" onClick={() => setAberto(!aberto)}><I n="mais" />Outro filho</button>
      </div>
      {aberto && (
        <form className="linha" style={{ marginTop: 10 }} onSubmit={async (e) => {
          e.preventDefault(); setMsg('');
          try { await vincularFilho(codigo); setMsg('Pronto! Recarregando…'); setTimeout(() => location.reload(), 600); } catch (er) { setMsg((er as Error).message); }
        }}>
          <input className="inp inp-codigo" style={{ flex: 1 }} placeholder="Código de convite" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          <button className="btn btn-primario btn-sm">Adicionar</button>
        </form>
      )}
      {msg && <small className="muted">{msg}</small>}
    </div>
  );
}

/** Conta sem filho ligado (ex.: o tio arquivou): pede o código de convite. */
function SemFilho() {
  const [codigo, setCodigo] = useState('');
  const [msg, setMsg] = useState('');
  return (
    <div className="entrar">
      <div className="entrar-card">
        <div className="entrar-topo"><span className="entrar-ic"><I n="casa" /></span><div><h1>Adicione seu filho</h1><p className="muted">Digite o código de convite que o tio da van mandou.</p></div></div>
        <form className="form" onSubmit={async (e) => { e.preventDefault(); try { await vincularFilho(codigo); location.reload(); } catch (er) { setMsg((er as Error).message); } }}>
          <input className="inp inp-codigo" required value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="EX: AB12CD" />
          {msg && <div className="aviso-erro">{msg}</div>}
          <button className="btn btn-primario btn-bloco">Adicionar</button>
        </form>
      </div>
      <PainelTeste />
    </div>
  );
}
