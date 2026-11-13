import { useMemo, useState } from 'react';
import { I } from '../../components/Icone';
import Mapa3D, { type Marcador } from '../../components/Mapa3D';
import { SeletorPlano } from '../../components/presenca';
import { Avatar, ir } from '../../components/ui';
import { TURNOS, type Aluno, type TipoViagem, type Turno } from '../../db/types';
import { etaMin } from '../../lib/geo';
import { hhmm, horarioAlvo, minutos, NOME_TURNO, nomePlano, planoDe } from '../../lib/turnos';
import { hoje, hora, primeiroNome } from '../../lib/util';
import { definirPresenca } from '../../services/acoes';
import type { DadosVan } from './dados';
import { planejarTrecho, presencasDoDia, type PlanoTrecho } from './plano';

/** Próximos dias úteis (hoje + 9), no fuso do aparelho. */
function proximosDias(n = 10) {
  const l: string[] = [];
  const d = new Date();
  while (l.length < n) {
    if (d.getDay() !== 0 && d.getDay() !== 6) l.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    d.setDate(d.getDate() + 1);
  }
  return l;
}
const rotuloDia = (data: string) => {
  const d = new Date(`${data}T12:00:00`);
  return { sem: data === hoje() ? 'Hoje' : d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''), num: d.getDate(), longo: d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) };
};

/**
 * Agenda do tio: escolhe o dia, vê os turnos, toca num turno e vê o caminho daquele trecho
 * (ordem das paradas, horários) com quem vai e quem não vai — e muda o combinado ali mesmo.
 */
export function Agenda({ d }: { d: DadosVan }) {
  const dias = useMemo(() => proximosDias(), []);
  const [dia, setDia] = useState(dias[0]);
  const presenca = presencasDoDia(d.agenda, dia);
  const turnos = d.van!.turnos.filter((t) => t.ativo && t.escolaIds.length);
  const [aberto, setAberto] = useState<Turno | null>(turnos[0]?.turno ?? null);
  const combinados = d.agenda.filter((p) => p.data === dia && planoDe(p) !== 'ambos' && d.ativos.some((a) => a.id === p.alunoId));
  const r = rotuloDia(dia);
  const combinadosPorDia = (data: string) => d.agenda.filter((p) => p.data === data && planoDe(p) !== 'ambos').length;

  return (
    <div className="pilha agenda">
      <div className="dias" role="tablist">
        {dias.map((x) => {
          const rr = rotuloDia(x); const n = combinadosPorDia(x);
          return (
            <button key={x} role="tab" aria-selected={x === dia} className={`dia ${x === dia ? 'ativo' : ''}`} onClick={() => setDia(x)}>
              <small>{rr.sem}</small><strong>{rr.num}</strong>{n > 0 ? <i className="dia-marca">{n}</i> : <i className="dia-vazio" />}
            </button>
          );
        })}
      </div>

      <div className="entre agenda-resumo">
        <div><strong>{r.longo[0].toUpperCase() + r.longo.slice(1)}</strong><span className="muted small" style={{ display: 'block' }}>{turnos.length} turno(s) · {combinados.length ? `${combinados.length} combinado(s) diferente(s)` : 'todos vão e voltam'}</span></div>
      </div>

      {!turnos.length && <div className="card vazio"><span className="ic"><I n="calendario" /></span>Cadastre os turnos e as escolas para ver a agenda.<button className="btn btn-primario btn-sm" onClick={() => ir('motorista/painel')}>Configurar turnos</button></div>}

      {TURNOS.filter((t) => turnos.some((x) => x.turno === t)).map((t) => (
        <CartaoTurnoAgenda key={`${dia}-${t}`} d={d} dia={dia} turno={t} presenca={presenca} aberto={aberto === t} onAbrir={() => setAberto(aberto === t ? null : t)} />
      ))}
    </div>
  );
}

function CartaoTurnoAgenda({ d, dia, turno, presenca, aberto, onAbrir }: {
  d: DadosVan; dia: string; turno: Turno; presenca: ReturnType<typeof presencasDoDia>; aberto: boolean; onAbrir: () => void;
}) {
  const [tipo, setTipo] = useState<TipoViagem>(() => (dia === hoje() && new Date().getHours() * 60 + new Date().getMinutes() > minutos(d.escolas.find((e) => d.van!.turnos.find((x) => x.turno === turno)?.escolaIds.includes(e.id))?.horarios[turno]?.entrada ?? '23:59') ? 'volta' : 'ida'));
  const ida = useMemo(() => planejarTrecho(d, turno, 'ida', presenca, new Date(`${dia}T00:00:00`)), [d, turno, presenca, dia]);
  const volta = useMemo(() => planejarTrecho(d, turno, 'volta', presenca, new Date(`${dia}T00:00:00`)), [d, turno, presenca, dia]);
  const p = tipo === 'ida' ? ida : volta;
  const ehHoje = dia === hoje();
  const estado = (tp: TipoViagem) => {
    if (!ehHoje) return null;
    const vs = d.viagensHoje.filter((v) => v.turno === turno && v.tipo === tp && v.status !== 'cancelada');
    const v = vs.find((x) => x.status === 'em_andamento') ?? vs[vs.length - 1];
    if (!v) return null;
    return v.status === 'em_andamento' ? <span className="tag tag-verde ao-vivo"><span className="ponto" />agora</span> : <span className="tag"><I n="check" />{hora(v.concluidaEm)}</span>;
  };
  const resumo = (x: PlanoTrecho, tp: TipoViagem) => (
    <button type="button" className={`trecho-resumo ${aberto && tipo === tp ? 'ativo' : ''}`} onClick={(e) => { e.stopPropagation(); setTipo(tp); if (!aberto) onAbrir(); }}>
      <span className="tr-ic"><I n={tp === 'ida' ? 'escola' : 'casa'} /></span>
      <span className="tr-txt"><strong>{tp === 'ida' ? 'Ida' : 'Volta'}</strong><small>{tp === 'ida' ? `sair ${x.horario.sairAs ?? '—'}` : `escola ${x.horario.sairAs ?? '—'}`} · fim ~{x.horario.fimAs}</small></span>
      <span className="tr-num"><b>{x.vao.length}</b>/{x.doTurno.length}</span>
      {estado(tp)}
    </button>
  );
  return (
    <section className={`card turno-agenda ${aberto ? 'aberto' : ''}`}>
      <button type="button" className="ta-cab" onClick={onAbrir} aria-expanded={aberto}>
        <span className="turno-titulo"><I n={turno} />{NOME_TURNO[turno]}</span>
        <span className="muted small">{ida.doTurno.length} aluno(s)</span>
        <I n="chevron" className="ta-seta" />
      </button>
      <div className="trechos-resumo">{resumo(ida, 'ida')}{resumo(volta, 'volta')}</div>
      {aberto && <DetalheTrecho d={d} p={p} dia={dia} />}
    </section>
  );
}

/** O caminho do trecho: garagem → casas → escolas (ou o contrário), com horário, e quem está fora. */
function DetalheTrecho({ d, p, dia }: { d: DadosVan; p: PlanoTrecho; dia: string }) {
  const [mapa, setMapa] = useState(false);
  const base = p.horario.sairAs ? minutos(p.horario.sairAs) : null;
  const horaParada = (i: number) => (base === null ? '' : `~${hhmm(base + etaMin(p.pts.slice(0, i + 2), i))}`);
  const mudar = (a: Aluno, plano: Parameters<typeof definirPresenca>[1]) => void definirPresenca(a.id, plano, undefined, 'motorista', dia === hoje() ? undefined : dia);
  const numero = new Map(p.paradas.map((x, i) => [x.tipo === 'aluno' ? x.alunoId : `esc:${x.escolaId}`, i + 1]));
  const mk: Marcador[] = [
    { id: 'garagem', pos: d.van!.garagem, tipo: 'garagem' },
    ...p.escolas.map((e) => ({ id: `esc:${e.id}`, pos: e.local, tipo: 'escola' as const, rotulo: e.nome })),
    ...p.vao.map((a) => ({ id: a.id, pos: a.local, tipo: 'parada' as const, texto: String(numero.get(a.id) ?? ''), rotulo: primeiroNome(a.nome) })),
  ];
  return (
    <div className="detalhe-trecho">
      <div className="entre" style={{ flexWrap: 'wrap' }}>
        <span className="linha" style={{ gap: 6 }}>
          <span className="tag"><I n="rota" />~{p.km.toFixed(1)} km</span>
          <span className="tag"><I n="cronometro" />~{p.min} min</span>
          {p.fixa && <span className="tag"><I n="pin" />rota fixa</span>}
        </span>
        <button className="btn btn-fantasma btn-sm" onClick={() => setMapa(!mapa)}><I n="mapa" />{mapa ? 'Esconder mapa' : 'Ver no mapa'}</button>
      </div>
      {mapa && <Mapa3D altura={240} marcadores={mk} linhas={[{ id: 'p', pts: p.pts, tipo: 'previa' }]} enquadrar={[d.van!.garagem, ...p.pts]} chave={`${dia}|${p.turno}|${p.tipo}|${p.vao.length}`} />}

      <ol className="caminho">
        {p.tipo === 'ida' && <li className="cm-ponta"><span className="cm-b"><I n="van" /></span><div><strong>Sai da garagem</strong></div><time>{p.horario.sairAs ?? '—'}</time></li>}
        {p.paradas.map((x, i) => {
          if (x.tipo === 'escola') {
            const e = d.mapaEscolas.get(x.escolaId)!;
            const h = p.horario.escolas.find((z) => z.escolaId === e.id);
            const atraso = h && h.folga !== null && h.folga < 0 && p.tipo === 'ida';
            return (
              <li key={`e${e.id}`} className="cm-escola">
                <span className="cm-b"><I n="escola" /></span>
                <div><strong>{e.nome}</strong><small>{p.tipo === 'ida' ? `entra ${horarioAlvo(e, p.turno, 'ida') ?? '—'}` : `sai ${horarioAlvo(e, p.turno, 'volta') ?? '—'}`}{h?.espera ? ` · espera ${h.espera} min` : ''}</small></div>
                <time className={atraso ? 'vermelho' : ''}>~{h?.chegada ?? ''}</time>
              </li>
            );
          }
          const a = d.mapaAlunos.get(x.alunoId)!;
          return (
            <li key={a.id}>
              <span className="cm-b cm-n">{i + 1 - p.paradas.slice(0, i).filter((z) => z.tipo === 'escola').length}</span>
              <div className="cm-aluno"><Avatar aluno={a} tam={30} /><span><strong>{a.nome}</strong><small>{a.endereco}</small></span></div>
              <time>{p.tipo === 'ida' ? horaParada(i) : ''}</time>
            </li>
          );
        })}
        {p.tipo === 'volta' && <li className="cm-ponta"><span className="cm-b"><I n="van" /></span><div><strong>Volta para a garagem</strong></div><time>~{p.horario.fimAs}</time></li>}
        {!p.vao.length && <li className="cm-vazio"><div className="muted small">Ninguém vai neste trecho neste dia.</div></li>}
      </ol>

      <div className="quem">
        <div className="quem-col">
          <span className="quem-rot"><span className="bolinha-status ok" />Vão ({p.vao.length})</span>
          <div className="quem-lista">
            {p.vao.map((a) => (
              <div key={a.id} className="quem-item">
                <Avatar aluno={a} tam={30} /><span className="qi-nome">{primeiroNome(a.nome)}</span>
                <SeletorPlano valor={planoDe(d.agenda.find((x) => x.alunoId === a.id && x.data === dia))} onChange={(pl) => mudar(a, pl)} />
              </div>
            ))}
          </div>
        </div>
        <div className="quem-col">
          <span className="quem-rot"><span className="bolinha-status fora" />Não vão ({p.fora.length})</span>
          <div className="quem-lista">
            {p.fora.map((a) => {
              const pr = d.agenda.find((x) => x.alunoId === a.id && x.data === dia);
              return (
                <div key={a.id} className="quem-item fora">
                  <Avatar aluno={a} tam={30} /><span className="qi-nome">{primeiroNome(a.nome)}<small>{nomePlano(planoDe(pr)).nome}{pr?.motivo ? ` · ${pr.motivo}` : ''}</small></span>
                  <button className="btn btn-claro btn-sm" onClick={() => mudar(a, 'ambos')}>Vai</button>
                </div>
              );
            })}
            {!p.fora.length && <span className="muted small">Todo mundo vai.</span>}
          </div>
        </div>
      </div>
      {dia === hoje() && <button className="btn btn-primario btn-bloco btn-grande" onClick={() => ir(`motorista/rota/${p.turno}`)}><I n="navegar" />Ir para a rota da {NOME_TURNO[p.turno].toLowerCase()}</button>}
    </div>
  );
}
