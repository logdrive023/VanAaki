import { useLiveQuery } from 'dexie-react-hooks';
import { Feed } from '../components/gamificacao';
import Mapa3D from '../components/Mapa3D';
import { ShellPainel, type ItemMenu } from '../components/Shell';
import { Avatar, Vazio } from '../components/ui';
import { db } from '../db/db';
import { ESCOLA_PRINCIPAL } from '../db/seed';
import type { Aluno, Van, Viagem } from '../db/types';
import { tipoEvento } from '../lib/gamificacao';
import { visaoEscola } from '../lib/privacidade';
import { dataLonga, hoje, hora, horaMais } from '../lib/util';
import { credenciar } from '../services/acoes';
import { confirmarEntradaEscola } from '../services/viagem';

export default function Escola({ aba = 'chegadas' }: { aba?: string }) {
  const escola = useLiveQuery(() => db.escolas.get(ESCOLA_PRINCIPAL));
  const vans = useLiveQuery(() => db.vans.filter((v) => v.escolaIds.includes(ESCOLA_PRINCIPAL)).toArray()) ?? [];
  const alunos = useLiveQuery(() => db.alunos.where('escolaId').equals(ESCOLA_PRINCIPAL).filter((a) => a.ativo).toArray()) ?? [];
  const viagens = useLiveQuery(() => db.viagens.where('data').equals(hoje()).filter((v) => v.escolaId === ESCOLA_PRINCIPAL && v.tipo === 'ida' && v.status !== 'cancelada').toArray()) ?? [];
  const presencas = useLiveQuery(() => db.presencas.where('data').equals(hoje()).toArray()) ?? [];
  if (!escola) return <div className="vazio">Carregando…</div>;
  const mapaAlunos = new Map(alunos.map((a) => [a.id, a]));
  const aConfirmar = viagens.filter((v) => v.status === 'concluida').flatMap((v) => v.paradas.filter((p) => p.status === 'feito' && !p.recebidoEscolaEm)).length;
  const pendCred = vans.filter((v) => v.credenciamento[ESCOLA_PRINCIPAL] === 'pendente').length;
  const menu: ItemMenu[] = [
    { id: 'chegadas', ic: '🚦', nome: 'Portaria', badge: aConfirmar },
    { id: 'vans', ic: '🚐', nome: 'Vans', badge: pendCred },
    { id: 'alunos', ic: '🎒', nome: 'Alunos' },
    { id: 'ocorrencias', ic: '📋', nome: 'Ocorrências' },
  ];
  const titulos: Record<string, string> = { chegadas: 'Portaria · chegadas de hoje', vans: 'Vans credenciadas', alunos: 'Alunos que usam van', ocorrencias: 'Ocorrências nas vans' };
  const perfil = <div className="perfil-side"><Avatar nome={escola.nome} cor="#00B894" /><div><strong>{escola.nome}</strong><small>Portaria / coordenação</small></div></div>;
  return (
    <ShellPainel base="escola" menu={menu} atual={aba} perfil={perfil} filtro={{ para: 'escola', escolaId: ESCOLA_PRINCIPAL }} titulo={titulos[aba] ?? ''} sub={dataLonga()}>
      {aba === 'chegadas' && <Chegadas vans={vans} viagens={viagens} alunos={mapaAlunos} destino={escola.local} />}
      {aba === 'vans' && <Vans vans={vans} alunos={alunos} />}
      {aba === 'alunos' && <AlunosEscola alunos={alunos} vans={vans} viagens={viagens} naoVao={new Set(presencas.filter((p) => !p.vai).map((p) => p.alunoId))} />}
      {aba === 'ocorrencias' && <Ocorrencias alunos={mapaAlunos} />}
    </ShellPainel>
  );
}

function Chegadas({ vans, viagens, alunos, destino }: { vans: Van[]; viagens: Viagem[]; alunos: Map<string, Aluno>; destino: { lat: number; lng: number } }) {
  const cred = vans.filter((v) => v.credenciamento[ESCOLA_PRINCIPAL] === 'credenciada');
  return (
    <div className="pilha">
      <div className="privacidade"><span className="ic">🔒</span><span>A escola vê quantos alunos estão a bordo e a previsão de chegada. A posição da van no mapa aparece só no <b>último trecho</b>, quando ela já está vindo direto para cá.</span></div>
      {cred.map((van) => {
        const lista = viagens.filter((v) => v.vanId === van.id).sort((a, b) => b.iniciadaEm.localeCompare(a.iniciadaEm));
        const v = lista.find((x) => x.status === 'em_andamento') ?? lista[0];
        const ve = v ? visaoEscola(v) : undefined;
        return (
          <section key={van.id} className="card">
            <div className="card-topo">
              <div className="aluno-cel"><Avatar nome={van.motorista} cor="#6C5CE7" /><div><strong>{van.nome}</strong><span className="muted small">{van.modelo} · <span className="placa">{van.placa}</span> · {van.telefone}</span></div></div>
              {!v ? <span className="tag tag-cinza">Sem rastreio hoje</span>
                : v.status === 'em_andamento' ? <span className="tag tag-verde ao-vivo"><span className="ponto" /> A caminho · ~{horaMais(ve!.eta)}</span>
                : <span className="tag tag-azul">Chegou às {hora(v.concluidaEm)}</span>}
            </div>
            {!v && <p className="muted">Esta van ainda não iniciou a rota pelo VanAaki hoje.</p>}
            {v && v.status === 'em_andamento' && (
              <>
                <div className="linha" style={{ marginBottom: 10 }}>
                  <span className="tag tag-azul">🚐 {ve!.abordo} a bordo</span>
                  <span className="tag tag-amarelo">{ve!.faltam ? `Buscando mais ${ve!.faltam}` : 'Vindo direto para a escola'}</span>
                  <span className="tag tag-verde">⏱️ chega em ~{ve!.eta} min</span>
                </div>
                {ve!.mostrarMapa && <Mapa3D altura={300} marcadores={[{ id: 'escola', pos: destino, tipo: 'escola', rotulo: 'Escola' }, { id: 'van', pos: v.pos, tipo: 'van' }]} linhas={[{ id: 'r', pts: ve!.caminho, tipo: 'rota' }]} seguir={v.pos} />}
              </>
            )}
            {v && v.status === 'concluida' && (
              <>
                <strong>Confirme a entrada de cada aluno (os pais são avisados na hora)</strong>
                {v.paradas.filter((p) => p.status === 'feito').map((p) => {
                  const a = alunos.get(p.alunoId);
                  if (!a) return null;
                  return (
                    <div key={p.alunoId} className="linha-item">
                      <div className="aluno-cel"><Avatar aluno={a} tam={36} /><div><strong>{a.nome}</strong><span className="muted small">{a.serie} · embarcou {hora(p.hora)}</span></div></div>
                      {p.recebidoEscolaEm ? <span className="tag tag-verde">✓ Entrou {hora(p.recebidoEscolaEm)}</span>
                        : <button className="btn btn-verde btn-sm" onClick={() => void confirmarEntradaEscola(v.id, p.alunoId)}>Confirmar entrada</button>}
                    </div>
                  );
                })}
                {v.paradas.some((p) => p.status === 'feito' && !p.recebidoEscolaEm) && (
                  <button className="btn btn-escuro btn-sm" style={{ marginTop: 10 }} onClick={async () => { for (const p of v.paradas.filter((x) => x.status === 'feito' && !x.recebidoEscolaEm)) await confirmarEntradaEscola(v.id, p.alunoId); }}>✅ Confirmar todos</button>
                )}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Vans({ vans, alunos }: { vans: Van[]; alunos: Aluno[] }) {
  return (
    <section className="card">
      <div className="tabela-wrap">
        <table className="tabela">
          <thead><tr><th>Van</th><th>Motorista</th><th>Alunos daqui</th><th>Avaliação</th><th>Situação</th><th style={{ textAlign: 'right' }}>Ações</th></tr></thead>
          <tbody>
            {vans.map((v) => {
              const s = v.credenciamento[ESCOLA_PRINCIPAL];
              return (
                <tr key={v.id}>
                  <td><strong>{v.nome}</strong><br /><span className="muted small">{v.modelo} · <span className="placa">{v.placa}</span></span></td>
                  <td>{v.motorista}<br /><span className="muted small">{v.telefone}</span></td>
                  <td>{alunos.filter((a) => a.vanId === v.id).length}</td>
                  <td>⭐ {v.avaliacao.toFixed(1)}</td>
                  <td><span className={`tag ${s === 'credenciada' ? 'tag-verde' : s === 'pendente' ? 'tag-laranja' : 'tag-vermelho'}`}>{s}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    {s !== 'credenciada' && <button className="btn btn-verde btn-sm" onClick={() => void credenciar(v.id, ESCOLA_PRINCIPAL, 'credenciada')}>Credenciar</button>}
                    {s === 'credenciada' && <button className="btn btn-claro btn-sm" onClick={() => void credenciar(v.id, ESCOLA_PRINCIPAL, 'suspensa')}>Suspender</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small" style={{ marginTop: 12 }}>Só vans credenciadas aparecem na busca dos pais para esta escola e na portaria.</p>
    </section>
  );
}

function AlunosEscola({ alunos, vans, viagens, naoVao }: { alunos: Aluno[]; vans: Van[]; viagens: Viagem[]; naoVao: Set<string> }) {
  const status = (a: Aluno) => {
    if (naoVao.has(a.id)) return <span className="tag tag-cinza">Não vem de van hoje</span>;
    for (const v of viagens) {
      const p = v.paradas.find((x) => x.alunoId === a.id);
      if (!p) continue;
      if (p.recebidoEscolaEm) return <span className="tag tag-verde">✓ Na escola {hora(p.recebidoEscolaEm)}</span>;
      if (p.status === 'feito') return <span className="tag tag-azul">🚐 {v.status === 'concluida' ? 'Chegou, falta confirmar' : 'A caminho'}</span>;
      if (p.status === 'ausente') return <span className="tag tag-vermelho">Não embarcou</span>;
      return <span className="tag tag-amarelo">Aguardando a van</span>;
    }
    return <span className="tag tag-cinza">Van não saiu</span>;
  };
  return (
    <section className="card">
      <div className="tabela-wrap">
        <table className="tabela">
          <thead><tr><th>Aluno</th><th>Série</th><th>Van</th><th>Hoje</th></tr></thead>
          <tbody>{alunos.map((a) => <tr key={a.id}><td><div className="aluno-cel"><Avatar aluno={a} tam={34} /><strong>{a.nome}</strong></div></td><td>{a.serie}</td><td>{vans.find((v) => v.id === a.vanId)?.nome}</td><td>{status(a)}</td></tr>)}</tbody>
        </table>
        {!alunos.length && <Vazio ic="🎒">Nenhum aluno</Vazio>}
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
