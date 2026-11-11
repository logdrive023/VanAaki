import { useMemo, useState } from 'react';
import Mapa3D, { type Linha, type Marcador } from '../../components/Mapa3D';
import { Avatar, Toggle } from '../../components/ui';
import type { TipoViagem, Viagem } from '../../db/types';
import { compCaminho, etaMin, otimizarOrdem } from '../../lib/geo';
import { caminhoAte } from '../../lib/privacidade';
import { hora, horaMais, primeiroNome } from '../../lib/util';
import { definirPresenca } from '../../services/acoes';
import { configurarViagem, encerrarViagem, iniciarViagem, marcarParada } from '../../services/viagem';
import type { DadosVan } from './dados';

const VELOCIDADES = [1, 4, 8, 15, 30];

export function Rota({ d }: { d: DadosVan }) {
  return d.ativa ? <RotaAoVivo d={d} v={d.ativa} /> : <PrepararRota d={d} />;
}

// ---------------- antes de sair ----------------

function PrepararRota({ d }: { d: DadosVan }) {
  const [tipo, setTipo] = useState<TipoViagem>('ida');
  const [otimizar, setOtimizar] = useState(true);
  const [automatico, setAutomatico] = useState(false);
  const [velocidade, setVelocidade] = useState(8);
  const [saindo, setSaindo] = useState(false);
  const [erro, setErro] = useState('');
  const van = d.van!;
  const escola = d.escolas.find((e) => e.id === van.escolaIds[0])!;
  const vao = d.ativos.filter((a) => a.escolaId === escola.id && !d.naoVao.has(a.id));
  const inicio = tipo === 'ida' ? van.garagem : escola.local;
  const fim = tipo === 'ida' ? escola.local : van.garagem;

  const previa = useMemo(() => {
    const locais = vao.map((a) => a.local);
    const ordem = otimizar ? otimizarOrdem(inicio, locais, fim) : vao.map((_, i) => i);
    const pts = [inicio, ...ordem.map((i) => locais[i]), fim];
    const kmBase = compCaminho([inicio, ...locais, fim]) / 1000;
    const km = compCaminho(pts) / 1000;
    return { ordem: ordem.map((i) => vao[i]), pts, km, economia: Math.max(0, kmBase - km), min: etaMin(pts, vao.length) };
  }, [vao.map((a) => a.id).join(), otimizar, tipo]); // eslint-disable-line react-hooks/exhaustive-deps

  const marcadores: Marcador[] = [
    { id: 'garagem', pos: van.garagem, tipo: 'garagem', rotulo: 'Garagem' },
    { id: 'escola', pos: escola.local, tipo: 'escola', rotulo: escola.nome },
    ...previa.ordem.map((a, i) => ({ id: a.id, pos: a.local, tipo: 'parada' as const, texto: String(i + 1), rotulo: primeiroNome(a.nome) })),
  ];
  const sair = async () => {
    setErro(''); setSaindo(true);
    try { await iniciarViagem(van.id, tipo, { otimizar, automatico, velocidade }); } catch (e) { setErro((e as Error).message); }
    setSaindo(false);
  };

  return (
    <>
      {d.ultima && (
        <div className="alerta-otim" style={{ marginBottom: 0 }}>🏁 <span><b>Última rota concluída às {hora(d.ultima.concluidaEm)}</b> · {d.ultima.paradas.filter((p) => p.status === 'feito').length} alunos {d.ultima.tipo === 'ida' ? `levados para ${d.ultima.destinoNome}` : 'entregues em casa'}.</span></div>
      )}
      <div className="rota-grid">
        <section className="card" style={{ padding: 12 }}>
          <Mapa3D altura="min(62vh, 560px)" marcadores={marcadores} linhas={[{ id: 'p', pts: previa.pts, tipo: 'previa' }]} enquadrar={previa.pts} chave={`${tipo}|${previa.ordem.length}`} />
          <div className="linha" style={{ padding: '12px 6px 2px' }}>
            <span className="tag tag-azul">📏 ~{previa.km.toFixed(1)} km</span>
            <span className="tag tag-azul">⏱️ ~{previa.min} min</span>
            {otimizar && previa.economia > 0.05 && <span className="tag tag-verde">⚡ Otimização economiza {previa.economia.toFixed(1)} km</span>}
            <span className="muted small">A linha tracejada é a ordem prevista. Ao sair, a rota é traçada pelas ruas.</span>
          </div>
        </section>
        <section className="card pilha">
          <h3>Preparar saída</h3>
          <div className="abas" style={{ alignSelf: 'start' }}>
            <a className={tipo === 'ida' ? 'ativo' : ''} onClick={() => setTipo('ida')}>☀️ Ida (casa → escola)</a>
            <a className={tipo === 'volta' ? 'ativo' : ''} onClick={() => setTipo('volta')}>🏠 Volta</a>
          </div>
          <label className="check"><input type="checkbox" checked={otimizar} onChange={(e) => setOtimizar(e.target.checked)} /> Otimizar a ordem das paradas</label>
          <label className="check"><input type="checkbox" checked={automatico} onChange={(e) => setAutomatico(e.target.checked)} /> Modo demonstração (embarca sozinho)</label>
          <label className="fld"><span>Velocidade da simulação</span>
            <select value={velocidade} onChange={(e) => setVelocidade(Number(e.target.value))}>{VELOCIDADES.map((v) => <option key={v} value={v}>{v}× {v === 1 ? '(tempo real)' : ''}</option>)}</select>
          </label>
          <div>
            <div className="entre"><strong>Alunos ({vao.length})</strong><span className="muted small">desligue quem não vai</span></div>
            {d.ativos.filter((a) => a.escolaId === escola.id).map((a) => {
              const i = previa.ordem.findIndex((x) => x.id === a.id);
              return (
                <div key={a.id} className="linha-item">
                  <div className="aluno-cel"><Avatar aluno={a} tam={34} /><div><strong>{i >= 0 ? `${i + 1}. ` : ''}{a.nome}</strong><span className="muted small">{a.endereco}</span></div></div>
                  <Toggle on={!d.naoVao.has(a.id)} onChange={(v) => void definirPresenca(a.id, v, v ? undefined : 'Marcado pelo tio')} />
                </div>
              );
            })}
          </div>
          {erro && <span className="tag tag-vermelho">{erro}</span>}
          <button className="btn btn-primario btn-bloco" disabled={saindo || !vao.length} onClick={() => void sair()}>
            {saindo ? '🛰️ Traçando a rota pelas ruas…' : `▶ Iniciar ${tipo === 'ida' ? 'ida' : 'volta'} com ${vao.length} alunos`}
          </button>
          <small className="muted">Ao iniciar, cada família recebe um aviso. A localização da van só aparece para uma família quando for a vez dela.</small>
        </section>
      </div>
    </>
  );
}

// ---------------- em andamento ----------------

function RotaAoVivo({ d, v }: { d: DadosVan; v: Viagem }) {
  const fim = v.paradas.length;
  const atual = v.alvo < fim ? v.paradas[v.alvo] : undefined;
  const aAtual = atual ? d.mapaAlunos.get(atual.alunoId) : undefined;
  const eta = etaMin([v.pos, ...v.caminho], 0, v.rotaReal);
  const restante = caminhoAte(v, fim);
  const etaFim = etaMin(restante, v.paradas.filter((p) => p.status === 'pendente').length, v.rotaReal);
  const feitos = v.paradas.filter((p) => p.status === 'feito').length;

  const marcadores: Marcador[] = [
    { id: 'fim', pos: v.destino, tipo: v.tipo === 'ida' ? 'escola' : 'garagem', rotulo: v.destinoNome },
    ...v.paradas.map((p, i): Marcador => {
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
          <span className="tag tag-azul">{v.tipo === 'ida' ? '☀️ Ida' : '🏠 Volta'} · {feitos}/{fim} {v.tipo === 'ida' ? 'a bordo' : 'entregues'}</span>
          <span className="tag tag-azul">🏁 {v.destinoNome} ~{horaMais(etaFim)}</span>
          {!!v.economiaKm && v.economiaKm > 0.05 && <span className="tag tag-verde">⚡ -{v.economiaKm.toFixed(1)} km otimizados</span>}
          {!v.rotaReal && <span className="tag tag-laranja">Sem internet: rota em linha reta</span>}
        </div>
      </section>
      <section className="pilha">
        <div className="alvo-card">
          {atual && aAtual ? (
            <>
              <div className="entre">
                <span className="muted small" style={{ fontWeight: 800 }}>{v.naParada ? '📍 VOCÊ CHEGOU' : `PRÓXIMA PARADA · ${eta} min`}</span>
                {atual.prontoEm && <span className="tag tag-verde">🙋 Já está no portão</span>}
              </div>
              <div className="linha" style={{ marginTop: 10 }}>
                <Avatar aluno={aAtual} tam={48} />
                <div><div style={{ fontSize: 20, fontWeight: 900 }}>{aAtual.nome}</div><span className="muted small">{aAtual.endereco}</span></div>
              </div>
              <div className="botoes">
                <button className="btn btn-verde" onClick={() => void marcarParada(v.id, 'feito')}>{v.tipo === 'ida' ? '✅ Embarcou' : '🏠 Entregue'}</button>
                {v.tipo === 'ida' ? <button className="btn btn-vermelho" onClick={() => void marcarParada(v.id, 'ausente')}>🚫 Não estava</button>
                  : <a className="btn btn-claro" href={`tel:${aAtual.telefoneResp}`}>📞 Ligar</a>}
              </div>
              {!v.naParada && <small className="muted" style={{ display: 'block', marginTop: 8 }}>Pode confirmar ao chegar. A família já foi avisada que é a vez dela.</small>}
            </>
          ) : (
            <>
              <span className="muted small" style={{ fontWeight: 800 }}>ÚLTIMO TRECHO · {eta} min</span>
              <div style={{ fontSize: 20, fontWeight: 900, marginTop: 8 }}>🏁 Indo para {v.destinoNome}</div>
              <span className="muted small">{feitos} alunos a bordo. Quem confirma a chegada é a portaria da escola.</span>
            </>
          )}
        </div>

        <div className="card">
          <div className="card-topo"><h3>Paradas</h3><span className="muted small">{v.paradas.filter((p) => p.status === 'pendente').length} faltando</span></div>
          <ol className="rota-lista">
            {v.paradas.map((p, i) => {
              const a = d.mapaAlunos.get(p.alunoId)!;
              const cls = p.status === 'feito' ? 'feito' : p.status === 'ausente' ? 'ausente' : i === v.alvo ? 'agora' : '';
              return (
                <li key={p.alunoId} className={cls}>
                  <span className="n">{p.status === 'feito' ? '✓' : p.status === 'ausente' ? '–' : i + 1}</span>
                  <div className="info"><strong>{a.nome}</strong><span className="muted small">{p.status === 'ausente' ? (p.avisou ? 'Família avisou que não vai' : 'Não estava') : p.prontoEm && p.status === 'pendente' ? '🙋 no portão' : a.endereco}</span></div>
                  {p.status === 'pendente' && i !== v.alvo
                    ? <button className="btn btn-claro btn-sm" title="Tirar da rota e reotimizar" onClick={() => void definirPresenca(a.id, false, 'Marcado pelo tio')}>Não vai</button>
                    : <span className="hora">{p.hora ? hora(p.hora) : ''}</span>}
                </li>
              );
            })}
            <li className={v.status === 'concluida' ? 'feito' : ''}><span className="n">🏁</span><div className="info"><strong>{v.destinoNome}</strong><span className="muted small">Chegada prevista</span></div><span className="hora">~{horaMais(etaFim)}</span></li>
          </ol>
        </div>

        <div className="card controle-sim">
          <h3>Simulação do GPS</h3>
          <div className="entre"><span>Modo demonstração (embarca sozinho)</span><Toggle on={v.automatico} onChange={(x) => void configurarViagem(v.id, { automatico: x })} /></div>
          <label className="fld"><span>Velocidade</span>
            <select value={v.velocidade} onChange={(e) => void configurarViagem(v.id, { velocidade: Number(e.target.value) })}>{VELOCIDADES.map((x) => <option key={x} value={x}>{x}×</option>)}</select>
          </label>
          <button className="btn btn-claro" onClick={() => { if (confirm('Encerrar a rota agora?')) void encerrarViagem(v.id); }}>⏹ Encerrar rota</button>
        </div>
      </section>
    </div>
  );
}
