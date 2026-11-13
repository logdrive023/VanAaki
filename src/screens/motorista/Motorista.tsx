import { useLiveQuery } from 'dexie-react-hooks';
import { CuidadosLinha, EditarCuidados } from '../../components/cuidados';
import { useState } from 'react';
import Mapa3D from '../../components/Mapa3D';
import { MenuMais, ShellPainel, type ItemMenu } from '../../components/Shell';
import { Agenda } from './Agenda';
import { Configuracoes } from './Configuracoes';
import { Economia } from './Economia';
import { MinhasEscolas } from './Escolas';
import { AssistenteAluno } from './AssistenteAluno';
import { convite } from './convite';
import { ConversasRecados } from '../../components/recados';
import { planejarTrecho } from './plano';
import { SeletorPlano } from '../../components/presenca';
import { Avatar, ir, Kpi, Modal, saudacao, useNotificacoes, Vazio } from '../../components/ui';
import { I } from '../../components/Icone';
import { Conformidade } from './Conformidade';
import { db } from '../../db/db';
import { useEu } from '../../api/sync';
import { BuscaEndereco } from '../../components/formularios';
import { TURNOS, type Aluno, type Turno, type TurnoVan } from '../../db/types';
import { horarioAlvo, NOME_TURNO, nomePlano, planoDe } from '../../lib/turnos';
import { arquivarAluno, atrasado, definirPresenca, salvarAluno, salvarVan } from '../../services/acoes';
import { centavos, dataLonga, haQuanto, hora, nomeMes, mesAtual, primeiroNome, reais } from '../../lib/util';
import { useDadosVan, type DadosVan } from './dados';
import { Conduta, Financeiro, Mensagens, Premios } from './Gestao';
import { Rota } from './Rota';

export default function Motorista({ aba = 'painel', extra }: { aba?: string; extra?: string }) {
  const eu = useEu();
  const vanId = eu?.vanIds[0] ?? '';
  const d = useDadosVan(vanId);
  const pedidos = useLiveQuery(() => db.resgates.where('status').equals('pendente').count()) ?? 0;
  const msgs = useLiveQuery(async () => (await db.mensagens.filter((m) => m.de === 'pais' && !m.lida).count()) + (await db.recados.filter((r) => r.de === 'escola' && !r.lida).count())) ?? 0;
  const [modal, setModal] = useState<'van' | 'turnos' | null>(null);
  if (d.carregando || !d.van) return <div className="carregando"><div className="giro" /></div>;
  const pend = d.pagamentosMes.filter((p) => p.status === 'pendente' && !p.informadoEm).length;
  const informados = d.pagamentosMes.filter((p) => p.status === 'pendente' && p.informadoEm).length;

  // mobile first: 4 abas para o dia a dia; o resto fica em "Mais"
  const menu: ItemMenu[] = [
    { id: 'painel', ic: 'painel', nome: 'Hoje', grupo: 'Dia a dia', principal: true },
    { id: 'agenda', ic: 'calendario', nome: 'Agenda', grupo: 'Dia a dia', principal: true },
    { id: 'rota', ic: 'rota', nome: 'Rota', grupo: 'Dia a dia', badge: d.ativa ? 1 : 0, principal: true },
    { id: 'alunos', ic: 'alunos', nome: 'Alunos', grupo: 'Dia a dia', principal: true },
    { id: 'financeiro', ic: 'financeiro', nome: 'Financeiro', desc: 'Mensalidades e cobranças', grupo: 'Gestão', badge: pend + informados },
    { id: 'mensagens', ic: 'mensagem', nome: 'Mensagens', desc: 'Famílias e escolas', grupo: 'Gestão', badge: msgs },
    { id: 'economia', ic: 'combustivel', nome: 'Economia', desc: 'Combustível, km e se a rota compensa', grupo: 'Gestão' },
    { id: 'conformidade', ic: 'escudo', nome: 'Fiscalização', desc: 'Trajetos guardados e relatórios', grupo: 'Gestão' },
    ...(d.gamificacao ? [
      { id: 'conduta', ic: 'estrela', nome: 'Conduta', desc: 'Elogios e ocorrências', grupo: 'Extras' },
      { id: 'premios', ic: 'premio', nome: 'Prêmios', desc: 'Loja de prêmios dos alunos', grupo: 'Extras', badge: pedidos },
    ] as ItemMenu[] : []),
    { id: 'configuracoes', ic: 'config', nome: 'Configurações', desc: 'Pix, avisos, rota e extras', grupo: 'Conta' },
  ];
  const titulos: Record<string, string> = {
    painel: `${saudacao()}, ${primeiroNome(d.van.motorista.replace(/^(tio|tia)\s+/i, ''))}`, agenda: 'Agenda', mais: 'Mais', configuracoes: 'Configurações', rota: d.ativa ? 'Rota em andamento' : 'Rota do dia', alunos: 'Alunos',
    financeiro: 'Financeiro', conduta: 'Conduta e ranking', premios: 'Loja de prêmios', mensagens: 'Mensagens',
    conformidade: 'Fiscalização e trajetos', economia: 'Economia da rota',
  };
  const perfil = (
    <div className="perfil-side">
      <Avatar nome={d.van.motorista} cor="#6C5CE7" />
      <div><strong>{d.van.motorista}</strong><small>{d.van.modelo} · {d.van.placa}</small></div>
    </div>
  );
  return (
    <ShellPainel base="motorista" menu={menu} atual={aba} perfil={perfil} filtro={{ para: 'motorista', vanId }}
      titulo={titulos[aba] ?? 'Painel'} sub={dataLonga()}
      acoes={aba !== 'rota' && aba !== 'painel' && aba !== 'agenda' && <button className="btn btn-primario" onClick={() => ir('motorista/rota')}><I n={d.ativa ? 'navegar' : 'rota'} /><span className="esconde-celular">{d.ativa ? 'Ver rota ao vivo' : 'Iniciar rota'}</span><span className="so-celular">Rota</span></button>}>
      {aba === 'painel' && <Painel d={d} pedidos={pedidos} onMinhaVan={() => setModal('van')} onTurnos={() => setModal('turnos')} />}
      {aba === 'agenda' && <Agenda d={d} />}
      {aba === 'mais' && <MenuMais base="motorista" menu={menu} />}
      {aba === 'configuracoes' && <Configuracoes d={d} onMinhaVan={() => setModal('van')} onTurnos={() => setModal('turnos')} />}
      {modal === 'turnos' && <MinhasEscolas d={d} onFechar={() => setModal(null)} />}
      {modal === 'van' && <MinhaVan d={d} onFechar={() => setModal(null)} />}
      {aba === 'rota' && <Rota d={d} turnoInicial={extra as Turno | undefined} />}
      {aba === 'alunos' && <Alunos d={d} />}
      {aba === 'financeiro' && <Financeiro d={d} />}
      {aba === 'conduta' && d.gamificacao && <Conduta d={d} />}
      {aba === 'premios' && d.gamificacao && <Premios d={d} />}
      {aba === 'mensagens' && <MensagensTio d={d} />}
      {aba === 'conformidade' && <Conformidade d={d} />}
      {aba === 'economia' && <Economia d={d} />}
    </ShellPainel>
  );
}

// ---------------- painel ----------------

function Painel({ d, pedidos, onMinhaVan, onTurnos }: { d: DadosVan; pedidos: number; onMinhaVan: () => void; onTurnos: () => void }) {
  const notifs = useNotificacoes({ para: 'motorista', vanId: d.van!.id });
  const setEditarTurnos = (_: boolean) => onTurnos();
  const pagos = d.pagamentosMes.filter((p) => p.status === 'pago');
  const pend = d.pagamentosMes.filter((p) => p.status === 'pendente');
  const configurado = d.van!.turnos.some((t) => t.ativo && t.escolaIds.length) && d.ativos.length > 0;
  return (
    <>
      {configurado ? <ProximaRota d={d} /> : <PrimeirosPassos d={d} onMinhaVan={onMinhaVan} onTurnos={onTurnos} />}
      {configurado && (
      <section className="kpis">
        <Kpi ic="alunos" rot="Alunos ativos" num={d.ativos.length} sub={`${d.van!.turnos.filter((t) => t.ativo).length} turno(s) de trabalho`} />
        <Kpi ic="check" rot={`Pagaram ${nomeMes(mesAtual()).toLowerCase()}`} num={<>{pagos.length}<span className="muted">/{d.pagamentosMes.length}</span></>} sub={reais(pagos.reduce((s, p) => s + p.valor, 0))} subCls="verde" />
        <Kpi ic="relogio" rot="Mensalidades em aberto" num={pend.length} sub={`${reais(pend.reduce((s, p) => s + p.valor, 0))} · ${pend.filter(atrasado).length} atrasada(s)`} subCls={pend.some(atrasado) ? 'vermelho' : 'muted'} onClick={() => ir('motorista/financeiro')} />
        <Kpi ic="calendario" rot="Combinados de hoje" num={d.avisos.length} sub={d.avisos.length ? 'mudanças na ida ou na volta' : 'todos vão e voltam'} />
      </section>
      )}
      <div className="grade-painel">
        <section className="card">
          <div className="card-topo"><h3>Turnos de hoje</h3><button className="btn btn-fantasma btn-sm" onClick={() => ir('motorista/agenda')}><I n="calendario" />Agenda</button></div>
          <div className="pilha">
            {d.van!.turnos.filter((t) => t.ativo).map((t) => <CartaoTurno key={t.turno} d={d} t={t} />)}
            {!d.van!.turnos.some((t) => t.ativo && t.escolaIds.length) && <span className="muted small">Nenhum turno configurado. <button type="button" style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => setEditarTurnos(true)}>Adicionar escola</button></span>}
          </div>
          <hr className="sep" style={{ margin: '16px 0' }} />
          <h3 style={{ marginBottom: 8 }}>Combinados de hoje</h3>
          {d.avisos.length === 0 && <span className="muted small">Todo mundo vai e volta de van hoje.</span>}
          {d.avisos.map((p) => {
            const a = d.mapaAlunos.get(p.alunoId)!;
            const pl = nomePlano(planoDe(p));
            return (
              <div key={p.id} className="linha-item">
                <div className="aluno-cel"><Avatar aluno={a} tam={34} /><div><strong>{a.nome}</strong><span className="muted small">{pl.nome} · {pl.desc}{p.motivo ? ` · ${p.motivo}` : ''} · {haQuanto(p.avisadoEm)}</span></div></div>
                <SeletorPlano valor={planoDe(p)} onChange={(x) => void definirPresenca(a.id, x, undefined, 'motorista')} />
              </div>
            );
          })}
        </section>
        <section className="card">
          <div className="card-topo"><h3>Últimos avisos</h3>{pedidos > 0 && <button className="tag tag-amarelo" onClick={() => ir('motorista/premios')}><I n="premio" />{pedidos} pedido(s) de prêmio</button>}</div>
          {notifs.length === 0 && <Vazio ic="semSino">Sem avisos</Vazio>}
          {notifs.slice(0, 7).map((n) => (
            <div key={n.id} className="linha-item"><div className="aluno-cel"><span className="nota-ic">{n.icone}</span><div><strong>{n.titulo}</strong><span className="muted small">{n.texto} · {haQuanto(n.criadoEm)}</span></div></div></div>
          ))}
        </section>
      </div>
    </>
  );
}

/** Mensagens do tio: com as famílias (por aluno) e com as escolas (recados da portaria). */
function MensagensTio({ d }: { d: DadosVan }) {
  const [qual, setQual] = useState<'familias' | 'escolas'>('familias');
  const naoFam = useLiveQuery(() => db.mensagens.filter((m) => m.de === 'pais' && !m.lida).count()) ?? 0;
  const naoEsc = useLiveQuery(() => db.recados.filter((r) => r.de === 'escola' && !r.lida).count()) ?? 0;
  const escolas = d.escolas.filter((e) => d.van!.escolaIds.includes(e.id));
  return (
    <div className="pilha">
      <div className="seg" style={{ maxWidth: 420 }}>
        <button type="button" className={qual === 'familias' ? 'ativo' : ''} onClick={() => setQual('familias')}><I n="casa" />Famílias{naoFam ? ` (${naoFam})` : ''}</button>
        <button type="button" className={qual === 'escolas' ? 'ativo' : ''} onClick={() => setQual('escolas')}><I n="escola" />Escolas{naoEsc ? ` (${naoEsc})` : ''}</button>
      </div>
      {qual === 'familias' ? <Mensagens d={d} /> : (
        <ConversasRecados eu="motorista" conversas={escolas.map((e) => ({
          vanId: d.van!.id, escolaId: e.id, nome: e.nome,
          detalhe: TURNOS.filter((t) => e.horarios[t]).map((t) => `${NOME_TURNO[t]} ${e.horarios[t]!.entrada}–${e.horarios[t]!.saida}`).join(' · '),
        }))} />
      )}
    </div>
  );
}

/** O que vem agora: a rota em andamento ou o próximo trecho de hoje com a hora de sair (um toque para iniciar). */
function ProximaRota({ d }: { d: DadosVan }) {
  if (d.ativa) {
    const v = d.ativa;
    const casas = v.paradas.filter((p) => p.tipo === 'aluno');
    return (
      <section className="proxima">
        <div>
          <span className="px-rot">Rota em andamento</span>
          <h2>{v.tipo === 'ida' ? 'Ida' : 'Volta'} da {NOME_TURNO[v.turno].toLowerCase()}</h2>
          <div className="px-info" style={{ marginTop: 10 }}><span className="tag ao-vivo"><span className="ponto" />ao vivo</span><span className="tag">{casas.filter((p) => p.status !== 'pendente').length} de {casas.length} paradas</span></div>
        </div>
        <button className="btn btn-primario btn-grande" onClick={() => ir('motorista/rota')}><I n="navegar" />Abrir a rota</button>
      </section>
    );
  }
  const hojePres = (id: string) => d.presencaPorAluno.get(id);
  const feitos = (t: Turno, tipo: 'ida' | 'volta') => d.concluidas.some((v) => v.turno === t && v.tipo === tipo);
  const ordem = TURNOS.flatMap((t) => (['ida', 'volta'] as const).map((tipo) => ({ t, tipo })))
    .filter(({ t }) => d.van!.turnos.some((x) => x.turno === t && x.ativo && x.escolaIds.length))
    .filter(({ t, tipo }) => !feitos(t, tipo));
  const prox = ordem.map(({ t, tipo }) => planejarTrecho(d, t, tipo, hojePres)).find((p) => p.vao.length);
  if (!prox) {
    return (
      <section className="proxima">
        <div className="proxima-fim"><span className="entrar-ic"><I n="check" /></span><div><span className="px-rot">Dia concluído</span><h2>Todo mundo entregue. Bom descanso!</h2></div></div>
        <button className="btn btn-claro" onClick={() => ir('motorista/agenda')}><I n="calendario" />Ver amanhã</button>
      </section>
    );
  }
  const h = prox.horario;
  return (
    <section className="proxima">
      <div>
        <span className="px-rot">Próxima rota · {prox.tipo === 'ida' ? 'ida' : 'volta'} da {NOME_TURNO[prox.turno].toLowerCase()}</span>
        <div className="px-hora" style={{ marginTop: 10 }}>{h.sairAs ?? '—'}<small>{prox.tipo === 'ida' ? 'saia da garagem até' : 'esteja na 1ª escola'}</small></div>
        <div className="px-info" style={{ marginTop: 12 }}>
          <span className="tag"><I n="alunos" />{prox.vao.length} vão{prox.fora.length ? ` · ${prox.fora.length} fora` : ''}</span>
          <span className="tag"><I n="escola" />{prox.escolas.length} escola(s)</span>
          <span className="tag"><I n="bandeira" />fim ~{h.fimAs}</span>
          {!!h.atrasadoMin && <span className="tag atraso"><I n="alerta" />{h.atrasadoMin} min atrasado</span>}
        </div>
      </div>
      <div className="px-acoes">
        <button className="btn btn-primario btn-grande" onClick={() => ir(`motorista/rota/${prox.turno}`)}><I n="navegar" />Começar</button>
        <button className="btn btn-claro btn-grande" onClick={() => ir('motorista/agenda')} aria-label="Ver na agenda"><I n="calendario" /></button>
      </div>
    </section>
  );
}

/** Conta nova: o caminho até a primeira rota, passo a passo. */
function PrimeirosPassos({ d, onMinhaVan, onTurnos }: { d: DadosVan; onMinhaVan: () => void; onTurnos: () => void }) {
  const passos = [
    { ok: d.van!.turnos.some((t) => t.ativo && t.escolaIds.length), t: 'Suas escolas', s: 'Qual escola e que horas entra e sai. O app monta o resto.', acao: onTurnos, rot: 'Adicionar' },
    { ok: d.ativos.length > 0, t: 'Alunos', s: 'Endereço de cada um, conferido no mapa.', acao: () => ir('motorista/alunos'), rot: 'Adicionar' },
    { ok: d.van!.garagem.lat !== 0 && d.ativos.length > 0, t: 'Garagem', s: 'De onde a van sai de manhã.', acao: onMinhaVan, rot: 'Marcar' },
    { ok: d.ativos.some((a) => a.familiaConectada), t: 'Convidar as famílias', s: 'Um toque manda o convite pelo WhatsApp.', acao: () => ir('motorista/alunos'), rot: 'Convidar' },
    { ok: !!d.van!.config?.pixChave, t: 'Receber pelo Pix (opcional)', s: 'As famílias pagam direto na sua chave.', acao: () => ir('motorista/configuracoes'), rot: 'Configurar' },
  ];
  const feitos = passos.filter((p) => p.ok).length;
  return (
    <section className="card">
      <div className="entre"><h3>Vamos deixar sua van pronta</h3><span className="muted small">{feitos} de {passos.length}</span></div>
      <div className="barra-onb"><i style={{ width: `${(feitos / passos.length) * 100}%` }} /></div>
      {passos.map((p, i) => (
        <div key={p.t} className={`onb-item ${p.ok ? 'ok' : ''}`}>
          <span className="onb-n">{p.ok ? <I n="check" /> : i + 1}</span>
          <div><strong>{p.t}</strong><small>{p.s}</small></div>
          {!p.ok && <button className="btn btn-claro btn-sm" onClick={p.acao}>{p.rot}</button>}
        </div>
      ))}
    </section>
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
      : <span className="tag"><I n="check" />{hora(v.concluidaEm)}</span>;
    return <div className="trecho-status"><span><I n={tipo === 'ida' ? 'escola' : 'casa'} />{tipo === 'ida' ? 'Ida' : 'Volta'} · {n} aluno{n === 1 ? '' : 's'}</span>{st}</div>;
  };
  return (
    <div className="turno-card">
      <div className="entre"><span className="turno-titulo"><I n={t.turno} />{NOME_TURNO[t.turno]}</span><button className={`btn ${d.ativa?.turno === t.turno ? 'btn-primario' : 'btn-claro'} btn-sm`} onClick={() => ir(`motorista/rota/${t.turno}`)}><I n={d.ativa?.turno === t.turno ? 'navegar' : 'rota'} />{d.ativa?.turno === t.turno ? 'Ao vivo' : 'Rota'}</button></div>
      <div className="escolas-turno">
        {t.escolaIds.map((id) => { const e = d.mapaEscolas.get(id); const h = e?.horarios[t.turno]; return <span key={id} className="tag"><I n="escola" />{e?.nome}{h ? ` · ${h.entrada}–${h.saida}` : ''}</span>; })}
      </div>
      {trecho('ida', nIda)}
      {trecho('volta', nVolta)}
    </div>
  );
}

// ---------------- alunos ----------------

function Alunos({ d }: { d: DadosVan }) {
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<Aluno | null>(null);
  const [novoAberto, setNovo] = useState(false);
  const [cuidados, setCuidados] = useState<Aluno | null>(null);
  const [verArquivados, setVerArquivados] = useState(false);
  const [turno, setTurno] = useState<Turno | 'todos'>('todos');
  const pagMap = new Map(d.pagamentosMes.map((p) => [p.alunoId, p]));
  const lista = d.alunos.filter((a) => a.ativo !== verArquivados && (turno === 'todos' || a.turno === turno) && `${a.nome} ${a.responsavel} ${a.endereco}`.toLowerCase().includes(busca.toLowerCase()));
  return (
    <section className="card">
      <div className="card-topo">
        <label className="busca-mini"><I n="busca" /><input placeholder="Buscar aluno, responsável, endereço…" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
        <div className="linha">
          <div className="abas"><button type="button" className={!verArquivados ? 'ativo' : ''} onClick={() => setVerArquivados(false)}>Ativos</button><button type="button" className={verArquivados ? 'ativo' : ''} onClick={() => setVerArquivados(true)}>Arquivados</button></div>
          <button className="btn btn-primario btn-sm" onClick={() => setNovo(true)}><I n="mais" />Novo aluno</button>
        </div>
      </div>
      <div className="chips-turno" style={{ marginBottom: 12 }}>
        {(['todos', ...TURNOS] as const).map((t) => (
          <button key={t} className={`chip-turno ${turno === t ? 'ativo' : ''}`} onClick={() => setTurno(t)}>
            {t !== 'todos' && <I n={t} />}{t === 'todos' ? 'Todos' : NOME_TURNO[t]}<small>{d.alunos.filter((a) => a.ativo !== verArquivados && (t === 'todos' || a.turno === t)).length}</small>
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
                  <td><div className="aluno-cel"><Avatar aluno={a} /><div style={{ minWidth: 0 }}><strong>{a.nome}</strong><span className="muted small">{a.responsavel} · {a.familiaConectada ? <span className="verde">família no app</span> : <a href={convite(a, d.van!.motorista)} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>convidar família</a>}</span><CuidadosLinha a={a} onEditar={() => setCuidados(a)} /></div></div></td>
                  <td data-rot="Escola / turno">{d.escolas.find((e) => e.id === a.escolaId)?.nome}<br /><span className="muted small">{NOME_TURNO[a.turno]} · {a.serie} · entra {horarioAlvo(d.mapaEscolas.get(a.escolaId), a.turno, 'ida') ?? '—'}</span></td>
                  <td className="small td-largo" data-rot="Endereço">{a.endereco}</td>
                  <td data-rot="Mensalidade">{reais(a.mensalidade)}<br />{p && <span className={`tag ${p.status === 'pago' ? 'tag-verde' : atrasado(p) ? 'tag-vermelho' : 'tag-laranja'}`}>{p.status === 'pago' ? 'Pago' : atrasado(p) ? 'Atrasado' : 'Pendente'}</span>}</td>
                  <td data-rot="Van hoje">{a.ativo && <SeletorPlano valor={d.plano(a.id)} onChange={(x) => void definirPresenca(a.id, x, undefined, 'motorista')} />}</td>
                  <td className="td-acoes"><button className="btn btn-claro btn-sm" onClick={() => setEditando(a)}>Editar</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lista.length === 0 && <Vazio ic="alunos">Nenhum aluno {verArquivados ? 'arquivado' : 'encontrado'}</Vazio>}
      </div>
      {cuidados && <EditarCuidados a={cuidados} porTio onFechar={() => setCuidados(null)} />}
      {editando && <FormAluno inicial={editando} d={d} onFechar={() => setEditando(null)} />}
      {novoAberto && <AssistenteAluno d={d} onFechar={() => setNovo(false)} />}
    </section>
  );
}

function FormAluno({ inicial, d, onFechar }: { inicial: Aluno; d: DadosVan; onFechar: () => void }) {
  const [a, setA] = useState(inicial);
  const [valor, setValor] = useState((inicial.mensalidade / 100).toFixed(2).replace('.', ','));
  const [erro, setErro] = useState('');
  const existe = d.alunos.some((x) => x.id === a.id);
  const escolasVan = d.escolas.filter((e) => d.van!.escolaIds.includes(e.id));
  const set = <K extends keyof Aluno>(k: K, v: Aluno[K]) => setA((x) => ({ ...x, [k]: v }));
  const salvar = async () => {
    const c = centavos(valor);
    if (!a.nome.trim() || !a.responsavel.trim() || !a.endereco.trim()) return setErro('Falta o nome do aluno, do pai ou da mãe, ou o endereço.');
    if (c === null || c <= 0) return setErro('Mensalidade inválida.');
    try {
      await salvarAluno({ ...a, nome: a.nome.trim(), apelido: a.apelido.trim() || a.nome.trim().split(' ')[0], mensalidade: c }, !existe);
      onFechar();
    } catch (e) { setErro((e as Error).message); }
  };
  return (
    <Modal titulo={existe ? `Editar ${inicial.nome}` : 'Novo aluno'} onFechar={onFechar}>
      <div className="form">
        <label className="fld"><span>Nome do aluno</span><input value={a.nome} onChange={(e) => set('nome', e.target.value)} autoFocus={!existe} /></label>
        <div className="dupla">
          <label className="fld"><span>Escola</span><select value={a.escolaId} onChange={(e) => set('escolaId', e.target.value)}>{escolasVan.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>
          <label className="fld"><span>Turno</span><select value={a.turno} onChange={(e) => set('turno', e.target.value as Turno)}>{TURNOS.filter((t) => d.mapaEscolas.get(a.escolaId)?.horarios[t] || a.turno === t).map((t) => <option key={t} value={t}>{NOME_TURNO[t]}</option>)}</select></label>
        </div>
        <div className="dupla">
          <label className="fld"><span>Nome do pai ou da mãe</span><input value={a.responsavel} onChange={(e) => set('responsavel', e.target.value)} /></label>
          <label className="fld"><span>WhatsApp dele(a)</span><input value={a.telefoneResp} onChange={(e) => set('telefoneResp', e.target.value)} inputMode="tel" placeholder="11 90000-0000" /></label>
        </div>
        <div className="fld"><span>Onde a van busca</span>
          <BuscaEndereco valor={a.endereco} onTexto={(t) => set('endereco', t)} onLocal={(p) => set('local', p)} />
        </div>
        <div className="fld"><span>Confira no mapa (toque para ajustar o portão)</span>
          <Mapa3D altura={220} enquadrar={[a.local]} chave={`form-${a.local.lat.toFixed(5)}`} marcadores={[{ id: 'p', pos: a.local, tipo: 'pin' }]} onClick={(p) => set('local', p)} />
        </div>
        <details className="opcoes">
          <summary><I n="config" />Mais detalhes (opcional) · {reais(centavos(valor) ?? a.mensalidade)}, vence dia {a.diaVencimento}<I n="chevron" /></summary>
          <div>
            <div className="dupla">
              <label className="fld"><span>Mensalidade (R$)</span><input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" /></label>
              <label className="fld"><span>Dia do vencimento</span><input type="number" min={1} max={28} value={a.diaVencimento} onChange={(e) => set('diaVencimento', Math.min(28, Math.max(1, Number(e.target.value) || 1)))} /></label>
            </div>
            <div className="dupla">
              <label className="fld"><span>Série</span><input value={a.serie} onChange={(e) => set('serie', e.target.value)} placeholder="ex.: 4º ano" /></label>
              <label className="fld"><span>Apelido (ranking)</span><input value={a.apelido} onChange={(e) => set('apelido', e.target.value)} placeholder={a.nome.split(' ')[0]} /></label>
            </div>
          </div>
        </details>
        {existe && inicial.codigoFamilia && (
          <div className="convite-box">
            <div><strong>Convite da família</strong><span className="muted small">{inicial.familiaConectada ? 'A família já está no app.' : 'Mande pelo WhatsApp: a família entra em "Família → Primeiro acesso" com o código.'}</span></div>
            <span className="codigo">{inicial.codigoFamilia}</span>
            <a className="btn btn-escuro btn-sm" href={convite(inicial, d.van!.motorista)} target="_blank" rel="noreferrer"><I n="enviar" />Enviar no WhatsApp</a>
          </div>
        )}
        {erro && <div className="aviso-erro">{erro}</div>}
        <div className="entre">
          {existe ? <button className="btn btn-claro" onClick={async () => { await arquivarAluno(a.id, !inicial.ativo); onFechar(); }}>{inicial.ativo ? 'Arquivar' : 'Reativar'}</button> : <span />}
          <button className="btn btn-primario" onClick={() => void salvar()}>Salvar</button>
        </div>
      </div>
    </Modal>
  );
}

/** Dados da van e o ponto da garagem (de onde sai a ida e onde termina a volta). */
function MinhaVan({ d, onFechar }: { d: DadosVan; onFechar: () => void }) {
  const v = d.van!;
  const [f, setF] = useState({ nome: v.nome, motorista: v.motorista, telefone: v.telefone, placa: v.placa, modelo: v.modelo, vagas: v.vagas });
  const [preco, setPreco] = useState((v.precoPadrao / 100).toFixed(2).replace('.', ','));
  const [garagem, setGaragem] = useState(v.garagem);
  const [end, setEnd] = useState('');
  const [erro, setErro] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: k === 'vagas' ? Number(e.target.value) || 0 : e.target.value }));
  const salvar = async () => {
    const c = centavos(preco);
    if (c === null || c <= 0) return setErro('Mensalidade padrão inválida.');
    try { await salvarVan({ ...f, precoPadrao: c, garagem }); onFechar(); } catch (e) { setErro((e as Error).message); }
  };
  return (
    <Modal titulo="Minha van" onFechar={onFechar}>
      <div className="form">
        <div className="dupla">
          <label className="fld"><span>Nome da van (aparece para as famílias)</span><input value={f.nome} onChange={set('nome')} /></label>
          <label className="fld"><span>Seu nome</span><input value={f.motorista} onChange={set('motorista')} /></label>
        </div>
        <div className="dupla">
          <label className="fld"><span>WhatsApp</span><input value={f.telefone} onChange={set('telefone')} inputMode="tel" /></label>
          <label className="fld"><span>Placa</span><input value={f.placa} onChange={set('placa')} /></label>
        </div>
        <div className="dupla">
          <label className="fld"><span>Modelo</span><input value={f.modelo} onChange={set('modelo')} /></label>
          <div className="dupla">
            <label className="fld"><span>Mensalidade padrão</span><input value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" /></label>
            <label className="fld"><span>Vagas livres</span><input type="number" min={0} value={f.vagas} onChange={set('vagas')} /></label>
          </div>
        </div>
        <div className="fld"><span>Garagem (onde a van sai e volta)</span><BuscaEndereco valor={end} onTexto={setEnd} onLocal={setGaragem} /></div>
        <Mapa3D altura={220} enquadrar={[garagem]} chave={`gar-${garagem.lat.toFixed(5)}`} marcadores={[{ id: 'g', pos: garagem, tipo: 'garagem', rotulo: 'Garagem' }]} onClick={setGaragem} />
        {erro && <div className="aviso-erro">{erro}</div>}
        <button className="btn btn-primario btn-bloco" onClick={() => void salvar()}>Salvar</button>
      </div>
    </Modal>
  );
}
