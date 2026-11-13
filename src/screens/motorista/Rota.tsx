import { useEffect, useMemo, useRef, useState } from 'react';
import { CuidadosLinha } from '../../components/cuidados';
import { useEu } from '../../api/sync';
import { useFila } from '../../api/fila';
import Mapa3D, { type Linha, type Marcador } from '../../components/Mapa3D';
import { SeletorPlano } from '../../components/presenca';
import { Avatar, Toggle } from '../../components/ui';
import { I } from '../../components/Icone';
import { TURNOS, type Escola, type Parada, type TipoViagem, type Turno, type Viagem } from '../../db/types';
import { compCaminho, etaMin } from '../../lib/geo';
import { caminhoAte, etaAte } from '../../lib/privacidade';
import { atrasoPrevisto, horarioAlvo, NOME_TURNO, ordenarEscolas, planejarHorario, turnoAgora, vaiNoTrecho } from '../../lib/turnos';
import { hora, horaMais, primeiroNome } from '../../lib/util';
import { definirPresenca, salvarRotaFixa } from '../../services/acoes';
import { chaveRotaFixa, configurarViagem, encerrarViagem, enviarPosicao, iniciarViagem, marcarParada, ordemLocal, ordenarPorFixa } from '../../services/viagem';
import type { DadosVan } from './dados';

const VELOCIDADES = [1, 4, 8, 15, 30];

export function Rota({ d, turnoInicial }: { d: DadosVan; turnoInicial?: Turno }) {
  return d.ativa ? <RotaAoVivo d={d} v={d.ativa} /> : <PrepararRota d={d} turnoInicial={turnoInicial} />;
}

/** Selo de atraso: compara a previsão de chegada com o horário da escola. */
function SeloHorario({ eta, horario }: { eta: number; horario?: string }) {
  const atraso = atrasoPrevisto(eta, horario);
  if (atraso === null) return horario ? <span className="tag"><I n="relogio" />{horario}</span> : null;
  return atraso > 0
    ? <span className="tag atraso"><I n="alerta" />{atraso} min atrasado</span>
    : <span className="tag no-horario"><I n="check" />no horário · {horario}</span>;
}

// ---------------- antes de sair ----------------

function PrepararRota({ d, turnoInicial }: { d: DadosVan; turnoInicial?: Turno }) {
  const van = d.van!;
  const ativos = van.turnos.filter((t) => t.ativo);
  const padrao = turnoInicial && ativos.some((t) => t.turno === turnoInicial) ? turnoInicial
    : ativos.find((t) => t.turno === turnoAgora())?.turno ?? ativos[0]?.turno ?? 'manha';
  const [turno, setTurno] = useState<Turno>(padrao);
  useEffect(() => { if (turnoInicial) setTurno(padrao); }, [turnoInicial]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tipo, setTipo] = useState<TipoViagem>('ida');
  const eu = useEu();
  // conta de demonstração: o servidor anda com a van; conta de verdade: GPS do celular
  const [simuladoSel, setSimulado] = useState<boolean | null>(null);
  const simulado = simuladoSel ?? !!eu?.usuario.demo;
  const [automatico, setAutomatico] = useState(false);
  const [velocidade, setVelocidade] = useState(8);
  const [saindo, setSaindo] = useState(false);
  const [erro, setErro] = useState('');

  const cfg = van.turnos.find((t) => t.turno === turno);
  const doTurnoBase = d.ativos.filter((a) => a.turno === turno && !!cfg?.escolaIds.includes(a.escolaId));
  const escolasDe = (l: typeof doTurnoBase) => ordenarEscolas([...new Set(l.map((a) => a.escolaId))].map((id) => d.mapaEscolas.get(id)!).filter(Boolean), turno, tipo);
  const pontas = (es: Escola[]) => ({ inicio: tipo === 'ida' ? van.garagem : es[0]?.local ?? van.garagem, fim: tipo === 'ida' ? es[es.length - 1]?.local ?? van.garagem : van.garagem });

  // rota fixa (vale até o tio mudar): ordem salva; senão sugere a otimizada com todos do turno (ou a ida ao contrário, na volta)
  const rf = van.rotasFixas?.[chaveRotaFixa(turno, tipo)];
  const fixa = !!rf?.ativa;
  const sugerida = () => {
    const daIda = tipo === 'volta' ? van.rotasFixas?.[chaveRotaFixa(turno, 'ida')]?.ordem : undefined;
    if (daIda?.length) return [...daIda].reverse();
    const es = escolasDe(doTurnoBase); const pt = pontas(es);
    return ordemLocal(tipo, pt.inicio, doTurnoBase, es, pt.fim, true).paradas.filter((p) => p.tipo === 'aluno').map((p) => p.alunoId);
  };
  const doTurno = fixa ? ordenarPorFixa(doTurnoBase, rf!.ordem) : doTurnoBase;
  const vao = doTurno.filter((a) => vaiNoTrecho(d.presencaPorAluno.get(a.id), tipo));
  const otimizar = !fixa;
  const escolas = escolasDe(vao);
  const { inicio, fim } = pontas(escolas);
  const usarFixa = (ativa: boolean) => void salvarRotaFixa(van.id, turno, tipo, ativa && !rf?.ordem.length ? { ativa, ordem: sugerida() } : { ativa });
  const mover = (id: string, delta: number) => {
    const ids = doTurno.map((a) => a.id); const i = ids.indexOf(id); const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void salvarRotaFixa(van.id, turno, tipo, { ordem: ids });
  };

  const previa = useMemo(() => {
    const o = ordemLocal(tipo, inicio, vao, escolas, fim, otimizar);
    const base = ordemLocal(tipo, inicio, vao, escolas, fim, false);
    const km = compCaminho(o.pts) / 1000;
    const min = etaMin(o.pts, o.paradas.length);
    const horario = planejarHorario(tipo, turno, o.paradas, d.mapaEscolas, (i) => etaMin(o.pts.slice(0, i + 2), i), min);
    return { ...o, km, economia: Math.max(0, compCaminho(base.pts) / 1000 - km), min, horario };
  }, [vao.map((a) => a.id).join(), otimizar, tipo, turno]); // eslint-disable-line react-hooks/exhaustive-deps

  const numero = new Map(previa.paradas.map((p, i) => [p.tipo === 'aluno' ? p.alunoId : `esc:${p.escolaId}`, i + 1]));
  const marcadores: Marcador[] = [
    { id: 'garagem', pos: van.garagem, tipo: 'garagem', rotulo: 'Garagem' },
    ...escolas.map((e) => ({ id: `esc:${e.id}`, pos: e.local, tipo: 'escola' as const, rotulo: `${numero.get(`esc:${e.id}`)}. ${e.nome}` })),
    ...vao.map((a) => ({ id: a.id, pos: a.local, tipo: 'parada' as const, texto: String(numero.get(a.id) ?? ''), rotulo: primeiroNome(a.nome) })),
  ];
  const sair = async () => {
    setErro(''); setSaindo(true);
    try { await iniciarViagem(van.id, turno, tipo, { otimizar, automatico: simulado && automatico, velocidade, simulado }); } catch (e) { setErro((e as Error).message); }
    setSaindo(false);
  };
  const feitaHoje = d.concluidas.filter((v) => v.turno === turno && v.tipo === tipo);

  return (
    <>
      <div className="card pilha" style={{ padding: 14 }}>
        <div className="chips-turno">
          {TURNOS.filter((t) => van.turnos.some((x) => x.turno === t && x.ativo)).map((t) => (
            <button key={t} className={`chip-turno ${turno === t ? 'ativo' : ''}`} onClick={() => setTurno(t)}><I n={t} />{NOME_TURNO[t]}</button>
          ))}
        </div>
        <div className="abas" style={{ alignSelf: 'start' }}>
          <button type="button" className={tipo === 'ida' ? 'ativo' : ''} onClick={() => setTipo('ida')}><I n="escola" />Ida · casa → escola</button>
          <button type="button" className={tipo === 'volta' ? 'ativo' : ''} onClick={() => setTipo('volta')}><I n="casa" />Volta · escola → casa</button>
        </div>
        {feitaHoje.length > 0 && <div className="alerta-otim" style={{ margin: 0 }}><I n="bandeira" /><span>A {tipo} da {NOME_TURNO[turno].toLowerCase()} já foi feita hoje às {hora(feitaHoje[feitaHoje.length - 1].concluidaEm)}.</span></div>}
      </div>
      <div className="rota-grid">
        <section className="card" style={{ padding: 12 }}>
          <Mapa3D altura="min(62vh, 560px)" marcadores={marcadores} linhas={[{ id: 'p', pts: previa.pts, tipo: 'previa' }]} enquadrar={[van.garagem, ...previa.pts]} chave={`${turno}|${tipo}|${vao.length}`} />
          <div className="linha" style={{ padding: '12px 6px 2px' }}>
            <span className="tag"><I n="rota" />~{previa.km.toFixed(1)} km</span>
            <span className="tag"><I n="cronometro" />~{previa.min} min</span>
            {otimizar && previa.economia > 0.05 && <span className="tag tag-verde"><I n="raio" />economiza {previa.economia.toFixed(1)} km</span>}
            <span className="muted small">Linha tracejada = ordem prevista. Ao sair, a rota é traçada pelas ruas.</span>
          </div>
        </section>
        <section className="card pilha rota-lado">
          <h3 className="turno-titulo"><I n={turno} />{tipo === 'ida' ? 'Ida' : 'Volta'} da {NOME_TURNO[turno].toLowerCase()}</h3>
          {escolas.length > 0 && previa.horario.sairAs && (
            <div className={`horario-saida ${previa.horario.atrasadoMin ? 'atrasado' : ''}`}>
              <span className="ic"><I n="alarme" /></span>
              <div>
                <strong>{tipo === 'ida' ? `Saia da garagem até ${previa.horario.sairAs}` : `Esteja em ${escolas[0].nome} às ${previa.horario.sairAs}`}</strong>
                <span className="small">{tipo === 'ida'
                  ? `Calculado pelo horário de entrada das escolas (${d.cfg.folgaMin} min de folga) · última escola ~${previa.horario.fimAs}`
                  : `Horário de saída da escola · todos em casa ~${previa.horario.fimAs}`}</span>
                {previa.horario.atrasadoMin ? <span className="tag atraso" style={{ marginTop: 6, alignSelf: 'start' }}><I n="alerta" />Já passou {previa.horario.atrasadoMin} min da hora de {tipo === 'ida' ? 'sair' : 'estar lá'}</span> : null}
              </div>
            </div>
          )}
          {erro && <div className="aviso-erro">{erro}</div>}
          <button className="btn btn-primario btn-bloco btn-grande" disabled={saindo || !vao.length} onClick={() => void sair()}>
            <I n={saindo ? 'satelite' : 'navegar'} />{saindo ? 'Traçando a rota pelas ruas…' : `Começar ${tipo} · ${vao.length} aluno${vao.length === 1 ? '' : 's'}`}
          </button>
          {!simulado && <div className="dica-gps"><I n="check" /><span>{d.van?.config?.confirmarManual ? 'Confirme cada embarque no botão grande da tela.' : 'Só dirija: o GPS confirma o embarque sozinho quando você sai de cada casa e avisa as famílias.'}</span></div>}
          <div>
            <div className="entre"><strong>Alunos do turno ({vao.length}/{doTurno.length} nesta {tipo})</strong></div>
            {doTurno.map((a, i) => {
              const n = numero.get(a.id);
              return (
                <div key={a.id} className="linha-item" style={{ opacity: n ? 1 : 0.55 }}>
                  <div className="aluno-cel">
                    {fixa && (
                      <div className="ordem-btns">
                        <button className="btn btn-claro btn-sm" title="Subir" disabled={i === 0} onClick={() => mover(a.id, -1)}><I n="cima" /></button>
                        <button className="btn btn-claro btn-sm" title="Descer" disabled={i === doTurno.length - 1} onClick={() => mover(a.id, 1)}><I n="baixo" /></button>
                      </div>
                    )}
                    <Avatar aluno={a} tam={34} /><div><strong>{n ? `${n}. ` : ''}{a.nome}</strong><span className="muted small">{d.mapaEscolas.get(a.escolaId)?.nome} · {a.endereco}</span></div>
                  </div>
                  <SeletorPlano valor={d.plano(a.id)} onChange={(x) => void definirPresenca(a.id, x, undefined, 'motorista')} />
                </div>
              );
            })}
            {!doTurno.length && <span className="muted small">Nenhum aluno neste turno.</span>}
          </div>
          <div>
            <strong className="small">Escolas, na ordem {tipo === 'ida' ? 'da entrada' : 'da saída'}</strong>
            {escolas.map((e: Escola, i) => {
              const h = previa.horario.escolas.find((x) => x.escolaId === e.id);
              return (
                <div key={e.id} className="linha-item">
                  <span className="ic-txt"><I n="escola" tam={16} />{i + 1}º · {e.nome}</span>
                  <span className="linha" style={{ gap: 6, justifyContent: 'flex-end' }}>
                    <span className="tag tag-cinza">{tipo === 'ida' ? 'entra' : 'sai'} {horarioAlvo(e, turno, tipo) ?? '—'}</span>
                    {h && h.folga !== null && (tipo === 'ida'
                      ? <span className={`tag ${h.folga >= 0 ? 'no-horario' : 'atraso'}`}>chega ~{h.chegada}</span>
                      : i > 0 && <span className="tag tag-cinza">chega ~{h.chegada}{h.espera ? ` · espera ${h.espera} min` : ''}</span>)}
                  </span>
                </div>
              );
            })}
            {!escolas.length && <span className="muted small">Nenhuma escola com aluno neste trecho.</span>}
          </div>
          <details className="opcoes">
            <summary><I n="config" />Opções da rota<I n="chevron" /></summary>
            <div>
          <div className="pilha" style={{ gap: 6 }}>
            <strong className="small">Ordem das casas</strong>
            <div className="abas modo-rota">
              <button type="button" className={!fixa ? 'ativo' : ''} onClick={() => usarFixa(false)}><I n="raio" />Otimizada</button>
              <button type="button" className={fixa ? 'ativo' : ''} onClick={() => usarFixa(true)}><I n="pin" />Rota fixa</button>
            </div>
            <small className="muted">{fixa
              ? `Você define a ordem com ↑ ↓ e ela fica salva (ex.: o semestre todo). Quem não vai no dia é só pulado.${rf?.atualizadaEm ? ` Atualizada em ${new Date(rf.atualizadaEm).toLocaleDateString('pt-BR')}.` : ''}`
              : 'O app escolhe a melhor ordem pelas ruas, todo dia, com quem vai.'}</small>
          </div>
          <div className="pilha" style={{ gap: 6 }}>
            <strong className="small">Posição da van</strong>
            <div className="abas modo-rota">
              <button type="button" className={!simulado ? 'ativo' : ''} onClick={() => setSimulado(false)}><I n="celular" />GPS do celular</button>
              <button type="button" className={simulado ? 'ativo' : ''} onClick={() => setSimulado(true)}><I n="teste" />Simulação</button>
            </div>
            <small className="muted">{simulado ? 'A van anda sozinha pelas ruas (para testar e mostrar o app).' : 'Deixe esta tela aberta durante a rota: o app usa o GPS do celular e as famílias acompanham.'}</small>
          </div>
          {simulado && (
            <>
              <label className="check"><input type="checkbox" checked={automatico} onChange={(e) => setAutomatico(e.target.checked)} /> Confirmar as paradas sozinho</label>
              <label className="fld"><span>Velocidade da simulação</span>
                <select value={velocidade} onChange={(e) => setVelocidade(Number(e.target.value))}>{VELOCIDADES.map((v) => <option key={v} value={v}>{v}× {v === 1 ? '(tempo real)' : ''}</option>)}</select>
              </label>
            </>
          )}
            </div>
          </details>
          <small className="muted">Antes do embarque a família só vê a van quando ela é a próxima; com o filho a bordo, acompanha o trajeto todo. Os trajetos ficam guardados para a fiscalização.</small>
        </section>
      </div>
    </>
  );
}

// ---------------- em andamento ----------------

/**
 * GPS do celular do tio: manda a posição para o servidor (no máximo a cada 3 s) enquanto a rota estiver aberta.
 * Sem internet, as posições ficam numa fila no aparelho e sobem juntas quando a conexão volta,
 * para o histórico do trajeto não ter buracos (PL 1240/2026: operação contínua).
 */
function useGPS(v: Viagem) {
  const [estado, setEstado] = useState<'off' | 'buscando' | 'ok' | 'negado' | 'sem'>('off');
  const ultimo = useRef(0);
  useEffect(() => {
    if (v.simulado || v.status !== 'em_andamento') { setEstado('off'); return; }
    if (!navigator.geolocation) { setEstado('sem'); return; }
    setEstado('buscando');
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setEstado('ok');
        if (Date.now() - ultimo.current < 3000) return;
        ultimo.current = Date.now();
        void enviarPosicao(v.id, { lat: p.coords.latitude, lng: p.coords.longitude }).catch(() => undefined);
      },
      (e) => setEstado(e.code === e.PERMISSION_DENIED ? 'negado' : 'buscando'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    // tela acesa durante a rota (quando o navegador deixa)
    let trava: { release: () => Promise<void> } | undefined;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((t) => { trava = t; }).catch(() => undefined);
    return () => { navigator.geolocation.clearWatch(id); void trava?.release().catch(() => undefined); };
  }, [v.id, v.simulado, v.status]);
  const { pontosGps } = useFila();
  return [estado, pontosGps] as const;
}

function RotaAoVivo({ d, v }: { d: DadosVan; v: Viagem }) {
  const [gps, fila] = useGPS(v);
  const fim = v.paradas.length;
  const atual: Parada | undefined = v.alvo < fim ? v.paradas[v.alvo] : undefined;
  const eta = etaMin([v.pos, ...v.caminho], 0, v.rotaReal);
  const restante = caminhoAte(v, fim);
  const etaFim = etaMin(restante, v.paradas.filter((p) => p.status === 'pendente').length, v.rotaReal);
  const casas = v.paradas.filter((p) => p.tipo === 'aluno');
  const feitos = casas.filter((p) => p.status === 'feito').length;
  const nomeEsc = (id: string) => d.mapaEscolas.get(id)?.nome ?? 'escola';
  /** alunos desta escola que descem (ida) ou sobem (volta) aqui */
  const daEscola = (id: string) => casas.filter((p) => p.escolaId === id && (v.tipo === 'ida' ? p.status === 'feito' : p.status === 'pendente'));

  const marcadores: Marcador[] = [
    ...(v.tipo === 'volta' ? [{ id: 'fim', pos: v.destino, tipo: 'garagem' as const, rotulo: 'Garagem' }] : []),
    ...v.paradas.map((p, i): Marcador => {
      if (p.tipo === 'escola') {
        const e = d.mapaEscolas.get(p.escolaId)!;
        return { id: `esc:${e.id}`, pos: e.local, tipo: 'escola', rotulo: `${p.status === 'feito' ? '✓ ' : ''}${e.nome}` };
      }
      const a = d.mapaAlunos.get(p.alunoId)!;
      const tipo = p.status === 'feito' ? 'feito' : p.status === 'ausente' ? 'ausente' : i === v.alvo ? 'alvo' : 'parada';
      return { id: p.alunoId, pos: a.local, tipo, texto: p.status === 'feito' ? '✓' : p.status === 'ausente' ? '–' : String(i + 1), rotulo: primeiroNome(a.nome) };
    }),
    { id: 'van', pos: v.pos, tipo: 'van' },
  ];
  const linhas: Linha[] = [{ id: 'feita', pts: v.rastro, tipo: 'feita' }, { id: 'rota', pts: restante, tipo: 'rota' }];

  return (
    <div className="rota-grid">
      <section className="card" style={{ padding: 12 }}>
        <Mapa3D altura="min(70vh, 640px)" marcadores={marcadores} linhas={linhas} seguir={v.pos} />
        <div className="linha" style={{ padding: '12px 6px 2px' }}>
          <span className="tag tag-verde ao-vivo"><span className="ponto" /> Ao vivo</span>
          <span className="tag"><I n={v.turno} />{NOME_TURNO[v.turno]} · {v.tipo} · {feitos}/{casas.length} {v.tipo === 'ida' ? 'embarcados' : 'entregues'}</span>
          <span className="tag"><I n="bandeira" />fim ~{horaMais(etaFim)}</span>
          {!!v.economiaKm && v.economiaKm > 0.05 && <span className="tag tag-verde"><I n="raio" />-{v.economiaKm.toFixed(1)} km</span>}
          {!v.rotaReal && <span className="tag tag-laranja">Sem internet: rota em linha reta</span>}
          {!v.simulado && <span className={`tag ${gps === 'ok' ? 'tag-verde' : gps === 'negado' || gps === 'sem' ? 'tag-vermelho' : 'tag-cinza'}`}>
            <I n="satelite" />{gps === 'ok' ? `GPS ativo${fila ? ` · ${fila} na fila` : ''}` : gps === 'negado' ? 'Libere a localização no navegador' : gps === 'sem' ? 'Sem GPS neste aparelho' : 'Procurando GPS…'}</span>}
        </div>
      </section>
      <section className="pilha">
        <div className="alvo-card">
          <Navegar destino={atual ? (atual.tipo === 'aluno' ? d.mapaAlunos.get(atual.alunoId)?.local : d.mapaEscolas.get(atual.escolaId)?.local) : v.destino} />
          {atual?.tipo === 'aluno' ? (() => {
            const a = d.mapaAlunos.get(atual.alunoId)!;
            return (
              <>
                <div className="entre">
                  <span className="rotulo-alvo">{v.naParada ? 'Você chegou' : `Próxima parada · ${eta} min`}</span>
                  {atual.prontoEm && <span className="tag tag-verde"><I n="mao" />No portão</span>}
                </div>
                <div className="linha" style={{ marginTop: 10 }}>
                  <Avatar aluno={a} tam={48} />
                  <div style={{ minWidth: 0 }}><div className="nome-alvo">{a.nome}</div><span className="muted small">{a.endereco} · {nomeEsc(a.escolaId)}</span></div>
                </div>
                <CuidadosLinha a={a} />
                <div className="botoes">
                  <button className="btn btn-primario" onClick={() => void marcarParada(v.id, 'feito')}><I n="check" />{v.tipo === 'ida' ? 'Embarcou' : 'Entregue'}</button>
                  {v.tipo === 'ida' ? <button className="btn btn-claro" onClick={() => void marcarParada(v.id, 'ausente')}><I n="fechar" />Não estava</button>
                    : <a className="btn btn-claro" href={`tel:${a.telefoneResp}`}><I n="telefone" />Ligar</a>}
                </div>
                {!v.simulado && !d.van?.config?.confirmarManual && <small className="muted" style={{ display: 'block', marginTop: 10 }}>Pode seguir: ao sair daqui o GPS confirma {v.tipo === 'ida' ? 'o embarque' : 'a entrega'} sozinho.</small>}
              </>
            );
          })() : atual?.tipo === 'escola' ? (() => {
            const e = d.mapaEscolas.get(atual.escolaId)!;
            const lista = daEscola(e.id);
            return (
              <>
                <div className="entre">
                  <span className="rotulo-alvo">{v.naParada ? 'Na escola' : `Próxima escola · ${eta} min`}</span>
                  <SeloHorario eta={v.naParada ? 0 : eta} horario={horarioAlvo(e, v.turno, v.tipo)} />
                </div>
                <div className="nome-alvo" style={{ marginTop: 10 }}>{e.nome}</div>
                <span className="muted small">{v.tipo === 'ida' ? `Descem ${lista.length}` : `Sobem ${lista.length}`}: {lista.map((p) => primeiroNome(d.mapaAlunos.get(p.alunoId)?.nome ?? '')).join(', ') || '—'}</span>
                <div className="botoes" style={{ gridTemplateColumns: '1fr' }}>
                  <button className="btn btn-primario" onClick={() => void marcarParada(v.id, 'feito')}><I n="checks" />{v.tipo === 'ida' ? `Desceram ${lista.length}` : `Embarcaram ${lista.length}`}</button>
                </div>
                {v.tipo === 'volta' && <small className="muted" style={{ display: 'block', marginTop: 8 }}>Algum aluno não veio? Use "Fora" na lista abaixo antes de confirmar.</small>}
              </>
            );
          })() : (
            <>
              <span className="rotulo-alvo">Último trecho · {eta} min</span>
              <div className="nome-alvo" style={{ marginTop: 10 }}>Indo para {v.destinoNome}</div>
            </>
          )}
        </div>

        <div className="card">
          <div className="card-topo"><h3>Paradas</h3><span className="muted small">{v.paradas.filter((p) => p.status === 'pendente').length} faltando</span></div>
          <ol className="rota-lista">
            {v.paradas.map((p, i) => {
              const cls = p.status === 'feito' ? 'feito' : p.status === 'ausente' ? 'ausente' : i === v.alvo ? 'agora' : '';
              if (p.tipo === 'escola') {
                const e = d.mapaEscolas.get(p.escolaId)!;
                const h = horarioAlvo(e, v.turno, v.tipo);
                return (
                  <li key={`esc:${e.id}`} className={cls}>
                    <span className="n"><I n="escola" /></span>
                    <div className="info"><strong>{e.nome}</strong><span className="muted small">{p.status === 'ausente' ? 'Sem alunos — pulada' : `${v.tipo === 'ida' ? 'Entrada' : 'Saída'} ${h ?? '—'} · ${casas.filter((c) => c.escolaId === e.id && c.status !== 'ausente').length} aluno(s)`}</span></div>
                    {p.status === 'pendente' ? <SeloHorario eta={etaAte(v, i)} horario={h} /> : <span className="hora">{p.hora ? hora(p.hora) : ''}</span>}
                  </li>
                );
              }
              const a = d.mapaAlunos.get(p.alunoId)!;
              return (
                <li key={p.alunoId} className={cls}>
                  <span className="n">{p.status === 'feito' ? <I n="check" /> : p.status === 'ausente' ? '–' : i + 1}</span>
                  <div className="info"><strong>{a.nome}</strong><span className="muted small">{p.status === 'ausente' ? (p.avisou ? 'Combinado: fora deste trecho' : 'Não estava') : p.prontoEm && p.status === 'pendente' ? 'No portão' : `${nomeEsc(a.escolaId)} · ${a.endereco}`}</span></div>
                  {p.status === 'pendente' && i !== v.alvo
                    ? <button className="btn btn-claro btn-sm" title="Tirar deste trecho e reotimizar" onClick={() => void definirPresenca(a.id, v.tipo === 'ida' ? (d.plano(a.id) === 'so_ida' ? 'nao_vai' : 'so_volta') : (d.plano(a.id) === 'so_volta' ? 'nao_vai' : 'so_ida'), undefined, 'motorista')}>Fora</button>
                    : <span className="hora">{p.hora ? hora(p.hora) : ''}</span>}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="card controle-sim">
          <h3>Posição da van</h3>
          <div className="entre"><span className="ic-txt"><I n={v.simulado ? 'teste' : 'celular'} />{v.simulado ? 'Simulação (a van anda sozinha)' : 'GPS do celular'}</span><Toggle on={v.simulado} onChange={(x) => void configurarViagem(v.id, { simulado: x })} titulo="Simulação" /></div>
          {v.simulado && (
            <>
              <div className="entre"><span>Confirmar as paradas sozinho</span><Toggle on={v.automatico} onChange={(x) => void configurarViagem(v.id, { automatico: x })} /></div>
              <label className="fld"><span>Velocidade</span>
                <select value={v.velocidade} onChange={(e) => void configurarViagem(v.id, { velocidade: Number(e.target.value) })}>{VELOCIDADES.map((x) => <option key={x} value={x}>{x}×</option>)}</select>
              </label>
            </>
          )}
          <button className="btn btn-claro" onClick={() => { if (confirm('Encerrar a rota agora?')) void encerrarViagem(v.id); }}><I n="parar" />Encerrar rota</button>
        </div>
      </section>
    </div>
  );
}

/** Abre a parada atual no Waze ou no Google Maps do celular (link grátis, sem API paga). */
function Navegar({ destino }: { destino?: { lat: number; lng: number } }) {
  if (!destino) return null;
  const ll = `${destino.lat},${destino.lng}`;
  return (
    <div className="navegar">
      <a className="btn btn-sm" href={`https://waze.com/ul?ll=${ll}&navigate=yes`} target="_blank" rel="noreferrer"><I n="navegar" />Waze</a>
      <a className="btn btn-sm" href={`https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving`} target="_blank" rel="noreferrer"><I n="mapa" />Maps</a>
    </div>
  );
}
