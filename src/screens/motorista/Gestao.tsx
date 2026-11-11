import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { Feed, Ranking, usePontosVan } from '../../components/gamificacao';
import { Avatar, Toggle, Vazio } from '../../components/ui';
import { db } from '../../db/db';
import type { Aluno, Pagamento } from '../../db/types';
import { CATALOGO, saldoDe } from '../../lib/gamificacao';
import { haQuanto, hora, linkWhats, mesAtual, nomeMes, primeiroNome, proximoMes, reais, uid } from '../../lib/util';
import { atrasado, desfazerPagamento, enviarMensagem, gerarCobrancas, lerMensagens, pagar } from '../../services/acoes';
import { darPontos, decidirResgate } from '../../services/pontos';
import type { DadosVan } from './dados';

// ---------------- financeiro ----------------

export function Financeiro({ d }: { d: DadosVan }) {
  const meses = useLiveQuery(async () => [...new Set((await db.pagamentos.toArray()).map((p) => p.mes))].sort().reverse()) ?? [];
  const [mes, setMes] = useState(mesAtual());
  const [filtro, setFiltro] = useState<'todos' | 'pendentes' | 'pagos'>('todos');
  const [msg, setMsg] = useState('');
  const pags = useLiveQuery(() => db.pagamentos.where('mes').equals(mes).toArray(), [mes]) ?? [];
  const daVan = pags.filter((p) => d.mapaAlunos.has(p.alunoId));
  const lista = daVan.filter((p) => filtro === 'todos' || (filtro === 'pagos' ? p.status === 'pago' : p.status === 'pendente'))
    .sort((a, b) => Number(a.status === 'pago') - Number(b.status === 'pago') || a.vencimento.localeCompare(b.vencimento));
  const total = daVan.reduce((s, p) => s + p.valor, 0);
  const recebido = daVan.filter((p) => p.status === 'pago').reduce((s, p) => s + p.valor, 0);
  const pct = total ? Math.round((recebido / total) * 100) : 0;
  const prox = proximoMes(meses[0] ?? mesAtual());
  const cobrar = (p: Pagamento, a: Aluno) => linkWhats(a.telefoneResp,
    `Olá, ${primeiroNome(a.responsavel)}! Aqui é o ${d.van!.motorista}. A mensalidade de ${nomeMes(p.mes).toLowerCase()} do(a) ${primeiroNome(a.nome)} (${reais(p.valor)}) ${atrasado(p) ? 'venceu' : 'vence'} em ${p.vencimento.split('-').reverse().slice(0, 2).join('/')}. Dá pra pagar pelo app VanAaki. Obrigado!`);

  return (
    <>
      <section className="kpis">
        <div className="kpi"><div className="ic" style={{ background: 'var(--azul-claro)' }}>🧾</div><div><div className="num">{reais(total)}</div><div className="rot">A receber em {nomeMes(mes).toLowerCase()}</div></div></div>
        <div className="kpi"><div className="ic" style={{ background: 'var(--verde-claro)' }}>✅</div><div><div className="num">{reais(recebido)}</div><div className="rot">Recebido · {pct}%</div></div></div>
        <div className="kpi"><div className="ic" style={{ background: 'var(--vermelho-claro)' }}>⏰</div><div><div className="num">{reais(total - recebido)}</div><div className="rot">Em aberto</div><div className="delta vermelho">{daVan.filter(atrasado).length} atrasado(s)</div></div></div>
        <div className="kpi"><div className="ic" style={{ background: 'var(--amarelo-claro)' }}>📅</div><div style={{ flex: 1 }}>
          <div className="rot">Próximo mês</div>
          <button className="btn btn-primario btn-sm" style={{ marginTop: 6 }} onClick={async () => { const n = await gerarCobrancas(d.van!.id, prox); setMsg(`${n} cobrança(s) de ${nomeMes(prox).toLowerCase()} geradas e famílias avisadas.`); setMes(prox); }}>Gerar {nomeMes(prox).toLowerCase()}</button>
        </div></div>
      </section>
      {msg && <div className="alerta-otim">✅ {msg}</div>}
      <section className="card">
        <div className="card-topo">
          <div className="linha">
            <select className="inp" style={{ width: 'auto' }} value={mes} onChange={(e) => setMes(e.target.value)}>{(meses.includes(mes) ? meses : [mes, ...meses]).map((m) => <option key={m} value={m}>{nomeMes(m)} {m.slice(0, 4)}</option>)}</select>
            <div className="prog" style={{ width: 160 }}><i style={{ width: `${pct}%` }} /></div><strong>{pct}%</strong>
          </div>
          <div className="abas">{(['todos', 'pendentes', 'pagos'] as const).map((f) => <a key={f} className={filtro === f ? 'ativo' : ''} onClick={() => setFiltro(f)}>{f[0].toUpperCase() + f.slice(1)}</a>)}</div>
        </div>
        <div className="tabela-wrap">
          <table className="tabela">
            <thead><tr><th>Aluno</th><th>Vencimento</th><th>Valor</th><th>Situação</th><th style={{ textAlign: 'right' }}>Ações</th></tr></thead>
            <tbody>
              {lista.map((p) => {
                const a = d.mapaAlunos.get(p.alunoId)!;
                return (
                  <tr key={p.id}>
                    <td><div className="aluno-cel"><Avatar aluno={a} tam={36} /><div><strong>{a.nome}</strong><span className="muted small">{a.responsavel}</span></div></div></td>
                    <td>{p.vencimento.split('-').reverse().join('/')}</td>
                    <td><strong>{reais(p.valor)}</strong></td>
                    <td>{p.status === 'pago' ? <span className="tag tag-verde">✓ Pago {p.metodo ? `· ${p.metodo}` : ''}</span> : atrasado(p) ? <span className="tag tag-vermelho">Atrasado</span> : <span className="tag tag-laranja">Pendente</span>}</td>
                    <td style={{ textAlign: 'right' }}>
                      {p.status === 'pago'
                        ? <button className="btn btn-claro btn-sm" onClick={() => void desfazerPagamento(p.id)}>Desfazer</button>
                        : <div className="linha" style={{ justifyContent: 'flex-end' }}>
                            <a className="btn btn-contorno btn-sm" href={cobrar(p, a)} target="_blank" rel="noreferrer">📩 Cobrar</a>
                            <button className="btn btn-verde btn-sm" onClick={() => void pagar(p.id, 'dinheiro', 'motorista')}>Recebi</button>
                          </div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {lista.length === 0 && <Vazio ic="🧾">Nada neste filtro</Vazio>}
        </div>
      </section>
    </>
  );
}

// ---------------- conduta ----------------

export function Conduta({ d }: { d: DadosVan }) {
  const ev = usePontosVan(d.van?.id);
  const [sel, setSel] = useState<string>(d.ativos[0]?.id ?? '');
  const [obs, setObs] = useState('');
  const [feito, setFeito] = useState('');
  const aluno = d.mapaAlunos.get(sel);
  const registrar = async (tipo: string) => {
    if (!aluno) return;
    await darPontos(aluno, tipo, 'motorista', obs.trim() || undefined);
    const t = CATALOGO.find((c) => c.tipo === tipo)!;
    setFeito(`${t.icone} ${t.nome} registrado para ${primeiroNome(aluno.nome)} (${t.pontos > 0 ? '+' : ''}${t.pontos}). ${t.grupo === 'ocorrencia' ? 'Os pais foram avisados.' : ''}`);
    setObs('');
    setTimeout(() => setFeito(''), 4000);
  };
  return (
    <div className="grade-painel">
      <section className="card pilha">
        <h3>Registrar comportamento</h3>
        <div className="aluno-chips">
          {d.ativos.map((a) => (
            <button key={a.id} className={`aluno-chip ${sel === a.id ? 'ativo' : ''}`} onClick={() => setSel(a.id)}><Avatar aluno={a} tam={40} />{primeiroNome(a.nome)}</button>
          ))}
        </div>
        <label className="fld"><span>Observação (opcional — vai para os pais)</span><input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: ajudou a colega a fechar o cinto" /></label>
        <strong className="verde">👍 Elogios</strong>
        <div className="conduta-btns">{CATALOGO.filter((c) => c.grupo === 'elogio').map((c) => <button key={c.tipo} className="pos" onClick={() => void registrar(c.tipo)}>{c.icone} {c.nome}<b className="verde">+{c.pontos}</b></button>)}</div>
        <strong className="vermelho">⚠️ Ocorrências (avisa os pais na hora)</strong>
        <div className="conduta-btns">{CATALOGO.filter((c) => c.grupo === 'ocorrencia').map((c) => <button key={c.tipo} className="neg" onClick={() => void registrar(c.tipo)}>{c.icone} {c.nome}<b className="vermelho">{c.pontos}</b></button>)}</div>
        {feito && <div className="alerta-otim">✅ {feito}</div>}
        <hr className="sep" />
        <h3>Histórico da van</h3>
        <Feed ev={ev} limite={20} alunos={d.mapaAlunos} />
      </section>
      <section className="card">
        <Ranking alunos={d.alunos} ev={ev} nomesReais />
        <hr className="sep" style={{ margin: '14px 0' }} />
        <h3 style={{ marginBottom: 8 }}>Como os pontos funcionam</h3>
        <div className="small muted" style={{ display: 'grid', gap: 4 }}>
          {CATALOGO.filter((c) => c.grupo === 'auto').map((c) => <span key={c.tipo}>{c.icone} {c.nome}: <b>{c.pontos > 0 ? '+' : ''}{c.pontos}</b> (automático)</span>)}
          <span>Os alunos veem o ranking só com apelidos e trocam pontos por prêmios na loja.</span>
        </div>
      </section>
    </div>
  );
}

// ---------------- prêmios ----------------

export function Premios({ d }: { d: DadosVan }) {
  const resgates = useLiveQuery(() => db.resgates.toArray()) ?? [];
  const recompensas = useLiveQuery(() => db.recompensas.where('vanId').equals(d.van!.id).toArray(), [d.van?.id]) ?? [];
  const ev = usePontosVan(d.van?.id);
  const [novo, setNovo] = useState({ icone: '🎉', nome: '', custo: 50 });
  const pend = resgates.filter((r) => r.status === 'pendente');
  const hist = resgates.filter((r) => r.status !== 'pendente').sort((a, b) => (b.decididoEm ?? '').localeCompare(a.decididoEm ?? ''));
  return (
    <div className="grade-painel">
      <section className="card">
        <div className="card-topo"><h3>Pedidos dos alunos</h3><span className="tag tag-amarelo">{pend.length} aguardando</span></div>
        {pend.length === 0 && <Vazio ic="🎁">Nenhum pedido agora</Vazio>}
        {pend.map((r) => {
          const a = d.mapaAlunos.get(r.alunoId);
          if (!a) return null;
          const saldo = saldoDe(ev.filter((e) => e.alunoId === a.id), resgates.filter((x) => x.alunoId === a.id && x.id !== r.id));
          return (
            <div key={r.id} className="premio">
              <div className="ic">{r.icone}</div>
              <div><strong>{a.nome} quer "{r.nome}"</strong><div className="small muted">{r.custo} ⭐ · saldo antes do pedido: {saldo} ⭐ · {haQuanto(r.criadoEm)}</div></div>
              <div className="linha"><button className="btn btn-claro btn-sm" onClick={() => void decidirResgate(r.id, false)}>Recusar</button><button className="btn btn-verde btn-sm" onClick={() => void decidirResgate(r.id, true)}>Aprovar</button></div>
            </div>
          );
        })}
        <hr className="sep" style={{ margin: '14px 0' }} />
        <h3 style={{ marginBottom: 6 }}>Histórico</h3>
        {hist.slice(0, 10).map((r) => <div key={r.id} className="linha-item"><span>{r.icone} {d.mapaAlunos.get(r.alunoId)?.nome} · {r.nome}</span><span className={`tag ${r.status === 'aprovado' ? 'tag-verde' : 'tag-cinza'}`}>{r.status}</span></div>)}
        {!hist.length && <span className="muted small">Nada ainda.</span>}
      </section>
      <section className="card">
        <h3 style={{ marginBottom: 10 }}>Prêmios da loja</h3>
        {recompensas.map((r) => (
          <div key={r.id} className="premio">
            <div className="ic">{r.icone}</div>
            <div><strong>{r.nome}</strong><div className="linha small"><input className="inp" style={{ width: 90, padding: '4px 8px' }} type="number" min={5} value={r.custo} onChange={(e) => void db.recompensas.update(r.id, { custo: Math.max(5, Number(e.target.value) || 5) })} /> ⭐</div></div>
            <Toggle on={r.ativo} onChange={(v) => void db.recompensas.update(r.id, { ativo: v })} titulo="Disponível na loja" />
          </div>
        ))}
        <hr className="sep" style={{ margin: '14px 0' }} />
        <div className="form">
          <strong>Novo prêmio</strong>
          <div className="linha">
            <input className="inp" style={{ width: 60, textAlign: 'center' }} value={novo.icone} onChange={(e) => setNovo({ ...novo, icone: e.target.value })} />
            <input className="inp" style={{ flex: 1, minWidth: 140 }} placeholder="Ex.: Escolher o lanche da sexta" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
            <input className="inp" style={{ width: 90 }} type="number" min={5} value={novo.custo} onChange={(e) => setNovo({ ...novo, custo: Number(e.target.value) || 5 })} />
          </div>
          <button className="btn btn-primario" disabled={!novo.nome.trim()} onClick={async () => { await db.recompensas.add({ id: uid(), vanId: d.van!.id, icone: novo.icone || '🎉', nome: novo.nome.trim(), custo: Math.max(5, novo.custo), ativo: true }); setNovo({ icone: '🎉', nome: '', custo: 50 }); }}>＋ Adicionar prêmio</button>
          <small className="muted">Dica: prêmios que custam pouco e mexem com o dia a dia da van (música, janela, ajudante) engajam mais que brindes caros.</small>
        </div>
      </section>
    </div>
  );
}

// ---------------- mensagens ----------------

export function Mensagens({ d }: { d: DadosVan }) {
  const msgs = useLiveQuery(() => db.mensagens.toArray()) ?? [];
  const [sel, setSel] = useState<string | null>(null);
  const porAluno = d.ativos.map((a) => {
    const m = msgs.filter((x) => x.alunoId === a.id).sort((x, y) => x.criadoEm.localeCompare(y.criadoEm));
    return { a, m, ultima: m[m.length - 1], naoLidas: m.filter((x) => x.de === 'pais' && !x.lida).length };
  }).sort((x, y) => (y.ultima?.criadoEm ?? '').localeCompare(x.ultima?.criadoEm ?? ''));
  const atual = porAluno.find((c) => c.a.id === sel) ?? porAluno.find((c) => c.ultima);
  useEffect(() => { if (atual?.naoLidas) void lerMensagens(atual.a.id, 'motorista'); }, [atual?.a.id, atual?.naoLidas]);
  return (
    <div className="grade-painel" style={{ gridTemplateColumns: '1fr 1.4fr' }}>
      <section className="card lista-conversas">
        <h3 style={{ marginBottom: 8 }}>Conversas</h3>
        {porAluno.map((c) => (
          <div key={c.a.id} className="linha-item" onClick={() => setSel(c.a.id)} style={{ background: atual?.a.id === c.a.id ? 'var(--amarelo-claro)' : undefined, borderRadius: 12, padding: '10px 8px' }}>
            <div className="aluno-cel"><Avatar aluno={c.a} tam={36} /><div><strong>{c.a.responsavel}</strong><span className="muted small">{c.ultima ? c.ultima.texto.slice(0, 40) : `Responsável por ${primeiroNome(c.a.nome)}`}</span></div></div>
            {c.naoLidas > 0 && <span className="tag tag-vermelho">{c.naoLidas}</span>}
          </div>
        ))}
      </section>
      <section className="card">
        {atual ? <Chat alunoId={atual.a.id} eu="motorista" titulo={`${atual.a.responsavel} · ${primeiroNome(atual.a.nome)}`} /> : <Vazio ic="💬">Sem conversas</Vazio>}
      </section>
    </div>
  );
}

export function Chat({ alunoId, eu, titulo }: { alunoId: string; eu: 'pais' | 'motorista'; titulo: string }) {
  const msgs = useLiveQuery(() => db.mensagens.where('alunoId').equals(alunoId).sortBy('criadoEm'), [alunoId]) ?? [];
  const [txt, setTxt] = useState('');
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'nearest' }); if (msgs.some((m) => m.de !== eu && !m.lida)) void lerMensagens(alunoId, eu); }, [msgs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const enviar = async () => { await enviarMensagem(alunoId, eu, txt); setTxt(''); };
  const rapidas = eu === 'pais'
    ? ['Hoje ele vai mais tarde', 'Pode buscar na casa da avó?', 'Obrigado, tio!']
    : ['Bom dia! Estou a caminho 🚐', 'Chegando em 5 min', 'Combinado!'];
  return (
    <div>
      <strong>{titulo}</strong>
      <div className="chat" style={{ marginTop: 10 }}>
        {msgs.length === 0 && <Vazio ic="💬">Comece a conversa</Vazio>}
        {msgs.map((m) => <div key={m.id} className={`bolha ${m.de === eu ? 'minha' : 'dele'}`}>{m.texto}<small>{hora(m.criadoEm)}</small></div>)}
        <div ref={fim} />
      </div>
      <div className="linha" style={{ marginTop: 10 }}>{rapidas.map((r) => <button key={r} className="tag tag-cinza" onClick={() => void enviarMensagem(alunoId, eu, r)}>{r}</button>)}</div>
      <form className="chat-envio" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
        <input className="inp" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Escreva uma mensagem…" />
        <button className="btn btn-primario" disabled={!txt.trim()}>Enviar</button>
      </form>
    </div>
  );
}
