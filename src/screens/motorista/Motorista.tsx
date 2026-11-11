import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import Mapa3D from '../../components/Mapa3D';
import { ShellPainel, type ItemMenu } from '../../components/Shell';
import { Avatar, ir, Modal, Toggle, useNotificacoes, Vazio } from '../../components/ui';
import { db } from '../../db/db';
import { VAN_PRINCIPAL } from '../../db/seed';
import type { Aluno, Turno } from '../../db/types';
import { arquivarAluno, atrasado, definirPresenca, salvarAluno } from '../../services/acoes';
import { centavos, CORES, dataLonga, haQuanto, nomeMes, mesAtual, reais, uid, agoraIso } from '../../lib/util';
import { useDadosVan, type DadosVan } from './dados';
import { Conduta, Financeiro, Mensagens, Premios } from './Gestao';
import { Rota } from './Rota';

export default function Motorista({ aba = 'painel' }: { aba?: string }) {
  const d = useDadosVan(VAN_PRINCIPAL);
  const pedidos = useLiveQuery(() => db.resgates.where('status').equals('pendente').count()) ?? 0;
  const msgs = useLiveQuery(() => db.mensagens.filter((m) => m.de === 'pais' && !m.lida).count()) ?? 0;
  if (d.carregando || !d.van) return <div className="vazio">Carregando…</div>;
  const pend = d.pagamentosMes.filter((p) => p.status === 'pendente').length;

  const menu: ItemMenu[] = [
    { id: 'painel', ic: '📊', nome: 'Painel', grupo: 'Operação' },
    { id: 'rota', ic: '🗺️', nome: 'Rota', grupo: 'Operação', badge: d.ativa ? 1 : 0 },
    { id: 'alunos', ic: '👦', nome: 'Alunos', grupo: 'Operação' },
    { id: 'financeiro', ic: '💰', nome: 'Financeiro', grupo: 'Gestão', badge: pend },
    { id: 'conduta', ic: '⭐', nome: 'Conduta', grupo: 'Gamificação' },
    { id: 'premios', ic: '🎁', nome: 'Prêmios', grupo: 'Gamificação', badge: pedidos },
    { id: 'mensagens', ic: '💬', nome: 'Mensagens', grupo: 'Gestão', badge: msgs },
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
      acoes={aba !== 'rota' && <button className="btn btn-primario" onClick={() => ir('motorista/rota')}>{d.ativa ? '📍 Ver rota ao vivo' : '▶ Iniciar rota'}</button>}>
      {aba === 'painel' && <Painel d={d} pedidos={pedidos} />}
      {aba === 'rota' && <Rota d={d} />}
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
  const vaoHoje = d.ativos.length - d.naoVao.size;
  const v = d.ativa;
  return (
    <>
      <section className="kpis">
        <div className="kpi"><div className="ic" style={{ background: 'var(--azul-claro)' }}>👦</div><div><div className="num">{d.ativos.length}</div><div className="rot">Alunos ativos</div></div></div>
        <div className="kpi"><div className="ic" style={{ background: 'var(--verde-claro)' }}>💰</div><div><div className="num">{pagos.length}<span className="muted" style={{ fontSize: 16 }}>/{d.pagamentosMes.length}</span></div><div className="rot">Pagaram {nomeMes(mesAtual()).toLowerCase()}</div><div className="delta verde">{reais(pagos.reduce((s, p) => s + p.valor, 0))}</div></div></div>
        <div className="kpi" style={{ cursor: 'pointer' }} onClick={() => ir('motorista/financeiro')}><div className="ic" style={{ background: 'var(--vermelho-claro)' }}>⏰</div><div><div className="num">{pend.length}</div><div className="rot">Pendentes</div><div className="delta vermelho">{reais(pend.reduce((s, p) => s + p.valor, 0))} · {pend.filter(atrasado).length} atrasado(s)</div></div></div>
        <div className="kpi"><div className="ic" style={{ background: 'var(--amarelo-claro)' }}>🚐</div><div><div className="num">{vaoHoje}</div><div className="rot">Vão hoje</div><div className="delta laranja">{d.naoVao.size} avisaram que não vão</div></div></div>
      </section>
      <div className="grade-painel">
        <section className="card">
          <div className="card-topo"><h3>Rota de hoje</h3>{v ? <span className="tag tag-verde ao-vivo"><span className="ponto" /> Em andamento</span> : d.ultima ? <span className="tag tag-azul">Última concluída</span> : <span className="tag tag-cinza">Não iniciada</span>}</div>
          {v ? (
            <>
              <p><b>{v.paradas.filter((p) => p.status === 'feito').length}</b> de {v.paradas.length} alunos {v.tipo === 'ida' ? 'embarcados' : 'entregues'} · destino {v.destinoNome}</p>
              <div className="prog" style={{ margin: '12px 0' }}><i style={{ width: `${(v.paradas.filter((p) => p.status !== 'pendente').length / Math.max(1, v.paradas.length)) * 100}%` }} /></div>
              <button className="btn btn-escuro" onClick={() => ir('motorista/rota')}>📍 Abrir a rota ao vivo</button>
            </>
          ) : (
            <>
              <p className="muted">{vaoHoje} alunos confirmados. A ordem das paradas é otimizada na hora de sair.</p>
              <div className="linha" style={{ marginTop: 12 }}><button className="btn btn-primario" onClick={() => ir('motorista/rota')}>▶ Preparar rota</button></div>
            </>
          )}
          <hr className="sep" style={{ margin: '16px 0' }} />
          <h3 style={{ marginBottom: 8 }}>Quem não vai hoje</h3>
          {d.naoVao.size === 0 && <span className="muted">Todos vão 🎉</span>}
          {d.presencas.filter((p) => !p.vai && d.mapaAlunos.has(p.alunoId)).map((p) => {
            const a = d.mapaAlunos.get(p.alunoId)!;
            return <div key={p.id} className="linha-item"><div className="aluno-cel"><Avatar aluno={a} tam={34} /><div><strong>{a.nome}</strong><span className="muted small">{p.motivo ?? 'Aviso da família'} · {haQuanto(p.avisadoEm)}</span></div></div><button className="btn btn-claro btn-sm" onClick={() => void definirPresenca(a.id, true)}>Vai sim</button></div>;
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
    </>
  );
}

// ---------------- alunos ----------------

function Alunos({ d }: { d: DadosVan }) {
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<Aluno | null>(null);
  const [verArquivados, setVerArquivados] = useState(false);
  const pagMap = new Map(d.pagamentosMes.map((p) => [p.alunoId, p]));
  const lista = d.alunos.filter((a) => a.ativo !== verArquivados && `${a.nome} ${a.responsavel} ${a.endereco}`.toLowerCase().includes(busca.toLowerCase()));
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
      <div className="tabela-wrap">
        <table className="tabela">
          <thead><tr><th>Aluno</th><th>Escola / Turno</th><th>Endereço</th><th>Mensalidade</th><th>Vai hoje?</th><th /></tr></thead>
          <tbody>
            {lista.map((a) => {
              const p = pagMap.get(a.id);
              return (
                <tr key={a.id}>
                  <td><div className="aluno-cel"><Avatar aluno={a} /><div><strong>{a.nome}</strong><span className="muted small">{a.responsavel} · {a.telefoneResp}</span></div></div></td>
                  <td>{d.escolas.find((e) => e.id === a.escolaId)?.nome}<br /><span className="muted small">{a.turno === 'manha' ? 'Manhã' : 'Tarde'} · {a.serie}</span></td>
                  <td className="small">{a.endereco}</td>
                  <td>{reais(a.mensalidade)}<br />{p && <span className={`tag ${p.status === 'pago' ? 'tag-verde' : atrasado(p) ? 'tag-vermelho' : 'tag-laranja'}`}>{p.status === 'pago' ? '✓ Pago' : atrasado(p) ? 'Atrasado' : 'Pendente'}</span>}</td>
                  <td>{a.ativo && <Toggle on={!d.naoVao.has(a.id)} onChange={(v) => void definirPresenca(a.id, v, v ? undefined : 'Marcado pelo tio')} />}</td>
                  <td><button className="btn btn-claro btn-sm" onClick={() => setEditando(a)}>Editar</button></td>
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
            <label className="fld"><span>Turno</span><select value={a.turno} onChange={(e) => set('turno', e.target.value as Turno)}><option value="manha">Manhã</option><option value="tarde">Tarde</option></select></label>
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
