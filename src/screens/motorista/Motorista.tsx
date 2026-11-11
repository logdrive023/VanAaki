import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import Mapa3D from '../../components/Mapa3D';
import { ShellPainel, type ItemMenu } from '../../components/Shell';
import { SeletorPlano } from '../../components/presenca';
import { Avatar, ir, Modal, Toggle, useNotificacoes, Vazio } from '../../components/ui';
import { db } from '../../db/db';
import { VAN_PRINCIPAL } from '../../db/seed';
import { TURNOS, type Aluno, type Turno, type TurnoVan } from '../../db/types';
import { horarioAlvo, ICONE_TURNO, NOME_TURNO, nomePlano, planoDe } from '../../lib/turnos';
import { arquivarAluno, atrasado, definirPresenca, salvarAluno } from '../../services/acoes';
import { centavos, CORES, dataLonga, haQuanto, hora, nomeMes, mesAtual, reais, uid, agoraIso } from '../../lib/util';
import { useDadosVan, type DadosVan } from './dados';
import { Conduta, Financeiro, Mensagens, Premios } from './Gestao';
import { Rota } from './Rota';

export default function Motorista({ aba = 'painel', extra }: { aba?: string; extra?: string }) {
  const d = useDadosVan(VAN_PRINCIPAL);
  const pedidos = useLiveQuery(() => db.resgates.where('status').equals('pendente').count()) ?? 0;
  const msgs = useLiveQuery(() => db.mensagens.filter((m) => m.de === 'pais' && !m.lida).count()) ?? 0;
  if (d.carregando || !d.van) return <div className="vazio">Carregando…</div>;
  const pend = d.pagamentosMes.filter((p) => p.status === 'pendente').length;

  const menu: ItemMenu[] = [
    { id: 'painel', ic: '📊', nome: 'Painel', grupo: 'Operação' },
    { id: 'rota', ic: '🗺️', nome: 'Rota', grupo: 'Operação', badge: d.ativa ? 1 : 0 },
    { id: 'alunos', ic: '👦', nome: 'Alunos', grupo: 'Operação' },
    { id: 'financeiro', ic: '💰', nome: 'Financeiro', curto: 'Caixa', grupo: 'Gestão', badge: pend },
    { id: 'conduta', ic: '⭐', nome: 'Conduta', grupo: 'Gamificação' },
    { id: 'premios', ic: '🎁', nome: 'Prêmios', grupo: 'Gamificação', badge: pedidos },
    { id: 'mensagens', ic: '💬', nome: 'Mensagens', curto: 'Chat', grupo: 'Gestão', badge: msgs },
  ];
  const titulos: Record<string, string> = {
    painel: `Bom dia, ${d.van.motorista} 👋`, rota: d.ativa ? 'Rota em andamento' : 'Rota do dia', alunos: 'Alunos',
    financeiro: 'Financeiro', conduta: 'Conduta e ranking', premios: 'Loja de prêmios', mensagens: 'Mensagens dos pais',
  };
  const perfil = (
    <div className="perfil-side">
      <Avatar nome={d.van.motorista} cor="#6C5CE7" />
      <div><strong>{d.van.motorista}</strong><small>{d.van.modelo} · {d.van.placa}</small></div>
    </div>
  );
  return (
    <ShellPainel base="motorista" menu={menu} atual={aba} perfil={perfil} filtro={{ para: 'motorista', vanId: VAN_PRINCIPAL }}
      titulo={titulos[aba] ?? 'Painel'} sub={dataLonga()}
      acoes={aba !== 'rota' && <button className="btn btn-primario" onClick={() => ir('motorista/rota')}>{d.ativa ? '📍' : '▶'} <span className="esconde-celular">{d.ativa ? 'Ver rota ao vivo' : 'Iniciar rota'}</span><span className="so-celular">Rota</span></button>}>
      {aba === 'painel' && <Painel d={d} pedidos={pedidos} />}
      {aba === 'rota' && <Rota d={d} turnoInicial={extra as Turno | undefined} />}
      {aba === 'alunos' && <Alunos d={d} />}
      {aba === 'financeiro' && <Financeiro d={d} />}
      {aba === 'conduta' && <Conduta d={d} />}
      {aba === 'premios' && <Premios d={d} />}
      {aba === 'mensagens' && <Mensagens d={d} />}
    </ShellPainel>
  );
}

// ---------------- painel ----------------

function Painel({ d, pedidos }: { d: DadosVan; pedidos: number }) {
  const notifs = useNotificacoes({ para: 'motorista', vanId: VAN_PRINCIPAL });
  const pagos = d.pagamentosMes.filter((p) => p.status === 'pago');
  const pend = d.pagamentosMes.filter((p) => p.status === 'pendente');
  const [editarTurnos, setEditarTurnos] = useState(false);
  return (
    <>
      <section className="kpis">
        <div className="kpi"><div className="ic" style={{ background: 'var(--azul-claro)' }}>👦</div><div><div className="num">{d.ativos.length}</div><div className="rot">Alunos ativos</div></div></div>
        <div className="kpi"><div className="ic" style={{ background: 'var(--verde-claro)' }}>💰</div><div><div className="num">{pagos.length}<span className="muted" style={{ fontSize: 16 }}>/{d.pagamentosMes.length}</span></div><div className="rot">Pagaram {nomeMes(mesAtual()).toLowerCase()}</div><div className="delta verde">{reais(pagos.reduce((s, p) => s + p.valor, 0))}</div></div></div>
        <div className="kpi" style={{ cursor: 'pointer' }} onClick={() => ir('motorista/financeiro')}><div className="ic" style={{ background: 'var(--vermelho-claro)' }}>⏰</div><div><div className="num">{pend.length}</div><div className="rot">Pendentes</div><div className="delta vermelho">{reais(pend.reduce((s, p) => s + p.valor, 0))} · {pend.filter(atrasado).length} atrasado(s)</div></div></div>
        <div className="kpi"><div className="ic" style={{ background: 'var(--amarelo-claro)' }}>🗓️</div><div><div className="num">{d.van!.turnos.filter((t) => t.ativo).length}</div><div className="rot">Turnos de trabalho</div><div className="delta laranja">{d.avisos.length} combinado(s) hoje</div></div></div>
      </section>
      <div className="grade-painel">
        <section className="card">
          <div className="card-topo"><h3>Turnos de hoje</h3><button className="btn btn-claro btn-sm" onClick={() => setEditarTurnos(true)}>⚙️ Turnos e escolas</button></div>
          <div className="pilha">
            {d.van!.turnos.filter((t) => t.ativo).map((t) => <CartaoTurno key={t.turno} d={d} t={t} />)}
            {!d.van!.turnos.some((t) => t.ativo) && <Vazio ic="🗓️">Nenhum turno ativo</Vazio>}
          </div>
          <hr className="sep" style={{ margin: '16px 0' }} />
          <h3 style={{ marginBottom: 8 }}>Combinados de hoje</h3>
          {d.avisos.length === 0 && <span className="muted">Todo mundo vai e volta de van 🎉</span>}
          {d.avisos.map((p) => {
            const a = d.mapaAlunos.get(p.alunoId)!;
            const pl = nomePlano(planoDe(p));
            return (
              <div key={p.id} className="linha-item">
                <div className="aluno-cel"><Avatar aluno={a} tam={34} /><div><strong>{a.nome}</strong><span className="muted small">{pl.icone} {pl.desc}{p.motivo ? ` · ${p.motivo}` : ''} · {haQuanto(p.avisadoEm)}</span></div></div>
                <SeletorPlano valor={planoDe(p)} onChange={(x) => void definirPresenca(a.id, x, undefined, 'motorista')} />
              </div>
            );
          })}
        </section>
        <section className="card">
          <div className="card-topo"><h3>Últimos avisos</h3>{pedidos > 0 && <button className="tag tag-amarelo" onClick={() => ir('motorista/premios')}>🎁 {pedidos} pedido(s) de prêmio</button>}</div>
          {notifs.length === 0 && <Vazio ic="🔕">Sem avisos</Vazio>}
          {notifs.slice(0, 7).map((n) => (
            <div key={n.id} className="linha-item"><div className="aluno-cel"><span style={{ fontSize: 22 }}>{n.icone}</span><div><strong>{n.titulo}</strong><span className="muted small">{n.texto} · {haQuanto(n.criadoEm)}</span></div></div></div>
          ))}
        </section>
      </div>
      {editarTurnos && <EditarTurnos d={d} onFechar={() => setEditarTurnos(false)} />}
    </>
  );
}

/** Um turno: escolas com horário, quantos alunos e como estão a ida e a volta hoje. */
function CartaoTurno({ d, t }: { d: DadosVan; t: TurnoVan }) {
  const alunos = d.ativos.filter((a) => a.turno === t.turno && t.escolaIds.includes(a.escolaId));
  const nIda = alunos.filter((a) => d.presencaPorAluno.get(a.id)?.ida ?? true).length;
  const nVolta = alunos.filter((a) => d.presencaPorAluno.get(a.id)?.volta ?? true).length;
  const trecho = (tipo: 'ida' | 'volta', n: number) => {
    const vs = d.viagensHoje.filter((v) => v.turno === t.turno && v.tipo === tipo && v.status !== 'cancelada');
    const v = vs.find((x) => x.status === 'em_andamento') ?? vs[vs.length - 1];
    const st = !v ? <span className="muted">não iniciada</span>
      : v.status === 'em_andamento' ? <span className="tag tag-verde ao-vivo"><span className="ponto" /> agora</span>
      : <span className="tag tag-azul">✓ {hora(v.concluidaEm)}</span>;
    return <div className="trecho-status"><span>{tipo === 'ida' ? '☀️ Ida' : '🏠 Volta'} · {n} aluno{n === 1 ? '' : 's'}</span>{st}</div>;
  };
  return (
    <div className="turno-card">
      <div className="entre"><strong>{ICONE_TURNO[t.turno]} {NOME_TURNO[t.turno]}</strong><button className="btn btn-primario btn-sm" onClick={() => ir(`motorista/rota/${t.turno}`)}>{d.ativa?.turno === t.turno ? '📍 Ao vivo' : '▶ Rota'}</button></div>
      <div className="escolas-turno">
        {t.escolaIds.map((id) => { const e = d.mapaEscolas.get(id); const h = e?.horarios[t.turno]; return <span key={id} className="tag tag-cinza">🏫 {e?.nome}{h ? ` · ${h.entrada}–${h.saida}` : ''}</span>; })}
      </div>
      {trecho('ida', nIda)}
      {trecho('volta', nVolta)}
    </div>
  );
}

/** O motorista escolhe em quais turnos trabalha e quais escolas atende em cada um. */
function EditarTurnos({ d, onFechar }: { d: DadosVan; onFechar: () => void }) {
  const [turnos, setTurnos] = useState<TurnoVan[]>(TURNOS.map((t) => d.van!.turnos.find((x) => x.turno === t) ?? { turno: t, ativo: false, escolaIds: [] }));
  const alterar = (t: Turno, mud: Partial<TurnoVan>) => setTurnos((l) => l.map((x) => (x.turno === t ? { ...x, ...mud } : x)));
  const salvar = async () => {
    const van = d.van!;
    const todas = [...new Set(turnos.flatMap((t) => t.escolaIds))];
    const cred = { ...van.credenciamento };
    for (const id of todas) if (!cred[id]) cred[id] = 'pendente'; // escola nova: pede credenciamento
    await db.vans.update(van.id, { turnos, escolaIds: todas, credenciamento: cred });
    onFechar();
  };
  return (
    <Modal titulo="Turnos e escolas" onFechar={onFechar}>
      <div className="pilha">
        <p className="muted small">Marque os turnos em que você trabalha e as escolas de cada um. Na ida a van passa nas escolas pela ordem da entrada; na volta, pela ordem da saída.</p>
        {turnos.map((t) => (
          <div key={t.turno} className={`turno-card ${t.ativo ? '' : 'off'}`}>
            <div className="entre"><strong>{ICONE_TURNO[t.turno]} {NOME_TURNO[t.turno]}</strong><Toggle on={t.ativo} onChange={(v) => alterar(t.turno, { ativo: v })} /></div>
            {d.escolas.map((e) => {
              const h = e.horarios[t.turno];
              return (
                <label key={e.id} className="check" style={{ opacity: h ? 1 : 0.5 }}>
                  <input type="checkbox" disabled={!h || !t.ativo} checked={t.escolaIds.includes(e.id)}
                    onChange={(ev) => alterar(t.turno, { escolaIds: ev.target.checked ? [...t.escolaIds, e.id] : t.escolaIds.filter((x) => x !== e.id) })} />
                  <span>{e.nome} <span className="muted small">{h ? `entra ${h.entrada} · sai ${h.saida}` : 'sem aula neste turno'}{d.van!.credenciamento[e.id] === 'pendente' ? ' · credenciamento pendente' : ''}</span></span>
                </label>
              );
            })}
          </div>
        ))}
        <button className="btn btn-primario btn-bloco" onClick={() => void salvar()}>Salvar</button>
      </div>
    </Modal>
  );
}

// ---------------- alunos ----------------

function Alunos({ d }: { d: DadosVan }) {
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<Aluno | null>(null);
  const [verArquivados, setVerArquivados] = useState(false);
  const [turno, setTurno] = useState<Turno | 'todos'>('todos');
  const pagMap = new Map(d.pagamentosMes.map((p) => [p.alunoId, p]));
  const lista = d.alunos.filter((a) => a.ativo !== verArquivados && (turno === 'todos' || a.turno === turno) && `${a.nome} ${a.responsavel} ${a.endereco}`.toLowerCase().includes(busca.toLowerCase()));
  const novo = (): Aluno => ({
    id: uid(), vanId: VAN_PRINCIPAL, escolaId: d.van!.escolaIds[0], nome: '', apelido: '', cor: CORES[d.alunos.length % CORES.length],
    serie: '', turno: 'manha', responsavel: '', telefoneResp: '', endereco: '', local: { lat: -23.5925, lng: -46.6300 },
    mensalidade: d.van!.precoPadrao, diaVencimento: 10, ativo: true, criadoEm: agoraIso(),
  });
  return (
    <section className="card">
      <div className="card-topo">
        <label className="busca-mini">🔍 <input placeholder="Buscar aluno, responsável, endereço…" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
        <div className="linha">
          <div className="abas"><a className={!verArquivados ? 'ativo' : ''} onClick={() => setVerArquivados(false)}>Ativos</a><a className={verArquivados ? 'ativo' : ''} onClick={() => setVerArquivados(true)}>Arquivados</a></div>
          <button className="btn btn-primario btn-sm" onClick={() => setEditando(novo())}>＋ Novo aluno</button>
        </div>
      </div>
      <div className="chips-turno" style={{ marginBottom: 12 }}>
        {(['todos', ...TURNOS] as const).map((t) => (
          <button key={t} className={`chip-turno ${turno === t ? 'ativo' : ''}`} onClick={() => setTurno(t)}>
            {t === 'todos' ? 'Todos' : `${ICONE_TURNO[t]} ${NOME_TURNO[t]}`}<small>{d.alunos.filter((a) => a.ativo !== verArquivados && (t === 'todos' || a.turno === t)).length}</small>
          </button>
        ))}
      </div>
      <div className="tabela-wrap">
        <table className="tabela">
          <thead><tr><th>Aluno</th><th>Escola / Turno</th><th>Endereço</th><th>Mensalidade</th><th>Van hoje</th><th /></tr></thead>
          <tbody>
            {lista.map((a) => {
              const p = pagMap.get(a.id);
              return (
                <tr key={a.id}>
                  <td><div className="aluno-cel"><Avatar aluno={a} /><div><strong>{a.nome}</strong><span className="muted small">{a.responsavel} · {a.telefoneResp}</span></div></div></td>
                  <td data-rot="Escola / turno">{d.escolas.find((e) => e.id === a.escolaId)?.nome}<br /><span className="muted small">{ICONE_TURNO[a.turno]} {NOME_TURNO[a.turno]} · {a.serie} · entra {horarioAlvo(d.mapaEscolas.get(a.escolaId), a.turno, 'ida') ?? '—'}</span></td>
                  <td className="small td-largo" data-rot="Endereço">{a.endereco}</td>
                  <td data-rot="Mensalidade">{reais(a.mensalidade)}<br />{p && <span className={`tag ${p.status === 'pago' ? 'tag-verde' : atrasado(p) ? 'tag-vermelho' : 'tag-laranja'}`}>{p.status === 'pago' ? '✓ Pago' : atrasado(p) ? 'Atrasado' : 'Pendente'}</span>}</td>
                  <td data-rot="Van hoje">{a.ativo && <SeletorPlano valor={d.plano(a.id)} onChange={(x) => void definirPresenca(a.id, x, undefined, 'motorista')} />}</td>
                  <td className="td-acoes"><button className="btn btn-claro btn-sm" onClick={() => setEditando(a)}>Editar</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lista.length === 0 && <Vazio ic="👦">Nenhum aluno {verArquivados ? 'arquivado' : 'encontrado'}</Vazio>}
      </div>
      {editando && <FormAluno inicial={editando} d={d} onFechar={() => setEditando(null)} />}
    </section>
  );
}

function FormAluno({ inicial, d, onFechar }: { inicial: Aluno; d: DadosVan; onFechar: () => void }) {
  const [a, setA] = useState(inicial);
  const [valor, setValor] = useState((inicial.mensalidade / 100).toFixed(2).replace('.', ','));
  const [erro, setErro] = useState('');
  const existe = d.alunos.some((x) => x.id === a.id);
  const set = <K extends keyof Aluno>(k: K, v: Aluno[K]) => setA((x) => ({ ...x, [k]: v }));
  const salvar = async () => {
    const c = centavos(valor);
    if (!a.nome.trim() || !a.responsavel.trim() || !a.endereco.trim()) return setErro('Preencha nome, responsável e endereço.');
    if (c === null || c <= 0) return setErro('Mensalidade inválida.');
    await salvarAluno({ ...a, nome: a.nome.trim(), apelido: a.apelido.trim() || a.nome.trim().split(' ')[0], mensalidade: c });
    onFechar();
  };
  return (
    <Modal titulo={existe ? `Editar ${inicial.nome}` : 'Novo aluno'} onFechar={onFechar}>
      <div className="form">
        <div className="dupla">
          <label className="fld"><span>Nome completo</span><input value={a.nome} onChange={(e) => set('nome', e.target.value)} /></label>
          <label className="fld"><span>Apelido (aparece no ranking)</span><input value={a.apelido} onChange={(e) => set('apelido', e.target.value)} /></label>
        </div>
        <div className="dupla">
          <label className="fld"><span>Escola</span><select value={a.escolaId} onChange={(e) => set('escolaId', e.target.value)}>{d.escolas.filter((e) => d.van!.escolaIds.includes(e.id)).map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>
          <div className="dupla">
            <label className="fld"><span>Série</span><input value={a.serie} onChange={(e) => set('serie', e.target.value)} /></label>
            <label className="fld"><span>Turno</span><select value={a.turno} onChange={(e) => set('turno', e.target.value as Turno)}>{TURNOS.map((t) => <option key={t} value={t}>{NOME_TURNO[t]}</option>)}</select></label>
          </div>
        </div>
        <div className="dupla">
          <label className="fld"><span>Responsável</span><input value={a.responsavel} onChange={(e) => set('responsavel', e.target.value)} /></label>
          <label className="fld"><span>WhatsApp do responsável</span><input value={a.telefoneResp} onChange={(e) => set('telefoneResp', e.target.value)} /></label>
        </div>
        <div className="dupla">
          <label className="fld"><span>Mensalidade (R$)</span><input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" /></label>
          <label className="fld"><span>Dia do vencimento</span><input type="number" min={1} max={28} value={a.diaVencimento} onChange={(e) => set('diaVencimento', Math.min(28, Math.max(1, Number(e.target.value) || 1)))} /></label>
        </div>
        <label className="fld"><span>Endereço</span><input value={a.endereco} onChange={(e) => set('endereco', e.target.value)} /></label>
        <div className="fld"><span>Local de embarque — toque no mapa para marcar</span>
          <Mapa3D altura={260} enquadrar={[a.local]} chave="form" marcadores={[{ id: 'p', pos: a.local, tipo: 'pin' }]} onClick={(p) => set('local', p)} />
        </div>
        {erro && <div className="tag tag-vermelho">{erro}</div>}
        <div className="entre">
          {existe ? <button className="btn btn-claro" onClick={async () => { await arquivarAluno(a.id, !inicial.ativo); onFechar(); }}>{inicial.ativo ? '🗄️ Arquivar' : '♻️ Reativar'}</button> : <span />}
          <button className="btn btn-primario" onClick={() => void salvar()}>Salvar</button>
        </div>
      </div>
    </Modal>
  );
}
