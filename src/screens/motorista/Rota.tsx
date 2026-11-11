import { useEffect, useMemo, useState } from 'react';
import Mapa3D, { type Linha, type Marcador } from '../../components/Mapa3D';
import { SeletorPlano } from '../../components/presenca';
import { Avatar, Toggle } from '../../components/ui';
import { TURNOS, type Escola, type Parada, type TipoViagem, type Turno, type Viagem } from '../../db/types';
import { compCaminho, etaMin } from '../../lib/geo';
import { caminhoAte, etaAte } from '../../lib/privacidade';
import { atrasoPrevisto, horarioAlvo, ICONE_TURNO, NOME_TURNO, ordenarEscolas, turnoAgora, vaiNoTrecho } from '../../lib/turnos';
import { hora, horaMais, primeiroNome } from '../../lib/util';
import { definirPresenca } from '../../services/acoes';
import { configurarViagem, encerrarViagem, iniciarViagem, marcarParada, ordemLocal } from '../../services/viagem';
import type { DadosVan } from './dados';

const VELOCIDADES = [1, 4, 8, 15, 30];

export function Rota({ d, turnoInicial }: { d: DadosVan; turnoInicial?: Turno }) {
  return d.ativa ? <RotaAoVivo d={d} v={d.ativa} /> : <PrepararRota d={d} turnoInicial={turnoInicial} />;
}

/** Selo de atraso: compara a previsão de chegada com o horário da escola. */
function SeloHorario({ eta, horario }: { eta: number; horario?: string }) {
  const atraso = atrasoPrevisto(eta, horario);
  if (atraso === null) return horario ? <span className="tag tag-cinza">⏰ {horario}</span> : null;
  return atraso > 0
    ? <span className="tag atraso">⚠️ {atraso} min atrasado</span>
    : <span className="tag no-horario">✓ no horário ({horario})</span>;
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
  const [otimizar, setOtimizar] = useState(true);
  const [automatico, setAutomatico] = useState(false);
  const [velocidade, setVelocidade] = useState(8);
  const [saindo, setSaindo] = useState(false);
  const [erro, setErro] = useState('');

  const cfg = van.turnos.find((t) => t.turno === turno);
  const doTurno = d.ativos.filter((a) => a.turno === turno && !!cfg?.escolaIds.includes(a.escolaId));
  const vao = doTurno.filter((a) => vaiNoTrecho(d.presencaPorAluno.get(a.id), tipo));
  const escolas = ordenarEscolas([...new Set(vao.map((a) => a.escolaId))].map((id) => d.mapaEscolas.get(id)!).filter(Boolean), turno, tipo);
  const inicio = tipo === 'ida' ? van.garagem : escolas[0]?.local ?? van.garagem;
  const fim = tipo === 'ida' ? escolas[escolas.length - 1]?.local ?? van.garagem : van.garagem;

  const previa = useMemo(() => {
    const o = ordemLocal(tipo, inicio, vao, escolas, fim, otimizar);
    const base = ordemLocal(tipo, inicio, vao, escolas, fim, false);
    const km = compCaminho(o.pts) / 1000;
    return { ...o, km, economia: Math.max(0, compCaminho(base.pts) / 1000 - km), min: etaMin(o.pts, o.paradas.length) };
  }, [vao.map((a) => a.id).join(), otimizar, tipo, turno]); // eslint-disable-line react-hooks/exhaustive-deps

  const numero = new Map(previa.paradas.map((p, i) => [p.tipo === 'aluno' ? p.alunoId : `esc:${p.escolaId}`, i + 1]));
  const marcadores: Marcador[] = [
    { id: 'garagem', pos: van.garagem, tipo: 'garagem', rotulo: 'Garagem' },
    ...escolas.map((e) => ({ id: `esc:${e.id}`, pos: e.local, tipo: 'escola' as const, rotulo: `${numero.get(`esc:${e.id}`)}. ${e.nome}` })),
    ...vao.map((a) => ({ id: a.id, pos: a.local, tipo: 'parada' as const, texto: String(numero.get(a.id) ?? ''), rotulo: primeiroNome(a.nome) })),
  ];
  const sair = async () => {
    setErro(''); setSaindo(true);
    try { await iniciarViagem(van.id, turno, tipo, { otimizar, automatico, velocidade }); } catch (e) { setErro((e as Error).message); }
    setSaindo(false);
  };
  const feitaHoje = d.concluidas.filter((v) => v.turno === turno && v.tipo === tipo);

  return (
    <>
      <div className="card pilha" style={{ padding: 14 }}>
        <div className="chips-turno">
          {TURNOS.filter((t) => van.turnos.some((x) => x.turno === t && x.ativo)).map((t) => (
            <button key={t} className={`chip-turno ${turno === t ? 'ativo' : ''}`} onClick={() => setTurno(t)}>{ICONE_TURNO[t]} {NOME_TURNO[t]}</button>
          ))}
        </div>
        <div className="abas" style={{ alignSelf: 'start' }}>
          <a className={tipo === 'ida' ? 'ativo' : ''} onClick={() => setTipo('ida')}>☀️ Ida (casa → escola)</a>
          <a className={tipo === 'volta' ? 'ativo' : ''} onClick={() => setTipo('volta')}>🏠 Volta (escola → casa)</a>
        </div>
        {feitaHoje.length > 0 && <div className="alerta-otim" style={{ margin: 0 }}>🏁 <span>A {tipo} da {NOME_TURNO[turno].toLowerCase()} já foi feita hoje às {hora(feitaHoje[feitaHoje.length - 1].concluidaEm)}.</span></div>}
      </div>
      <div className="rota-grid">
        <section className="card" style={{ padding: 12 }}>
          <Mapa3D altura="min(62vh, 560px)" marcadores={marcadores} linhas={[{ id: 'p', pts: previa.pts, tipo: 'previa' }]} enquadrar={[van.garagem, ...previa.pts]} chave={`${turno}|${tipo}|${vao.length}`} />
          <div className="linha" style={{ padding: '12px 6px 2px' }}>
            <span className="tag tag-azul">📏 ~{previa.km.toFixed(1)} km</span>
            <span className="tag tag-azul">⏱️ ~{previa.min} min</span>
            {otimizar && previa.economia > 0.05 && <span className="tag tag-verde">⚡ Otimização economiza {previa.economia.toFixed(1)} km</span>}
            <span className="muted small">Linha tracejada = ordem prevista. Ao sair, a rota é traçada pelas ruas.</span>
          </div>
        </section>
        <section className="card pilha">
          <h3>{ICONE_TURNO[turno]} {tipo === 'ida' ? 'Ida' : 'Volta'} da {NOME_TURNO[turno].toLowerCase()}</h3>
          <div>
            <strong className="small">Escolas, na ordem {tipo === 'ida' ? 'da entrada' : 'da saída'}</strong>
            {escolas.map((e: Escola, i) => (
              <div key={e.id} className="linha-item">
                <span>🏫 {i + 1}º · {e.nome}</span>
                <span className="tag tag-cinza">{tipo === 'ida' ? 'entra' : 'sai'} {horarioAlvo(e, turno, tipo) ?? '—'}</span>
              </div>
            ))}
            {!escolas.length && <span className="muted small">Nenhuma escola com aluno neste trecho.</span>}
          </div>
          <label className="check"><input type="checkbox" checked={otimizar} onChange={(e) => setOtimizar(e.target.checked)} /> Otimizar a ordem das casas</label>
          <label className="check"><input type="checkbox" checked={automatico} onChange={(e) => setAutomatico(e.target.checked)} /> Modo demonstração (confirma sozinho)</label>
          <label className="fld"><span>Velocidade da simulação</span>
            <select value={velocidade} onChange={(e) => setVelocidade(Number(e.target.value))}>{VELOCIDADES.map((v) => <option key={v} value={v}>{v}× {v === 1 ? '(tempo real)' : ''}</option>)}</select>
          </label>
          <div>
            <div className="entre"><strong>Alunos do turno ({vao.length}/{doTurno.length} nesta {tipo})</strong></div>
            {doTurno.map((a) => {
              const n = numero.get(a.id);
              return (
                <div key={a.id} className="linha-item" style={{ opacity: n ? 1 : 0.55 }}>
                  <div className="aluno-cel"><Avatar aluno={a} tam={34} /><div><strong>{n ? `${n}. ` : ''}{a.nome}</strong><span className="muted small">{d.mapaEscolas.get(a.escolaId)?.nome} · {a.endereco}</span></div></div>
                  <SeletorPlano valor={d.plano(a.id)} onChange={(x) => void definirPresenca(a.id, x, undefined, 'motorista')} />
                </div>
              );
            })}
            {!doTurno.length && <span className="muted small">Nenhum aluno neste turno.</span>}
          </div>
          {erro && <span className="tag tag-vermelho">{erro}</span>}
          <button className="btn btn-primario btn-bloco" disabled={saindo || !vao.length} onClick={() => void sair()}>
            {saindo ? '🛰️ Traçando a rota pelas ruas…' : `▶ Iniciar ${tipo} com ${vao.length} aluno${vao.length === 1 ? '' : 's'}`}
          </button>
          <small className="muted">Cada família e cada escola recebem um aviso. A localização da van só aparece para uma família quando o próximo destino for a casa ou a escola dela.</small>
        </section>
      </div>
    </>
  );
}

// ---------------- em andamento ----------------

function RotaAoVivo({ d, v }: { d: DadosVan; v: Viagem }) {
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
          <span className="tag tag-azul">{ICONE_TURNO[v.turno]} {NOME_TURNO[v.turno]} · {v.tipo === 'ida' ? 'ida' : 'volta'} · {feitos}/{casas.length} {v.tipo === 'ida' ? 'embarcados' : 'entregues'}</span>
          <span className="tag tag-azul">🏁 fim ~{horaMais(etaFim)}</span>
          {!!v.economiaKm && v.economiaKm > 0.05 && <span className="tag tag-verde">⚡ -{v.economiaKm.toFixed(1)} km otimizados</span>}
          {!v.rotaReal && <span className="tag tag-laranja">Sem internet: rota em linha reta</span>}
        </div>
      </section>
      <section className="pilha">
        <div className="alvo-card">
          {atual?.tipo === 'aluno' ? (() => {
            const a = d.mapaAlunos.get(atual.alunoId)!;
            return (
              <>
                <div className="entre">
                  <span className="muted small" style={{ fontWeight: 800 }}>{v.naParada ? '📍 VOCÊ CHEGOU' : `PRÓXIMA PARADA · ${eta} min`}</span>
                  {atual.prontoEm && <span className="tag tag-verde">🙋 Já está no portão</span>}
                </div>
                <div className="linha" style={{ marginTop: 10 }}>
                  <Avatar aluno={a} tam={48} />
                  <div><div style={{ fontSize: 20, fontWeight: 900 }}>{a.nome}</div><span className="muted small">{a.endereco} · {nomeEsc(a.escolaId)}</span></div>
                </div>
                <div className="botoes">
                  <button className="btn btn-verde" onClick={() => void marcarParada(v.id, 'feito')}>{v.tipo === 'ida' ? '✅ Embarcou' : '🏠 Entregue'}</button>
                  {v.tipo === 'ida' ? <button className="btn btn-vermelho" onClick={() => void marcarParada(v.id, 'ausente')}>🚫 Não estava</button>
                    : <a className="btn btn-claro" href={`tel:${a.telefoneResp}`}>📞 Ligar</a>}
                </div>
              </>
            );
          })() : atual?.tipo === 'escola' ? (() => {
            const e = d.mapaEscolas.get(atual.escolaId)!;
            const lista = daEscola(e.id);
            return (
              <>
                <div className="entre">
                  <span className="muted small" style={{ fontWeight: 800 }}>{v.naParada ? '📍 NA ESCOLA' : `PRÓXIMA ESCOLA · ${eta} min`}</span>
                  <SeloHorario eta={v.naParada ? 0 : eta} horario={horarioAlvo(e, v.turno, v.tipo)} />
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, marginTop: 8 }}>🏫 {e.nome}</div>
                <span className="muted small">{v.tipo === 'ida' ? `Descem ${lista.length}` : `Sobem ${lista.length}`}: {lista.map((p) => primeiroNome(d.mapaAlunos.get(p.alunoId)?.nome ?? '')).join(', ') || '—'}</span>
                <div className="botoes" style={{ gridTemplateColumns: '1fr' }}>
                  <button className="btn btn-verde" onClick={() => void marcarParada(v.id, 'feito')}>{v.tipo === 'ida' ? `✅ Desceram ${lista.length}` : `✅ Embarcaram ${lista.length}`}</button>
                </div>
                {v.tipo === 'volta' && <small className="muted" style={{ display: 'block', marginTop: 8 }}>Algum aluno não veio? Use "Fora" na lista abaixo antes de confirmar.</small>}
              </>
            );
          })() : (
            <>
              <span className="muted small" style={{ fontWeight: 800 }}>ÚLTIMO TRECHO · {eta} min</span>
              <div style={{ fontSize: 20, fontWeight: 900, marginTop: 8 }}>🏁 Indo para {v.destinoNome}</div>
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
                    <span className="n">🏫</span>
                    <div className="info"><strong>{e.nome}</strong><span className="muted small">{p.status === 'ausente' ? 'Sem alunos — pulada' : `${v.tipo === 'ida' ? 'Entrada' : 'Saída'} ${h ?? '—'} · ${casas.filter((c) => c.escolaId === e.id && c.status !== 'ausente').length} aluno(s)`}</span></div>
                    {p.status === 'pendente' ? <SeloHorario eta={etaAte(v, i)} horario={h} /> : <span className="hora">{p.hora ? hora(p.hora) : ''}</span>}
                  </li>
                );
              }
              const a = d.mapaAlunos.get(p.alunoId)!;
              return (
                <li key={p.alunoId} className={cls}>
                  <span className="n">{p.status === 'feito' ? '✓' : p.status === 'ausente' ? '–' : i + 1}</span>
                  <div className="info"><strong>{a.nome}</strong><span className="muted small">{p.status === 'ausente' ? (p.avisou ? 'Combinado: fora deste trecho' : 'Não estava') : p.prontoEm && p.status === 'pendente' ? '🙋 no portão' : `${nomeEsc(a.escolaId)} · ${a.endereco}`}</span></div>
                  {p.status === 'pendente' && i !== v.alvo
                    ? <button className="btn btn-claro btn-sm" title="Tirar deste trecho e reotimizar" onClick={() => void definirPresenca(a.id, v.tipo === 'ida' ? (d.plano(a.id) === 'so_ida' ? 'nao_vai' : 'so_volta') : (d.plano(a.id) === 'so_volta' ? 'nao_vai' : 'so_ida'), undefined, 'motorista')}>Fora</button>
                    : <span className="hora">{p.hora ? hora(p.hora) : ''}</span>}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="card controle-sim">
          <h3>Simulação do GPS</h3>
          <div className="entre"><span>Modo demonstração (confirma sozinho)</span><Toggle on={v.automatico} onChange={(x) => void configurarViagem(v.id, { automatico: x })} /></div>
          <label className="fld"><span>Velocidade</span>
            <select value={v.velocidade} onChange={(e) => void configurarViagem(v.id, { velocidade: Number(e.target.value) })}>{VELOCIDADES.map((x) => <option key={x} value={x}>{x}×</option>)}</select>
          </label>
          <button className="btn btn-claro" onClick={() => { if (confirm('Encerrar a rota agora?')) void encerrarViagem(v.id); }}>⏹ Encerrar rota</button>
        </div>
      </section>
    </div>
  );
}
