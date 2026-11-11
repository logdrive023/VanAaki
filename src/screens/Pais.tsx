import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { calcularRanking, Feed, NivelCard, Selos, usePontosAluno, usePontosVan } from '../components/gamificacao';
import { ShellFone, type ItemMenu } from '../components/Shell';
import { Avatar, ir, Modal, useNotificacoes, Vazio } from '../components/ui';
import { db } from '../db/db';
import type { Pagamento } from '../db/types';
import { saldoDe, sequencia, tipoEvento } from '../lib/gamificacao';
import { haQuanto, nomeMes, primeiroNome, reais } from '../lib/util';
import { atrasado, definirPresenca, pagar } from '../services/acoes';
import { Chat } from './motorista/Gestao';
import { LinhaTempo, MapaFamilia, SeletorAluno, textoStatus, useAlunoPerfil, useFamilia } from './familia';

export default function Pais({ aba = 'inicio' }: { aba?: string }) {
  const [alunoId, setAlunoId] = useAlunoPerfil();
  const f = useFamilia(alunoId);
  const msgs = useLiveQuery(() => db.mensagens.where('alunoId').equals(alunoId).filter((m) => m.de === 'motorista' && !m.lida).count(), [alunoId]) ?? 0;
  const pend = useLiveQuery(() => db.pagamentos.where('alunoId').equals(alunoId).filter((p) => p.status === 'pendente').count(), [alunoId]) ?? 0;
  if (f.carregando || !f.aluno || !f.visao) return <div className="vazio">Carregando…</div>;
  const menu: ItemMenu[] = [
    { id: 'inicio', ic: '🏠', nome: 'Início' },
    { id: 'rastreio', ic: '📍', nome: 'Rastreio', badge: f.visao.mostrarMapa ? 1 : 0 },
    { id: 'pagamentos', ic: '💳', nome: 'Pagamentos', badge: pend },
    { id: 'conduta', ic: '⭐', nome: 'Conduta' },
    { id: 'chat', ic: '💬', nome: 'Tio', badge: msgs },
  ];
  const topo = (
    <div className="linha" style={{ flex: 1 }}>
      <Avatar aluno={f.aluno} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <small>Responsável · {f.aluno.responsavel}</small>
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
      {aba === 'chat' && <div className="m-card"><Chat alunoId={alunoId} eu="pais" titulo={`💬 Conversa com ${f.van?.motorista}`} /></div>}
    </ShellFone>
  );
}

type F = ReturnType<typeof useFamilia>;

function StatusCard({ f, compacto }: { f: F; compacto?: boolean }) {
  const v = f.visao!, a = f.aluno!;
  const s = textoStatus(v, a, f.viagem, f.viagem?.destinoNome ?? f.escola?.nome ?? 'escola');
  const destaque = ['proximo', 'na_porta', 'a_bordo_final'].includes(v.fase);
  return (
    <div className={`status-card ${destaque ? 'destaque' : v.fase === 'aguardando' || v.fase === 'a_bordo' ? 'escuro' : ''}`}>
      <div className="entre"><span style={{ fontSize: 28 }}>{s.ic}</span>{f.viagem?.status === 'em_andamento' && <span className="tag tag-verde ao-vivo"><span className="ponto" /> Ao vivo</span>}</div>
      <div style={{ fontSize: 20, fontWeight: 900, marginTop: 6 }}>{s.titulo}</div>
      <div className={destaque ? '' : 'muted'} style={{ fontWeight: 700 }}>{s.sub}</div>
      {v.fase === 'proximo' && <div className="eta-num" style={{ marginTop: 10 }}>{v.eta} <small>min</small></div>}
      {!compacto && v.mostrarMapa && <button className="btn btn-escuro btn-sm" style={{ marginTop: 12 }} onClick={() => ir('pais/rastreio')}>📍 Ver a van no mapa</button>}
    </div>
  );
}

function Inicio({ f }: { f: F }) {
  const a = f.aluno!;
  const notifs = useNotificacoes({ para: 'pais', alunoId: a.id });
  const [motivo, setMotivo] = useState('');
  const vai = f.presenca ? f.presenca.vai : true;
  const jaPassou = f.viagem?.paradas.find((p) => p.alunoId === a.id && p.status !== 'pendente');
  return (
    <>
      <StatusCard f={f} />
      {f.visao!.fase === 'aguardando' && (
        <div className="privacidade"><span className="ic">🔒</span><span><b>Por segurança</b>, a posição da van aparece só quando {primeiroNome(a.nome)} for o próximo. Ninguém vê o endereço de outras crianças.</span></div>
      )}
      <div className="m-card">
        <h4>{primeiroNome(a.nome)} vai hoje? <span className="tag tag-cinza">{f.escola?.nome}</span></h4>
        <div className="vai-hoje">
          <button className={`opcao sim ${vai ? 'ativo' : ''}`} disabled={!!jaPassou} onClick={() => void definirPresenca(a.id, true)}>✅ Vai</button>
          <button className={`opcao nao ${!vai ? 'ativo' : ''}`} disabled={!!jaPassou} onClick={() => void definirPresenca(a.id, false, motivo.trim() || undefined)}>🚫 Não vai</button>
        </div>
        {vai && !jaPassou && <input className="inp" style={{ marginTop: 8 }} placeholder="Motivo (opcional): consulta, viagem…" value={motivo} onChange={(e) => setMotivo(e.target.value)} />}
        <p className="muted small" style={{ marginTop: 8 }}>{!vai ? `Avisado${f.presenca?.motivo ? ` · ${f.presenca.motivo}` : ''}. A rota do tio já foi ajustada (e ninguém perde ponto).` : 'Avise antes da rota: o tio não perde tempo e a criança não perde ponto.'}</p>
      </div>
      <div className="m-card">
        <h4>Motorista</h4>
        <div className="motorista-box">
          <Avatar nome={f.van?.motorista ?? ''} cor="#6C5CE7" />
          <div><strong>{f.van?.motorista}</strong><br /><span className="muted small">{f.van?.modelo} · <span className="placa">{f.van?.placa}</span></span></div>
          <div className="acoes"><button className="icone-btn" onClick={() => ir('pais/chat')}>💬</button><a className="icone-btn verde" href={`tel:${f.van?.telefone}`}>📞</a></div>
        </div>
      </div>
      <div className="m-card">
        <h4>Últimos avisos</h4>
        {notifs.length === 0 && <Vazio ic="🔕">Nada ainda</Vazio>}
        {notifs.slice(0, 6).map((n) => <div key={n.id} className="linha-item"><div className="aluno-cel"><span style={{ fontSize: 20 }}>{n.icone}</span><div><strong>{n.titulo}</strong><span className="muted small">{n.texto} · {haQuanto(n.criadoEm)}</span></div></div></div>)}
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
        ? <div className="m-card" style={{ padding: 8 }}><MapaFamilia v={v} aluno={a} viagem={f.viagem} altura="48vh" /></div>
        : (v.fase === 'aguardando' || v.fase === 'a_bordo' || v.fase === 'sem_viagem') && (
          <div className="m-card" style={{ textAlign: 'center', padding: 26 }}>
            <div style={{ fontSize: 46 }}>🔒</div>
            <strong style={{ fontSize: 17 }}>O mapa aparece quando for a sua vez</strong>
            <p className="muted small" style={{ marginTop: 6 }}>Para a segurança de todas as crianças, a localização da van só é mostrada quando {primeiroNome(a.nome)} for o próximo{f.viagem?.tipo === 'volta' ? ' a ser entregue' : ''}, ou no trecho final até a escola.{v.paradasAntes > 0 ? ` Agora faltam ${v.paradasAntes} parada(s) antes.` : ''}</p>
          </div>
        )}
      <div className="m-card"><h4>Hoje</h4>{f.viagem ? <LinhaTempo viagem={f.viagem} alunoId={a.id} v={v} /> : <Vazio ic="🅿️">A van ainda não saiu hoje</Vazio>}</div>
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
        <span className="muted small" style={{ fontWeight: 800 }}>{aberto.length ? 'EM ABERTO' : 'TUDO EM DIA'}</span>
        <div className="big">{reais(aberto.reduce((s, p) => s + p.valor, 0))}</div>
        {aberto.some(atrasado) && <span className="tag tag-vermelho" style={{ marginTop: 6 }}>Mensalidade atrasada</span>}
      </div>
      <div className="m-card">
        <h4>Mensalidades</h4>
        {lista.map((p) => (
          <div key={p.id} className="linha-item">
            <div><strong>{nomeMes(p.mes)} {p.mes.slice(0, 4)}</strong><span className="muted small">{p.status === 'pago' ? `Pago em ${p.pagoEm?.slice(0, 10).split('-').reverse().join('/')} · ${p.metodo}` : `Vence ${p.vencimento.split('-').reverse().join('/')} · ${reais(p.valor)}`}</span></div>
            {p.status === 'pago' ? <span className="tag tag-verde">✓ Pago</span> : <button className="btn btn-primario btn-sm" onClick={() => setPix(p)}>Pagar Pix</button>}
          </div>
        ))}
      </div>
      {pix && (
        <Modal titulo={`Pix · ${nomeMes(pix.mes)}`} onFechar={() => setPix(null)}>
          <div className="pilha">
            <div className="big" style={{ textAlign: 'center' }}>{reais(pix.valor)}</div>
            <div className="qr" style={{ width: 170, height: 170, margin: '0 auto', border: '10px solid #fff', boxShadow: 'var(--sombra)' }} />
            <div className="pix-codigo">00020126580014BR.GOV.BCB.PIX0136{pix.id.slice(0, 32)}5204000053039865406{(pix.valor / 100).toFixed(2)}5802BR5925VANAAKI TESTE6009SAO PAULO</div>
            <small className="muted">⚠️ Código fictício, só para validar o fluxo. Nenhum dinheiro é movimentado.</small>
            <button className="btn btn-verde btn-bloco" onClick={async () => { await pagar(pix.id, 'pix', 'pais'); setPix(null); }}>✅ Simular pagamento confirmado</button>
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
        <div className="m-card" style={{ border: '2px solid var(--vermelho-claro)' }}>
          <h4>⚠️ Ocorrências registradas pelo tio</h4>
          <Feed ev={ocorr} limite={5} />
          <button className="btn btn-claro btn-sm" style={{ marginTop: 8 }} onClick={() => ir('pais/chat')}>💬 Conversar com o tio</button>
        </div>
      )}
      <div className="m-card"><h4>Conquistas de {primeiroNome(a.nome)}</h4><Selos ev={ev} /></div>
      <div className="m-card"><h4>Histórico de pontos</h4><Feed ev={ev} limite={15} /></div>
    </>
  );
}
