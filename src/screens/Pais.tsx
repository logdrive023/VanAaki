import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { calcularRanking, Feed, NivelCard, Selos, usePontosAluno, usePontosVan } from '../components/gamificacao';
import { ShellFone, type ItemMenu } from '../components/Shell';
import { Avatar, ir, Modal, useNotificacoes, Vazio } from '../components/ui';
import { I } from '../components/Icone';
import { db } from '../db/db';
import type { Pagamento } from '../db/types';
import { saldoDe, sequencia, tipoEvento } from '../lib/gamificacao';
import { haQuanto, nomeMes, primeiroNome, reais } from '../lib/util';
import { atrasado, definirPresenca, pagar, vincularFilho } from '../services/acoes';
import { useEu } from '../api/sync';
import { PainelTeste } from '../components/ui';
import { Chat } from './motorista/Gestao';
import { EscolhaPlano } from '../components/presenca';
import { NOME_TURNO } from '../lib/turnos';
import { LinhaTempo, MapaFamilia, SeletorAluno, textoStatus, useAlunoPerfil, useFamilia } from './familia';

export default function Pais({ aba = 'inicio' }: { aba?: string }) {
  const [alunoId, setAlunoId] = useAlunoPerfil();
  const f = useFamilia(alunoId);
  const msgs = useLiveQuery(() => db.mensagens.where('alunoId').equals(alunoId).filter((m) => m.de === 'motorista' && !m.lida).count(), [alunoId]) ?? 0;
  const pend = useLiveQuery(() => db.pagamentos.where('alunoId').equals(alunoId).filter((p) => p.status === 'pendente').count(), [alunoId]) ?? 0;
  const eu = useEu();
  if (eu && !eu.alunoIds.length) return <SemFilho />;
  if (f.carregando || !f.aluno || !f.visao) return <div className="vazio">Carregando…</div>;
  const menu: ItemMenu[] = [
    { id: 'inicio', ic: 'casa', nome: 'Início' },
    { id: 'rastreio', ic: 'pin', nome: 'Rastreio', badge: f.visao.mostrarMapa ? 1 : 0 },
    { id: 'pagamentos', ic: 'financeiro', nome: 'Pagamentos', badge: pend },
    { id: 'conduta', ic: 'estrela', nome: 'Conduta' },
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
      {aba === 'pagamentos' && <Pagamentos alunoId={alunoId} />}
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
      {v.fase === 'proximo' && <div className="eta-num">{v.eta}<small> min</small></div>}
      {!compacto && v.mostrarMapa && <button className={`btn ${destaque ? 'btn-escuro' : 'btn-primario'} btn-sm`} style={{ marginTop: 14 }} onClick={() => ir('pais/rastreio')}><I n="mapa" />{v.aBordo ? 'Acompanhar o trajeto' : 'Ver a van no mapa'}</button>}
    </div>
  );
}

function Inicio({ f }: { f: F }) {
  const a = f.aluno!;
  const notifs = useNotificacoes({ para: 'pais', alunoId: a.id });
  const [motivo, setMotivo] = useState('');
  return (
    <>
      <StatusCard f={f} />
      {(f.visao!.fase === 'aguardando' || f.visao!.fase === 'volta_outra_escola') && (
        <div className="privacidade"><span className="ic"><I n="escudo" /></span><span><b>Por segurança</b>, a van aparece no mapa quando {primeiroNome(a.nome)} for o próximo e durante todo o tempo em que estiver a bordo. Ninguém vê o endereço de outras crianças.</span></div>
      )}
      <div className="m-card">
        <h4>Van hoje para {primeiroNome(a.nome)} <span className="tag"><I n={a.turno} />{NOME_TURNO[a.turno]}</span></h4>
        <EscolhaPlano valor={f.plano} onChange={(p) => void definirPresenca(a.id, p, motivo.trim() || undefined)} />
        <input className="inp" style={{ marginTop: 10 }} placeholder="Motivo (opcional): consulta, futebol, viagem…" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <p className="muted small" style={{ marginTop: 8 }}>{f.plano !== 'ambos' ? `Combinado com o tio${f.presenca?.motivo ? ` · ${f.presenca.motivo}` : ''}. A rota já foi ajustada e ninguém perde ponto.` : `${f.escola?.nome} · avise antes da rota: o tio não perde tempo e a criança não perde ponto.`}</p>
      </div>
      <div className="m-card">
        <h4>Motorista</h4>
        <div className="motorista-box">
          <Avatar nome={f.van?.motorista ?? ''} cor="#6C5CE7" />
          <div><strong>{f.van?.motorista}</strong><br /><span className="muted small">{f.van?.modelo} · <span className="placa">{f.van?.placa}</span></span></div>
          <div className="acoes"><button className="icone-btn" onClick={() => ir('pais/chat')} aria-label="Mensagem"><I n="mensagem" /></button><a className="icone-btn verde" href={`tel:${f.van?.telefone}`} aria-label="Ligar"><I n="telefone" /></a></div>
        </div>
      </div>
      <AcessoAluno f={f} />
      <div className="m-card">
        <h4>Últimos avisos</h4>
        {notifs.length === 0 && <Vazio ic="semSino">Nada ainda</Vazio>}
        {notifs.slice(0, 6).map((n) => <div key={n.id} className="linha-item"><div className="aluno-cel"><span className="nota-ic">{n.icone}</span><div><strong>{n.titulo}</strong><span className="muted small">{n.texto} · {haQuanto(n.criadoEm)}</span></div></div></div>)}
      </div>
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

function Pagamentos({ alunoId }: { alunoId: string }) {
  const pags = useLiveQuery(() => db.pagamentos.where('alunoId').equals(alunoId).toArray(), [alunoId]) ?? [];
  const [pix, setPix] = useState<Pagamento | null>(null);
  const lista = [...pags].sort((a, b) => b.mes.localeCompare(a.mes));
  const aberto = lista.filter((p) => p.status === 'pendente');
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
            {p.status === 'pago' ? <span className="tag tag-verde"><I n="check" />Pago</span> : <button className="btn btn-primario btn-sm" onClick={() => setPix(p)}>Pagar com Pix</button>}
          </div>
        ))}
      </div>
      {pix && (
        <Modal titulo={`Pix · ${nomeMes(pix.mes)}`} onFechar={() => setPix(null)}>
          <div className="pilha">
            <div className="big" style={{ textAlign: 'center' }}>{reais(pix.valor)}</div>
            <div className="qr" style={{ width: 170, height: 170, margin: '0 auto', border: '10px solid #fff', boxShadow: '0 0 0 1px var(--borda)' }} />
            <div className="pix-codigo">00020126580014BR.GOV.BCB.PIX0136{pix.id.slice(0, 32)}5204000053039865406{(pix.valor / 100).toFixed(2)}5802BR5925VANAAKI TESTE6009SAO PAULO</div>
            <small className="muted">Código fictício, só para validar o fluxo. Nenhum dinheiro é movimentado.</small>
            <button className="btn btn-escuro btn-bloco" onClick={async () => { await pagar(pix.id, 'pix', 'pais'); setPix(null); }}><I n="check" />Simular pagamento confirmado</button>
          </div>
        </Modal>
      )}
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
  const app = `${location.origin}${location.pathname}#/aluno`;
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
