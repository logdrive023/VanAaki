import { useLiveQuery } from 'dexie-react-hooks';
import { Feed, Missoes, NivelCard, Ranking, Selos, usePontosAluno, usePontosVan } from '../components/gamificacao';
import { ShellFone, type ItemMenu } from '../components/Shell';
import { Avatar, Vazio } from '../components/ui';
import { I } from '../components/Icone';
import { db } from '../db/db';
import { saldoDe, sequencia } from '../lib/gamificacao';
import { haQuanto } from '../lib/util';
import { resgatar } from '../services/pontos';
import { idxAluno, marcarPronto } from '../services/viagem';
import { MapaFamilia, SeletorAluno, textoStatus, useAlunoPerfil, useFamilia } from './familia';

export default function Aluno({ aba = 'inicio' }: { aba?: string }) {
  const [alunoId, setAlunoId] = useAlunoPerfil();
  const f = useFamilia(alunoId);
  if (f.carregando || !f.aluno || !f.visao) return <div className="vazio">Carregando…</div>;
  const menu: ItemMenu[] = [
    { id: 'inicio', ic: 'casa', nome: 'Início' },
    { id: 'missoes', ic: 'alvo', nome: 'Missões' },
    { id: 'ranking', ic: 'trofeu', nome: 'Ranking' },
    { id: 'loja', ic: 'premio', nome: 'Loja' },
  ];
  const topo = (
    <div className="linha" style={{ flex: 1, flexWrap: 'nowrap', minWidth: 0 }}>
      <Avatar aluno={f.aluno} />
      <div style={{ flex: 1, minWidth: 0 }}><small>Oi, {f.aluno.apelido}!</small><SeletorAluno id={alunoId} onChange={setAlunoId} perfis={f.perfis} /></div>
    </div>
  );
  return (
    <ShellFone base="aluno" classe="aluno" menu={menu} atual={aba} topo={topo} filtro={{ para: 'aluno', alunoId }}>
      {aba === 'inicio' && <Inicio f={f} />}
      {aba === 'missoes' && <MissoesAba alunoId={alunoId} />}
      {aba === 'ranking' && <RankingAba alunoId={alunoId} vanId={f.aluno.vanId} />}
      {aba === 'loja' && <Loja alunoId={alunoId} vanId={f.aluno.vanId} />}
    </ShellFone>
  );
}

type F = ReturnType<typeof useFamilia>;

function Inicio({ f }: { f: F }) {
  const a = f.aluno!, v = f.visao!;
  const ev = usePontosAluno(a.id);
  const resgates = useLiveQuery(() => db.resgates.where('alunoId').equals(a.id).toArray(), [a.id]) ?? [];
  const s = textoStatus(v, a, f.viagem, f.escola?.nome ?? 'escola', f.plano, true);
  const parada = f.viagem?.paradas[idxAluno(f.viagem, a.id)];
  const podePronto = f.viagem?.status === 'em_andamento' && f.viagem.tipo === 'ida' && parada?.status === 'pendente';
  return (
    <>
      <div className="aluno-ola">
        <p><I n={s.ic} tam={16} />{f.viagem?.status === 'em_andamento' ? 'Agora' : 'Hoje'}</p>
        <h2>{s.titulo}</h2>
        <p style={{ marginTop: 4 }}>{s.sub}</p>
        {v.fase === 'proximo' && <div className="grande">{v.eta} <small>minutinhos</small></div>}
      </div>
      {podePronto && (
        <div className="checkin">
          {parada!.prontoEm ? (
            <><span className="entrar-ic" style={{ background: 'var(--verde-suave)', color: 'var(--verde)' }}><I n="check" /></span><strong style={{ fontSize: 17, marginTop: 8 }}>O tio sabe que você está no portão!</strong><p className="muted small">Quando embarcar você ganha +10 pontos</p></>
          ) : (
            <>
              <strong style={{ fontSize: 16 }}>Já está no portão com a mochila?</strong>
              <button className="btn-gigante" onClick={() => void marcarPronto(a.id)}><div><I n="mao" />Tô no portão!</div></button>
              <span className="muted small">Vale +10 pontos se for antes da van chegar</span>
            </>
          )}
        </div>
      )}
      {v.mostrarMapa && f.viagem && <div className="m-card" style={{ padding: 8 }}><MapaFamilia v={v} aluno={a} escola={f.escola} viagem={f.viagem} altura={260} /></div>}
      <NivelCard ev={ev} saldo={saldoDe(ev, resgates)} sequencia={sequencia(ev)} />
      <div className="carteirinha">
        <div className="qr" />
        <div style={{ position: 'relative' }}>
          <small>Carteirinha VanAaki</small>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{a.nome}</div>
          <small>{f.escola?.nome} · {a.serie}</small><br />
          <small>Van: {f.van?.motorista} · {f.van?.placa}</small>
        </div>
      </div>
      <div className="m-card"><h4>Últimos pontos</h4><Feed ev={ev} limite={5} /></div>
    </>
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
