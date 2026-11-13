import { useLiveQuery } from 'dexie-react-hooks';
import { calcularRanking, Feed, Missoes, Ranking, Selos, usePontosAluno, usePontosVan } from '../components/gamificacao';
import { ShellFone, type ItemMenu } from '../components/Shell';
import { Avatar, ir, Vazio } from '../components/ui';
import { I } from '../components/Icone';
import { db } from '../db/db';
import { missoesDe, nivelDe, saldoDe, sequencia, xpDe } from '../lib/gamificacao';
import { haQuanto, hoje } from '../lib/util';
import { resgatar } from '../services/pontos';
import { idxAluno, marcarPronto } from '../services/viagem';
import { AgendaFamilia } from './familiaAgenda';
import { MapaFamilia, SeletorAluno, textoStatus, useAlunoPerfil, useFamilia } from './familia';

export default function Aluno({ aba = 'inicio' }: { aba?: string }) {
  const [alunoId, setAlunoId] = useAlunoPerfil();
  const f = useFamilia(alunoId);
  if (f.carregando || !f.aluno || !f.visao) return <div className="carregando"><div className="giro" /></div>;
  const jogo = !f.van?.config?.semGamificacao;
  const menu: ItemMenu[] = [
    { id: 'inicio', ic: 'casa', nome: 'Início' },
    { id: 'agenda', ic: 'calendario', nome: 'Agenda' },
    ...(jogo ? [
      { id: 'missoes', ic: 'alvo', nome: 'Missões' },
      { id: 'ranking', ic: 'trofeu', nome: 'Ranking' },
      { id: 'loja', ic: 'premio', nome: 'Loja' },
    ] as ItemMenu[] : []),
  ];
  const topo = (
    <div className="linha" style={{ flex: 1, flexWrap: 'nowrap', minWidth: 0 }}>
      <Avatar aluno={f.aluno} />
      <div style={{ flex: 1, minWidth: 0 }}><small>Oi, {f.aluno.apelido}!</small><SeletorAluno id={alunoId} onChange={setAlunoId} perfis={f.perfis} /></div>
    </div>
  );
  return (
    <ShellFone base="aluno" classe="aluno" menu={menu} atual={aba} topo={topo} filtro={{ para: 'aluno', alunoId }}>
      {aba === 'inicio' && <Inicio f={f} jogo={jogo} />}
      {aba === 'agenda' && <AgendaFamilia aluno={f.aluno} escola={f.escola} podeMudar={false} />}
      {aba === 'missoes' && <MissoesAba alunoId={alunoId} />}
      {aba === 'ranking' && <RankingAba alunoId={alunoId} vanId={f.aluno.vanId} />}
      {aba === 'loja' && <Loja alunoId={alunoId} vanId={f.aluno.vanId} />}
    </ShellFone>
  );
}

type F = ReturnType<typeof useFamilia>;

function Inicio({ f, jogo }: { f: F; jogo: boolean }) {
  const a = f.aluno!, v = f.visao!;
  const ev = usePontosAluno(a.id);
  const evVan = usePontosVan(a.vanId);
  const resgates = useLiveQuery(() => db.resgates.where('alunoId').equals(a.id).toArray(), [a.id]) ?? [];
  const premios = useLiveQuery(() => db.recompensas.where('vanId').equals(a.vanId).filter((r) => r.ativo).toArray(), [a.vanId]) ?? [];
  const colegas = useLiveQuery(() => db.alunos.where('vanId').equals(a.vanId).toArray(), [a.vanId]) ?? [];
  const s = textoStatus(v, a, f.viagem, f.escola?.nome ?? 'escola', f.plano, true);
  const parada = f.viagem?.paradas[idxAluno(f.viagem, a.id)];
  const podePronto = f.viagem?.status === 'em_andamento' && f.viagem.tipo === 'ida' && parada?.status === 'pendente';
  const saldo = saldoDe(ev, resgates);
  return (
    <>
      <Estrada v={v} titulo={s.titulo} sub={s.sub} chegada={s.chegada} rotulo={s.rotuloChegada} viagemAtiva={f.viagem?.status === 'em_andamento'} />
      {podePronto && (
        <div className="checkin">
          {parada!.prontoEm ? (
            <><span className="entrar-ic" style={{ background: 'var(--verde-suave)', color: 'var(--verde)' }}><I n="check" /></span><strong style={{ fontSize: 'calc(17px * var(--esc, 1))', marginTop: 8 }}>O tio sabe que você está no portão!</strong>{jogo && <p className="muted small">Quando embarcar você ganha +10 pontos</p>}</>
          ) : (
            <>
              <strong style={{ fontSize: 'calc(16px * var(--esc, 1))' }}>Já está no portão com a mochila?</strong>
              <button className="btn-gigante" onClick={() => void marcarPronto(a.id)}><div><I n="mao" />Tô no portão!</div></button>
              <span className="muted small">{jogo ? 'Vale +10 pontos se for antes da van chegar' : 'Assim o tio já sabe que pode buscar'}</span>
            </>
          )}
        </div>
      )}
      {v.mostrarMapa && f.viagem && <div className="m-card" style={{ padding: 8 }}><MapaFamilia v={v} aluno={a} escola={f.escola} viagem={f.viagem} altura={240} /></div>}
      {jogo && (
        <>
          <PainelJogo ev={ev} saldo={saldo} />
          <SemanaFogo ev={ev} />
          <MissoesMini ev={ev} />
          <div className="jogo-dupla">
            <RankingMini alunoId={a.id} colegas={colegas} ev={evVan} />
            <PremioMini saldo={saldo} premios={premios} />
          </div>
        </>
      )}
    </>
  );
}

/** A van vindo: estrada com as paradas que faltam até você (ou até a escola). Dá para entender sem ler. */
function Estrada({ v, titulo, sub, chegada, rotulo, viagemAtiva }: { v: NonNullable<F['visao']>; titulo: string; sub: string; chegada?: string; rotulo?: string; viagemAtiva: boolean }) {
  const antes = Math.min(v.paradasAntes ?? 0, 6);
  const destino: 'casa' | 'escola' = v.alvoTipo === 'escola' || v.fase === 'a_bordo' || v.fase === 'a_bordo_final' ? 'escola' : 'casa';
  const chegou = ['na_porta', 'chegou_escola', 'entregue', 'volta_na_escola'].includes(v.fase);
  return (
    <section className={`estrada-card ${chegou ? 'chegou' : ''} ${v.fase === 'proximo' ? 'proximo' : ''}`}>
      <span className="ec-rot">{viagemAtiva ? 'Agora' : 'Hoje'}</span>
      <h2>{titulo}</h2>
      <p>{sub}</p>
      {chegada && <div className="ec-hora"><b>{chegada}</b><span>{rotulo}</span></div>}
      <div className="estrada" aria-hidden>
        <span className={`es-van ${viagemAtiva ? '' : 'dormindo'}`}><I n="van" /></span>
        <span className="es-faixa">
          {Array.from({ length: !viagemAtiva || chegou ? 0 : antes }).map((_, k) => <i key={k} className="es-parada" />)}
        </span>
        <span className="es-destino"><I n={destino} /><small>{destino === 'casa' ? 'você' : 'escola'}</small></span>
      </div>
    </section>
  );
}

/** Nível em anel + saldo de estrelas: o "placar" do aluno. */
function PainelJogo({ ev, saldo }: { ev: Parameters<typeof xpDe>[0]; saldo: number }) {
  const xp = xpDe(ev);
  const n = nivelDe(xp);
  return (
    <section className="jogo-placar">
      <div className="anel" style={{ background: `conic-gradient(var(--amarelo) ${n.pct * 3.6}deg, rgba(255,255,255,.12) 0)` }}>
        <span>{n.atual.icone}</span>
      </div>
      <div className="jp-txt">
        <small>Seu nível</small>
        <strong>{n.atual.nome}</strong>
        <span>{n.prox ? <>faltam <b>{n.falta} XP</b> para {n.prox.icone} {n.prox.nome}</> : 'nível máximo!'}</span>
      </div>
      <div className="jp-saldo"><b>{saldo}</b><span>⭐</span><small>para gastar</small></div>
    </section>
  );
}

/** A semana: um foguinho por dia que esteve pronto no portão. */
function SemanaFogo({ ev }: { ev: Parameters<typeof xpDe>[0] }) {
  const seg = new Date(); seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7));
  const dias = Array.from({ length: 5 }, (_, k) => { const d = new Date(seg); d.setDate(seg.getDate() + k); return d; });
  const prontos = new Set(ev.filter((e) => e.tipo === 'pronto_portao').map((e) => e.data));
  const foi = new Set(ev.filter((e) => e.tipo === 'embarque' || e.tipo === 'pronto_portao').map((e) => e.data));
  const seq = sequencia(ev);
  const hj = hoje();
  return (
    <section className="m-card semana-fogo">
      <h4>Sua semana {seq > 0 && <span className="tag tag-amarelo">🔥 {seq} dia{seq > 1 ? 's' : ''} seguido{seq > 1 ? 's' : ''}</span>}</h4>
      <div className="sf-dias">
        {dias.map((d) => {
          const k = hoje(d);
          const est = prontos.has(k) ? 'fogo' : foi.has(k) ? 'foi' : k < hj ? 'perdeu' : k === hj ? 'hoje' : '';
          return (
            <div key={k} className={`sf-dia ${est}`}>
              <span>{est === 'fogo' ? '🔥' : est === 'foi' ? '✓' : est === 'perdeu' ? '·' : ''}</span>
              <small>{d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</small>
            </div>
          );
        })}
      </div>
      <small className="muted">🔥 = estava no portão antes da van chegar</small>
    </section>
  );
}

function MissoesMini({ ev }: { ev: Parameters<typeof xpDe>[0] }) {
  const ms = missoesDe(ev).slice(0, 3);
  return (
    <section className="m-card">
      <h4>Missões da semana <button type="button" className="ver-tudo" onClick={() => ir('aluno/missoes')}>ver todas</button></h4>
      {ms.map((m) => {
        const ok = m.atual >= m.meta;
        return (
          <div key={m.id} className={`missao-mini ${ok ? 'ok' : ''}`}>
            <span className="mm-ic">{ok ? '✅' : m.icone}</span>
            <div><strong>{m.nome}</strong><div className="prog"><i style={{ width: `${Math.min(100, (m.atual / m.meta) * 100)}%` }} /></div></div>
            <b>+{m.premio}</b>
          </div>
        );
      })}
    </section>
  );
}

function RankingMini({ alunoId, colegas, ev }: { alunoId: string; colegas: Parameters<typeof calcularRanking>[0]; ev: Parameters<typeof calcularRanking>[1] }) {
  const r = calcularRanking(colegas, ev, 'semana');
  const eu = r.find((l) => l.aluno.id === alunoId);
  const acima = eu && eu.pos > 1 ? r[eu.pos - 2] : undefined;
  return (
    <button type="button" className="m-card jogo-mini" onClick={() => ir('aluno/ranking')}>
      <span className="jm-ic">🏆</span>
      <small>Ranking da semana</small>
      <strong>{eu ? `${eu.pos}º lugar` : '—'}</strong>
      <span className="muted small">{!eu ? '' : eu.pos === 1 ? 'Você está na frente!' : `${Math.max(1, (acima?.pontos ?? 0) - eu.pontos + 1)} ⭐ para passar ${acima?.aluno.apelido}`}</span>
    </button>
  );
}

function PremioMini({ saldo, premios }: { saldo: number; premios: { id: string; icone: string; nome: string; custo: number }[] }) {
  const ordem = [...premios].sort((x, y) => x.custo - y.custo);
  const prox = ordem.find((p) => p.custo > saldo) ?? ordem[ordem.length - 1];
  if (!prox) return null;
  const pode = saldo >= prox.custo;
  return (
    <button type="button" className="m-card jogo-mini" onClick={() => ir('aluno/loja')}>
      <span className="jm-ic">{prox.icone}</span>
      <small>{pode ? 'Já dá para trocar!' : 'Próximo prêmio'}</small>
      <strong className="jm-nome">{prox.nome}</strong>
      {!pode && <><div className="prog"><i style={{ width: `${Math.min(100, (saldo / prox.custo) * 100)}%`, background: 'var(--amarelo)' }} /></div><span className="muted small">faltam {prox.custo - saldo} ⭐</span></>}
    </button>
  );
}

function MissoesAba({ alunoId }: { alunoId: string }) {
  const ev = usePontosAluno(alunoId);
  return (
    <>
      <div className="m-card"><h4>Missões da semana <span className="tag tag-amarelo">renovam segunda</span></h4><Missoes ev={ev} /></div>
      <div className="m-card"><h4>Conquistas</h4><Selos ev={ev} /></div>
      <div className="m-card">
        <h4>Como ganhar pontos</h4>
        <div className="small" style={{ display: 'grid', gap: 6 }}>
          <span>⏰ Estar no portão antes da van: <b className="verde">+10</b></span>
          <span>🔒 Usar o cinto, ser educado, ajudar colegas: <b className="verde">+5 a +10</b></span>
          <span>📣 Família avisar que você não vai: <b className="verde">+2</b></span>
          <span>📢 Bagunça, tirar o cinto, desrespeito: <b className="vermelho">-10 a -25</b> (e seus pais ficam sabendo)</span>
        </div>
      </div>
      <div className="m-card"><h4>Histórico</h4><Feed ev={ev} limite={25} /></div>
    </>
  );
}

function RankingAba({ alunoId, vanId }: { alunoId: string; vanId: string }) {
  const ev = usePontosVan(vanId);
  const alunos = useLiveQuery(() => db.alunos.where('vanId').equals(vanId).toArray(), [vanId]) ?? [];
  return <div className="m-card"><Ranking alunos={alunos} ev={ev} eu={alunoId} /></div>;
}

function Loja({ alunoId, vanId }: { alunoId: string; vanId: string }) {
  const ev = usePontosAluno(alunoId);
  const resgates = useLiveQuery(() => db.resgates.where('alunoId').equals(alunoId).toArray(), [alunoId]) ?? [];
  const premios = useLiveQuery(() => db.recompensas.where('vanId').equals(vanId).filter((r) => r.ativo).toArray(), [vanId]) ?? [];
  const saldo = saldoDe(ev, resgates);
  return (
    <>
      <div className="status-card destaque entre"><div><small style={{ fontWeight: 600 }}>Seu saldo</small><div className="big">{saldo} ⭐</div></div><span className="st-ic" style={{ width: 52, height: 52 }}><I n="premio" tam={26} /></span></div>
      <div className="m-card">
        <h4>Prêmios da van</h4>
        {premios.map((p) => {
          const pendente = resgates.some((r) => r.recompensaId === p.id && r.status === 'pendente');
          return (
            <div key={p.id} className="premio">
              <div className="ic">{p.icone}</div>
              <div><strong>{p.nome}</strong><div className="small muted">{p.custo} ⭐{saldo < p.custo ? ` · faltam ${p.custo - saldo}` : ''}</div></div>
              <button className="btn btn-primario btn-sm" disabled={saldo < p.custo || pendente} onClick={() => void resgatar(alunoId, p.id)}>{pendente ? 'Pedido' : 'Trocar'}</button>
            </div>
          );
        })}
        {!premios.length && <Vazio ic="premio">O tio ainda não cadastrou prêmios</Vazio>}
      </div>
      <div className="m-card">
        <h4>Meus pedidos</h4>
        {!resgates.length && <span className="muted small">Você ainda não trocou pontos.</span>}
        {[...resgates].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).map((r) => (
          <div key={r.id} className="linha-item"><span>{r.icone} {r.nome} <span className="muted small">· {haQuanto(r.criadoEm)}</span></span>
            <span className={`tag ${r.status === 'aprovado' ? 'tag-verde' : r.status === 'recusado' ? 'tag-cinza' : 'tag-amarelo'}`}>{r.status === 'pendente' ? 'Esperando o tio' : r.status}</span></div>
        ))}
      </div>
      <small className="muted" style={{ textAlign: 'center' }}>Quem decide é o tio: ele aprova e combina quando você usa o prêmio.</small>
    </>
  );
}
