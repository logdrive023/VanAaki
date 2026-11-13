import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Feed } from '../components/gamificacao';
import Mapa3D from '../components/Mapa3D';
import { ShellPainel, type ItemMenu } from '../components/Shell';
import { Avatar, Kpi, Toggle, Vazio } from '../components/ui';
import { I } from '../components/Icone';
import { db } from '../db/db';
import { useEu } from '../api/sync';
import { FormEscola } from '../components/formularios';
import { ConversasRecados } from '../components/recados';
import { TURNOS, type Aluno, type Escola as TEscola, type Presenca, type TipoViagem, type Turno, type Van, type Viagem } from '../db/types';
import { tipoEvento } from '../lib/gamificacao';
import { visaoEscola } from '../lib/privacidade';
import { NOME_TURNO, nomePlano, planoDe, turnoAgora } from '../lib/turnos';
import { dataLonga, hoje, hora, horaMais } from '../lib/util';
import { credenciar, definirConfirmaEntrada } from '../services/acoes';
import { confirmarEntradaEscola, idxAluno } from '../services/viagem';

export default function Escola({ aba = 'chegadas' }: { aba?: string }) {
  const eu = useEu();
  const escolaId = eu?.escolaId ?? '';
  const escolas = useLiveQuery(() => db.escolas.toArray());
  const escola = escolas?.find((e) => e.id === escolaId);
  const [editando, setEditando] = useState(false);
  const turnosEscola = TURNOS.filter((t) => escola?.horarios[t]);
  const [turnoSel, setTurno] = useState<Turno | null>(null);
  const turno: Turno = turnoSel && turnosEscola.includes(turnoSel) ? turnoSel : (turnosEscola.includes(turnoAgora()) ? turnoAgora() : turnosEscola[0] ?? 'manha');

  const vans = useLiveQuery(() => db.vans.filter((v) => v.escolaIds.includes(escolaId)).toArray(), [escolaId]) ?? [];
  const alunos = useLiveQuery(() => db.alunos.where('escolaId').equals(escolaId).filter((a) => a.ativo).toArray(), [escolaId]) ?? [];
  const viagens = useLiveQuery(() => db.viagens.where('data').equals(hoje()).filter((v) => v.escolaIds.includes(escolaId) && v.status !== 'cancelada').toArray(), [escolaId]) ?? [];
  const presencas = useLiveQuery(() => db.presencas.where('data').equals(hoje()).toArray()) ?? [];
  const recadosNovos = useLiveQuery(() => db.recados.filter((r) => r.de === 'motorista' && !r.lida).count()) ?? 0;
  if (!escola) return <div className="vazio">Carregando…</div>;

  const mapaAlunos = new Map(alunos.map((a) => [a.id, a]));
  const doTurno = viagens.filter((v) => v.turno === turno);
  const aConfirmar = !escola.confirmaEntrada ? 0 : viagens.filter((v) => v.tipo === 'ida').flatMap((v) => v.paradas.filter((p) => p.tipo === 'aluno' && p.escolaId === escola.id && p.status === 'feito' && !p.recebidoEscolaEm
    && v.paradas.some((s) => s.tipo === 'escola' && s.escolaId === escola.id && s.status === 'feito'))).length;
  const pendCred = vans.filter((v) => v.credenciamento[escola.id] === 'pendente').length;
  const menu: ItemMenu[] = [
    { id: 'chegadas', ic: 'portaria', nome: 'Portaria', badge: aConfirmar },
    { id: 'vans', ic: 'van', nome: 'Vans', badge: pendCred },
    { id: 'alunos', ic: 'alunos', nome: 'Alunos' },
    { id: 'recados', ic: 'mensagem', nome: 'Recados', badge: recadosNovos },
    { id: 'ocorrencias', ic: 'lista', nome: 'Ocorrências', curto: 'Ocorrên­cias' },
  ];
  const titulos: Record<string, string> = { chegadas: 'Portaria', vans: 'Vans credenciadas', alunos: 'Alunos que usam van', ocorrencias: 'Ocorrências nas vans', recados: 'Recados com as vans' };
  const perfil = (
    <div className="perfil-side">
      <Avatar nome={escola.nome} cor="#00B894" />
      <div style={{ minWidth: 0 }}>
        <strong>{escola.nome}</strong>
        <small>{eu?.usuario.nome}</small>
      </div>
    </div>
  );
  const seletorTurno = (
    <div className="card pilha" style={{ padding: 14 }}>
      <div className="entre">
        <div className="chips-turno">
          {turnosEscola.map((t) => (
            <button key={t} className={`chip-turno ${turno === t ? 'ativo' : ''}`} onClick={() => setTurno(t)}><I n={t} />{NOME_TURNO[t]}</button>
          ))}
        </div>
        <span className="linha" style={{ gap: 6 }}>
          <span className="tag"><I n="relogio" />entrada {escola.horarios[turno]?.entrada} · saída {escola.horarios[turno]?.saida}</span>
          <button className="btn btn-claro btn-sm" onClick={() => setEditando(true)}><I n="config" />Horários</button>
        </span>
      </div>
    </div>
  );
  return (
    <ShellPainel base="escola" menu={menu} atual={aba} perfil={perfil} filtro={{ para: 'escola', escolaId: escola.id }} titulo={`${titulos[aba] ?? ''}`} sub={`${escola.nome} · ${dataLonga()}`}>
      {(aba === 'chegadas' || aba === 'alunos') && seletorTurno}
      {aba === 'chegadas' && <Portaria escola={escola} turno={turno} vans={vans} viagens={doTurno} alunos={mapaAlunos} />}
      {aba === 'vans' && <Vans escola={escola} vans={vans} alunos={alunos} />}
      {aba === 'alunos' && <AlunosEscola escola={escola} turno={turno} alunos={alunos.filter((a) => a.turno === turno)} vans={vans} viagens={doTurno} presencas={presencas} />}
      {aba === 'ocorrencias' && <Ocorrencias alunos={mapaAlunos} />}
      {aba === 'recados' && <ConversasRecados eu="escola" conversas={vans.map((v) => ({ vanId: v.id, escolaId: escola.id, nome: v.nome, detalhe: `${v.motorista} · ${v.placa} · ${v.telefone}` }))} />}
      {editando && <FormEscola inicial={escola} onFechar={() => setEditando(false)} />}
    </ShellPainel>
  );
}

// ---------------- portaria ----------------

function Portaria({ escola, turno, vans, viagens, alunos }: { escola: TEscola; turno: Turno; vans: Van[]; viagens: Viagem[]; alunos: Map<string, Aluno> }) {
  const doTurno = vans.filter((v) => v.credenciamento[escola.id] === 'credenciada' && v.turnos.some((t) => t.turno === turno && t.ativo && t.escolaIds.includes(escola.id)));
  const ultima = (vanId: string, tipo: TipoViagem) => {
    const l = viagens.filter((v) => v.vanId === vanId && v.tipo === tipo).sort((a, b) => b.iniciadaEm.localeCompare(a.iniciadaEm));
    return l.find((v) => v.status === 'em_andamento') ?? l[0];
  };
  // resumo do turno: quantas vans faltam chegar e quantas estão atrasadas
  const resumo = doTurno.map((van) => {
    const ida = ultima(van.id, 'ida'), volta = ultima(van.id, 'volta');
    return { van, ida, volta, vi: ida && visaoEscola(ida, escola), vv: volta && visaoEscola(volta, escola) };
  });
  const atrasadas = resumo.filter((r) => (r.vi?.atraso ?? 0) > 0 || (r.vv?.atraso ?? 0) > 0).length;
  const chegaram = resumo.filter((r) => r.vi?.estado === 'feito' || r.vi?.estado === 'na_porta').length;

  return (
    <div className="pilha">
      {!doTurno.length && <Vazio ic="van">Nenhuma van credenciada atende este turno</Vazio>}
      {resumo.map(({ van, ida, volta, vi, vv }) => (
        <section key={van.id} className="card pilha">
          <div className="aluno-cel"><Avatar nome={van.motorista} cor="#6C5CE7" /><div><strong>{van.nome}</strong><span className="muted small">{van.modelo} · <span className="placa">{van.placa}</span> · {van.telefone}</span></div></div>
          <Trecho titulo={<><I n="escola" />Entrada (ida)</>} v={ida} ve={vi} escola={escola} alunos={alunos} />
          <Trecho titulo={<><I n="casa" />Saída (volta)</>} v={volta} ve={vv} escola={escola} alunos={alunos} />
        </section>
      ))}
      <section className="kpis">
        <Kpi ic="van" rot="Vans no turno" num={doTurno.length} sub="credenciadas" />
        <Kpi ic="check" rot="Já chegaram" num={chegaram} sub="na entrada" subCls={chegaram ? 'verde' : 'muted'} />
        <Kpi ic="alerta" rot="Previsão de atraso" num={atrasadas} sub={atrasadas ? 'avise a coordenação' : 'tudo no horário'} subCls={atrasadas ? 'vermelho' : 'muted'} />
        <Kpi ic="relogio" rot="Entrada" num={escola.horarios[turno]?.entrada ?? '—'} sub={`saída ${escola.horarios[turno]?.saida ?? '—'}`} />
      </section>
      <section className="card confirma-entrada">
        <div><strong>Confirmar a entrada na portaria</strong><br /><span className="muted small">{escola.confirmaEntrada
          ? 'Ligado: a portaria confirma cada aluno no app e os pais recebem "entrou na escola".'
          : 'Desligado: a entrega fica com o tio. Quando ele marca "Desceram", os pais já são avisados.'}</span></div>
        <Toggle on={!!escola.confirmaEntrada} onChange={(x) => void definirConfirmaEntrada(escola.id, x)} />
      </section>
      <div className="privacidade"><span className="ic"><I n="escudo" /></span><span>A escola vê quantos alunos estão a bordo e a previsão. A posição da van no mapa só aparece quando o <b>próximo destino dela é esta escola</b>.</span></div>
    </div>
  );
}

function Trecho({ titulo, v, ve, escola, alunos }: { titulo: React.ReactNode; v?: Viagem; ve?: ReturnType<typeof visaoEscola>; escola: TEscola; alunos: Map<string, Aluno> }) {
  if (!v || !ve) return <div className="trecho-status"><span>{titulo}</span><span className="muted">ainda não saiu</span></div>;
  const ida = v.tipo === 'ida';
  const atrasoTag = ve.atraso !== null && ve.atraso > 0 ? <span className="tag atraso"><I n="alerta" />~{ve.atraso} min atrasada</span>
    : ve.atraso !== null ? <span className="tag no-horario"><I n="check" />no horário</span> : null;
  let status: React.ReactNode;
  if (ve.estado === 'pulada') status = <span className="muted">sem alunos desta escola</span>;
  else if (ve.estado === 'feito') status = <span className="tag"><I n="check" />{ida ? `Deixou ${ve.abordo}` : `Saiu com ${ve.total}`} às {hora(ve.hora)}</span>;
  else if (ve.estado === 'na_porta') status = <span className="tag tag-verde"><I n="pin" />Na porta agora</span>;
  else if (ve.estado === 'encerrada') status = <span className="muted">rota encerrada</span>;
  else status = <span className="tag tag-verde ao-vivo"><span className="ponto" /> chega ~{horaMais(ve.eta)}</span>;
  return (
    <div className="pilha" style={{ gap: 8 }}>
      <div className="trecho-status"><span>{titulo}</span>{status}</div>
      {ve.estado === 'a_caminho' && (
        <div className="linha">
          {ida ? <span className="tag"><I n="van" />{ve.abordo} a bordo para cá</span> : <span className="tag"><I n="alunos" />vai buscar {ve.aBuscar}</span>}
          {ida && ve.aBuscar > 0 && <span className="tag tag-amarelo">ainda busca {ve.aBuscar} em casa</span>}
          {ve.paradasAntes > 0 ? <span className="tag tag-cinza">{ve.paradasAntes} parada(s) antes</span> : <span className="tag tag-cinza">vindo direto</span>}
          <span className="tag"><I n="cronometro" />~{ve.eta} min</span>
          {atrasoTag}
        </div>
      )}
      {ve.mostrarMapa && <Mapa3D altura={280} marcadores={[{ id: 'escola', pos: escola.local, tipo: 'escola', rotulo: escola.nome }, { id: 'van', pos: v.pos, tipo: 'van' }]} linhas={[{ id: 'r', pts: ve.caminho, tipo: 'rota' }]} seguir={v.pos} />}
      {ida && ve.estado === 'feito' && !escola.confirmaEntrada && (
        <span className="muted small">Entregues pelo tio: {v.paradas.filter((p) => p.tipo === 'aluno' && p.escolaId === escola.id && p.status === 'feito').map((p) => alunos.get(p.alunoId)?.nome.split(' ')[0]).filter(Boolean).join(', ') || '—'}</span>
      )}
      {ida && ve.estado === 'feito' && escola.confirmaEntrada && (
        <>
          <strong className="small">Confirme a entrada (os pais são avisados na hora)</strong>
          {v.paradas.filter((p) => p.tipo === 'aluno' && p.escolaId === escola.id && p.status === 'feito').map((p) => {
            const a = alunos.get(p.alunoId);
            if (!a) return null;
            return (
              <div key={p.alunoId} className="linha-item">
                <div className="aluno-cel"><Avatar aluno={a} tam={36} /><div><strong>{a.nome}</strong><span className="muted small">{a.serie} · embarcou {hora(p.hora)}</span></div></div>
                {p.recebidoEscolaEm ? <span className="tag tag-verde"><I n="check" />{hora(p.recebidoEscolaEm)}</span>
                  : <button className="btn btn-escuro btn-sm" onClick={() => void confirmarEntradaEscola(v.id, p.alunoId)}>Confirmar</button>}
              </div>
            );
          })}
          {v.paradas.some((p) => p.tipo === 'aluno' && p.escolaId === escola.id && p.status === 'feito' && !p.recebidoEscolaEm) && (
            <button className="btn btn-primario btn-sm" style={{ alignSelf: 'start' }} onClick={() => void confirmarEntradaEscola(v.id, v.paradas.filter((x) => x.tipo === 'aluno' && x.escolaId === escola.id && x.status === 'feito' && !x.recebidoEscolaEm).map((x) => x.alunoId))}><I n="checks" />Confirmar todos</button>
          )}
        </>
      )}
    </div>
  );
}

// ---------------- vans ----------------

function Vans({ escola, vans, alunos }: { escola: TEscola; vans: Van[]; alunos: Aluno[] }) {
  return (
    <section className="card">
      <div className="tabela-wrap">
        <table className="tabela">
          <thead><tr><th>Van</th><th>Motorista</th><th>Turnos aqui</th><th>Alunos daqui</th><th>Situação</th><th style={{ textAlign: 'right' }}>Ações</th></tr></thead>
          <tbody>
            {vans.map((v) => {
              const s = v.credenciamento[escola.id];
              const turnos = v.turnos.filter((t) => t.ativo && t.escolaIds.includes(escola.id)).map((t) => NOME_TURNO[t.turno]).join(' · ');
              return (
                <tr key={v.id}>
                  <td><strong>{v.nome}</strong><br /><span className="muted small">{v.modelo} · <span className="placa">{v.placa}</span> · nota {v.avaliacao.toFixed(1)}</span></td>
                  <td data-rot="Motorista">{v.motorista}<br /><span className="muted small">{v.telefone}</span></td>
                  <td data-rot="Turnos aqui">{turnos || '—'}</td>
                  <td data-rot="Alunos daqui">{alunos.filter((a) => a.vanId === v.id).length}</td>
                  <td data-rot="Situação"><span className={`tag ${s === 'credenciada' ? 'tag-verde' : s === 'pendente' ? 'tag-laranja' : 'tag-vermelho'}`}>{s}</span></td>
                  <td className="td-acoes" style={{ textAlign: 'right' }}>
                    {s !== 'credenciada' && <button className="btn btn-escuro btn-sm" onClick={() => void credenciar(v.id, escola.id, 'credenciada')}>Credenciar</button>}
                    {s === 'credenciada' && <button className="btn btn-claro btn-sm" onClick={() => void credenciar(v.id, escola.id, 'suspensa')}>Suspender</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!vans.length && <Vazio ic="van">Nenhuma van atende esta escola</Vazio>}
      </div>
      <p className="muted small" style={{ marginTop: 12 }}>Só vans credenciadas aparecem na busca dos pais para esta escola e na portaria.</p>
    </section>
  );
}

// ---------------- alunos ----------------

function AlunosEscola({ escola, turno, alunos, vans, viagens, presencas }: { escola: TEscola; turno: Turno; alunos: Aluno[]; vans: Van[]; viagens: Viagem[]; presencas: Presenca[] }) {
  const pres = new Map(presencas.map((p) => [p.alunoId, p]));
  const status = (a: Aluno) => {
    const ida = viagens.find((v) => v.tipo === 'ida' && idxAluno(v, a.id) >= 0);
    const volta = viagens.find((v) => v.tipo === 'volta' && idxAluno(v, a.id) >= 0);
    const pv = volta?.paradas[idxAluno(volta, a.id)];
    if (pv) {
      const saiu = volta!.paradas.some((s) => s.tipo === 'escola' && s.escolaId === escola.id && s.status === 'feito');
      if (pv.status === 'feito') return <span className="tag tag-verde"><I n="casa" />Em casa {hora(pv.hora)}</span>;
      if (saiu) return <span className="tag"><I n="van" />Saiu com o tio</span>;
    }
    const pi = ida?.paradas[idxAluno(ida, a.id)];
    if (pi) {
      if (pi.recebidoEscolaEm) return <span className="tag tag-verde"><I n="check" />Na escola {hora(pi.recebidoEscolaEm)}</span>;
      const deixou = ida!.paradas.find((s) => s.tipo === 'escola' && s.escolaId === escola.id && s.status === 'feito');
      if (pi.status === 'feito' && deixou && !escola.confirmaEntrada) return <span className="tag tag-verde"><I n="check" />Entregue pelo tio {hora(deixou.hora)}</span>;
      if (pi.status === 'feito') return <span className="tag"><I n="van" />{deixou ? 'Chegou, falta confirmar' : 'A caminho'}</span>;
      if (pi.status === 'ausente') return <span className="tag tag-vermelho">{pi.avisou ? 'Fora da ida' : 'Não embarcou'}</span>;
      return <span className="tag tag-amarelo">Aguardando a van</span>;
    }
    return <span className="tag tag-cinza">Van não saiu</span>;
  };
  return (
    <section className="card">
      <p className="muted small" style={{ marginBottom: 10 }}>Turno da {NOME_TURNO[turno].toLowerCase()} · {alunos.length} aluno(s) usam van</p>
      <div className="tabela-wrap">
        <table className="tabela">
          <thead><tr><th>Aluno</th><th>Van</th><th>Combinado de hoje</th><th>Agora</th></tr></thead>
          <tbody>{alunos.map((a) => {
            const pl = nomePlano(planoDe(pres.get(a.id)));
            return (
              <tr key={a.id}>
                <td><div className="aluno-cel"><Avatar aluno={a} tam={34} /><div><strong>{a.nome}</strong><span className="muted small">{a.serie}</span></div></div></td>
                <td data-rot="Van">{vans.find((v) => v.id === a.vanId)?.nome}</td>
                <td data-rot="Combinado de hoje">{pl.nome}<br /><span className="muted small">{pl.desc}</span></td>
                <td className="td-largo" data-rot="Agora">{status(a)}</td>
              </tr>
            );
          })}</tbody>
        </table>
        {!alunos.length && <Vazio ic="alunos">Nenhum aluno de van neste turno</Vazio>}
      </div>
    </section>
  );
}

function Ocorrencias({ alunos }: { alunos: Map<string, Aluno> }) {
  const ev = useLiveQuery(() => db.pontos.filter((e) => tipoEvento(e.tipo)?.grupo === 'ocorrencia').toArray()) ?? [];
  const daqui = ev.filter((e) => alunos.has(e.alunoId));
  return (
    <section className="card">
      <p className="muted small" style={{ marginBottom: 10 }}>Registradas pelos motoristas. Os pais já foram avisados de cada uma.</p>
      <Feed ev={daqui} limite={50} alunos={alunos} />
    </section>
  );
}
