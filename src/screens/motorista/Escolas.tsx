import { useMemo, useState } from 'react';
import { Transicao } from '../../components/Transicao';
import { BuscaEndereco } from '../../components/formularios';
import { I } from '../../components/Icone';
import Mapa3D from '../../components/Mapa3D';
import { Modal } from '../../components/ui';
import { TURNOS, type Escola, type Horario, type LatLng, type Turno, type TurnoVan } from '../../db/types';
import { NOME_TURNO } from '../../lib/turnos';
import { salvarEscola, salvarTurnos } from '../../services/acoes';
import type { DadosVan } from './dados';

/** Horário que já vem marcado (o tio só ajusta se for diferente). */
const PADRAO: Record<Turno, Horario> = { manha: { entrada: '07:00', saida: '12:00' }, tarde: { entrada: '13:00', saida: '18:00' }, noite: { entrada: '19:00', saida: '22:30' } };
const PERGUNTA: Record<Turno, string> = { manha: 'De manhã', tarde: 'À tarde', noite: 'À noite' };

type Periodos = Record<Turno, { on: boolean; entrada: string; saida: string }>;

/** Turnos da van recalculados: a escola entra nos períodos marcados e sai dos outros. Turno sem escola fica desligado. */
function turnosCom(van: NonNullable<DadosVan['van']>, escolaId: string, periodos: Partial<Record<Turno, boolean>>): TurnoVan[] {
  return TURNOS.map((t) => {
    const atual = van.turnos.find((x) => x.turno === t) ?? { turno: t, ativo: false, escolaIds: [] };
    const outras = atual.escolaIds.filter((id) => id !== escolaId);
    const escolaIds = periodos[t] ? [...outras, escolaId] : outras;
    return { turno: t, ativo: escolaIds.length > 0, escolaIds };
  });
}

/**
 * "Minhas escolas": o tio não precisa entender o que é "turno".
 * Ele diz quais escolas atende e em que período; o app monta os turnos sozinho.
 */
export function MinhasEscolas({ d, onFechar }: { d: DadosVan; onFechar: () => void }) {
  const van = d.van!;
  const minhas = d.escolas.filter((e) => van.escolaIds.includes(e.id));
  const [assistente, setAssistente] = useState<Escola | 'nova' | null>(minhas.length ? null : 'nova');
  const [erro, setErro] = useState('');
  const periodosDe = (e: Escola) => TURNOS.filter((t) => van.turnos.some((x) => x.turno === t && x.escolaIds.includes(e.id)));
  const remover = async (e: Escola) => {
    if (!confirm(`Parar de atender ${e.nome}? Os alunos dessa escola continuam cadastrados.`)) return;
    try { await salvarTurnos(turnosCom(van, e.id, {})); } catch (x) { setErro((x as Error).message); }
  };
  const ativos = TURNOS.filter((t) => van.turnos.some((x) => x.turno === t && x.ativo && x.escolaIds.length));

  if (assistente) return <Assistente d={d} escola={assistente === 'nova' ? undefined : assistente} onFechar={() => (minhas.length ? setAssistente(null) : onFechar())} onPronto={() => setAssistente(null)} />;
  return (
    <Modal titulo="Minhas escolas" onFechar={onFechar}>
      <div className="pilha" style={{ gap: 12 }}>
        <p className="muted small">As escolas que você atende e em que período. A partir daqui o app calcula a hora de sair, a ordem da rota e a agenda.</p>
        {minhas.map((e) => {
          const ps = periodosDe(e);
          const pend = van.credenciamento[e.id] === 'pendente';
          return (
            <div key={e.id} className="escola-item">
              <span className="ei-ic"><I n="escola" /></span>
              <div className="ei-txt">
                <strong>{e.nome}</strong>
                <span className="ei-periodos">{ps.length ? ps.map((t) => <span key={t} className="tag"><I n={t} />{NOME_TURNO[t]} {e.horarios[t]?.entrada}–{e.horarios[t]?.saida}</span>) : <span className="muted small">sem período marcado</span>}</span>
                {pend && <small className="muted">Pedido de credenciamento enviado para a escola (é opcional para ela).</small>}
              </div>
              <div className="ei-acoes">
                <button className="btn btn-claro btn-sm" onClick={() => setAssistente(e)}>Editar</button>
                <button className="btn btn-fantasma btn-sm btn-ic" aria-label={`Remover ${e.nome}`} onClick={() => void remover(e)}><I n="lixo" /></button>
              </div>
            </div>
          );
        })}
        {erro && <div className="aviso-erro">{erro}</div>}
        <button className="btn btn-primario btn-bloco btn-grande" onClick={() => setAssistente('nova')}><I n="mais" />Adicionar escola</button>
        {ativos.length > 0 && <p className="muted small" style={{ textAlign: 'center' }}>Você trabalha: <b className="texto">{ativos.map((t) => NOME_TURNO[t].toLowerCase()).join(', ')}</b>.</p>}
      </div>
    </Modal>
  );
}

/** Passo a passo: 1. qual escola · 2. em que período (e horário) · 3. confere e salva. */
function Assistente({ d, escola, onFechar, onPronto }: { d: DadosVan; escola?: Escola; onFechar: () => void; onPronto: () => void }) {
  const van = d.van!;
  const editando = !!escola && van.escolaIds.includes(escola.id);
  const [passo, setPasso] = useState<1 | 2 | 3>(escola ? 2 : 1);
  const [escolhida, setEscolhida] = useState<Escola | undefined>(escola);
  const [nova, setNova] = useState<{ nome: string; endereco: string; local: LatLng | null }>({ nome: '', endereco: '', local: null });
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const base = escolhida?.horarios ?? {};
  const [periodos, setPeriodos] = useState<Periodos>(() => {
    const p = {} as Periodos;
    for (const t of TURNOS) {
      const marcado = escola ? van.turnos.some((x) => x.turno === t && x.escolaIds.includes(escola.id)) : false;
      p[t] = { on: marcado, entrada: base[t]?.entrada ?? PADRAO[t].entrada, saida: base[t]?.saida ?? PADRAO[t].saida };
    }
    return p;
  });
  const escolherExistente = (e: Escola) => {
    setEscolhida(e);
    setPeriodos((p) => {
      const n = { ...p };
      for (const t of TURNOS) n[t] = { on: !!e.horarios[t] && TURNOS.filter((x) => e.horarios[x]).length === 1, entrada: e.horarios[t]?.entrada ?? PADRAO[t].entrada, saida: e.horarios[t]?.saida ?? PADRAO[t].saida };
      return n;
    });
    setPasso(2);
  };
  const outras = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return d.escolas.filter((e) => !van.escolaIds.includes(e.id) && (!q || `${e.nome} ${e.endereco}`.toLowerCase().includes(q))).slice(0, 5);
  }, [busca, d.escolas, van.escolaIds]);
  const nome = escolhida?.nome ?? nova.nome.trim();
  const marcados = TURNOS.filter((t) => periodos[t].on);
  const horarioInvalido = marcados.find((t) => periodos[t].entrada >= periodos[t].saida);

  const salvar = async () => {
    setErro(''); setSalvando(true);
    try {
      const horarios: Partial<Record<Turno, Horario>> = { ...(escolhida?.horarios ?? {}) };
      for (const t of marcados) horarios[t] = { entrada: periodos[t].entrada, saida: periodos[t].saida };
      let e = escolhida;
      if (!e) e = await salvarEscola(null, { nome: nova.nome.trim(), endereco: nova.endereco.trim(), local: nova.local!, horarios });
      await salvarTurnos(turnosCom(van, e.id, Object.fromEntries(marcados.map((t) => [t, true]))));
      // escola que já existia: só atualiza o horário se mudou (vale para todas as vans dessa escola)
      if (escolhida && marcados.some((t) => escolhida.horarios[t]?.entrada !== horarios[t]?.entrada || escolhida.horarios[t]?.saida !== horarios[t]?.saida)) {
        await salvarEscola(escolhida.id, { nome: escolhida.nome, endereco: escolhida.endereco, local: escolhida.local, horarios });
      }
      setPasso(3);
      setTimeout(onPronto, 1600);
    } catch (x) { setErro((x as Error).message); }
    setSalvando(false);
  };

  return (
    <Modal titulo={editando ? `Editar ${escola!.nome}` : 'Adicionar escola'} onFechar={onFechar}>
      <ol className="passos-assist" aria-label="Passos">
        {['Escola', 'Período', 'Pronto'].map((t, i) => <li key={t} className={passo > i + 1 ? 'feito' : passo === i + 1 ? 'agora' : ''}><b>{passo > i + 1 ? <I n="check" tam={13} /> : i + 1}</b>{t}</li>)}
      </ol>

      <Transicao chave={passo} ordem={passo}>
      {passo === 1 && (
        <div className="pilha" style={{ gap: 14 }}>
          <h4 className="pergunta">Qual é a escola?</h4>
          {d.escolas.some((e) => !van.escolaIds.includes(e.id)) && (
            <>
              <label className="busca-mini"><I n="busca" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procure pelo nome" autoFocus /></label>
              <div className="opcoes-lista">
                {outras.map((e) => (
                  <button key={e.id} type="button" className="opcao-grande" onClick={() => escolherExistente(e)}>
                    <span className="og-ic"><I n="escola" /></span><span><strong>{e.nome}</strong><small>{e.endereco}</small></span><I n="chevron" />
                  </button>
                ))}
                {!outras.length && <span className="muted small">Nenhuma com esse nome. Cadastre abaixo.</span>}
              </div>
              <div className="login-ou"><span>não achou? cadastre</span></div>
            </>
          )}
          <label className="fld"><span>Nome da escola</span><input value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} placeholder="Ex.: Colégio Santa Maria" /></label>
          <div className="fld"><span>Endereço</span><BuscaEndereco valor={nova.endereco} onTexto={(t) => setNova({ ...nova, endereco: t })} onLocal={(p) => setNova((x) => ({ ...x, local: p }))} /></div>
          {nova.local && <Mapa3D altura={180} enquadrar={[nova.local]} chave={`esc-${nova.local.lat}`} marcadores={[{ id: 'e', pos: nova.local, tipo: 'escola', rotulo: nova.nome || 'Escola' }]} onClick={(p) => setNova((x) => ({ ...x, local: p }))} />}
          {nova.local && <small className="muted">Confira o ponto no mapa. Se precisar, toque no portão certo.</small>}
          <button className="btn btn-primario btn-bloco btn-grande" disabled={!nova.nome.trim() || !nova.local} onClick={() => setPasso(2)}>Continuar<I n="seguir" /></button>
        </div>
      )}

      {passo === 2 && (
        <div className="pilha" style={{ gap: 14 }}>
          <h4 className="pergunta">Quando você leva alunos para <span className="destaque-amarelo">{nome}</span>?</h4>
          <p className="muted small" style={{ marginTop: -8 }}>Marque um ou mais. Confira o horário de entrada e saída: é dele que sai a hora de você sair de casa.</p>
          {TURNOS.map((t) => {
            const p = periodos[t];
            return (
              <div key={t} className={`periodo ${p.on ? 'on' : ''}`}>
                <button type="button" className="per-cab" onClick={() => setPeriodos((x) => ({ ...x, [t]: { ...p, on: !p.on } }))} aria-pressed={p.on}>
                  <span className="per-ic"><I n={t} /></span>
                  <strong>{PERGUNTA[t]}</strong>
                  <span className="per-check">{p.on && <I n="check" tam={16} />}</span>
                </button>
                {p.on && (
                  <div className="per-horas">
                    <label><span>Entra</span><input type="time" value={p.entrada} onChange={(e) => setPeriodos((x) => ({ ...x, [t]: { ...p, entrada: e.target.value } }))} /></label>
                    <label><span>Sai</span><input type="time" value={p.saida} onChange={(e) => setPeriodos((x) => ({ ...x, [t]: { ...p, saida: e.target.value } }))} /></label>
                  </div>
                )}
              </div>
            );
          })}
          {horarioInvalido && <div className="aviso-erro">{PERGUNTA[horarioInvalido]}: a saída precisa ser depois da entrada.</div>}
          {erro && <div className="aviso-erro">{erro}</div>}
          <div className="linha" style={{ flexWrap: 'nowrap' }}>
            {!escola && <button className="btn btn-claro btn-grande" onClick={() => { setEscolhida(undefined); setPasso(1); }}><I n="voltar" /></button>}
            <button className="btn btn-primario btn-bloco btn-grande" disabled={!marcados.length || !!horarioInvalido || salvando} onClick={() => void salvar()}>
              {salvando ? <><I n="carregando" className="girando" />Salvando…</> : <>Salvar<I n="check" /></>}
            </button>
          </div>
        </div>
      )}

      {passo === 3 && (
        <div className="assist-pronto">
          <span className="ap-ic"><I n="check" tam={30} /></span>
          <h4>Pronto!</h4>
          <p className="muted">Você atende <b className="texto">{nome}</b> {marcados.map((t) => PERGUNTA[t].toLowerCase()).join(' e ')}. Agora é só cadastrar os alunos dessa escola.</p>
        </div>
      )}
      </Transicao>
    </Modal>
  );
}
