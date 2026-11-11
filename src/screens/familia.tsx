import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import Mapa3D, { type Marcador } from '../components/Mapa3D';
import { db } from '../db/db';
import { ALUNO_PADRAO } from '../db/seed';
import type { Aluno, Viagem } from '../db/types';
import { visaoFamilia, type VisaoFamilia } from '../lib/privacidade';
import { hoje, hora, horaMais, primeiroNome } from '../lib/util';

/** Perfil escolhido nesta aba (pais/aluno). Fica salvo no navegador para o teste. */
export function useAlunoPerfil(): [string, (id: string) => void] {
  const ler = () => { try { return localStorage.getItem('vanaaki-aluno') ?? ALUNO_PADRAO; } catch { return ALUNO_PADRAO; } };
  const [id, setId] = useState(ler);
  return [id, (n: string) => { try { localStorage.setItem('vanaaki-aluno', n); } catch { /* sem storage */ } setId(n); }];
}

/** Dados de UMA família — nunca carrega posição/nome de outros alunos para a tela. */
export function useFamilia(alunoId: string) {
  const aluno = useLiveQuery(() => db.alunos.get(alunoId), [alunoId]);
  const van = useLiveQuery(() => (aluno ? db.vans.get(aluno.vanId) : undefined), [aluno?.vanId]);
  const escola = useLiveQuery(() => (aluno ? db.escolas.get(aluno.escolaId) : undefined), [aluno?.escolaId]);
  const viagem = useLiveQuery(async () => {
    if (!aluno) return undefined;
    const l = await db.viagens.where('data').equals(hoje()).filter((v) => v.vanId === aluno.vanId && v.status !== 'cancelada' && v.paradas.some((p) => p.alunoId === alunoId)).toArray();
    return l.find((v) => v.status === 'em_andamento') ?? l.sort((a, b) => b.iniciadaEm.localeCompare(a.iniciadaEm))[0];
  }, [aluno?.vanId, alunoId]);
  const presenca = useLiveQuery(() => db.presencas.get(`${alunoId}|${hoje()}`), [alunoId]);
  const irmaos = useLiveQuery(() => db.alunos.filter((a) => a.ativo).toArray()) ?? [];
  const visao = aluno ? visaoFamilia(viagem, alunoId, aluno.local) : undefined;
  return { aluno, van, escola, viagem, presenca, visao, perfis: irmaos, carregando: aluno === undefined };
}

export function SeletorAluno({ id, onChange, perfis }: { id: string; onChange: (id: string) => void; perfis: Aluno[] }) {
  return (
    <select className="seletor-perfil" value={id} onChange={(e) => onChange(e.target.value)} title="Trocar perfil (teste)">
      {perfis.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
    </select>
  );
}

/** Texto do status, igual para pais e aluno (respeitando a privacidade). */
export function textoStatus(v: VisaoFamilia, a: Aluno, viagem: Viagem | undefined, destino: string, jeitoAluno = false) {
  const n = jeitoAluno ? 'você' : primeiroNome(a.nome);
  const ida = viagem?.tipo !== 'volta';
  switch (v.fase) {
    case 'sem_viagem': return { ic: '🅿️', titulo: 'A van ainda não saiu', sub: 'Você recebe um aviso quando o tio iniciar a rota.' };
    case 'nao_vai': return { ic: '🏠', titulo: jeitoAluno ? 'Hoje você não vai de van' : `${n} não vai hoje`, sub: 'A rota do tio já foi ajustada.' };
    case 'ausente': return { ic: '🚫', titulo: 'O tio passou e não encontrou', sub: `Às ${hora(viagem?.paradas.find((p) => p.alunoId === a.id)?.hora)}` };
    case 'aguardando': return {
      ic: '🔒', titulo: ida ? 'O tio está buscando outros alunos' : (jeitoAluno ? 'Você está na van' : `${n} está na van`),
      sub: `${v.paradasAntes === 0 ? 'Você é o próximo' : `Faltam ${v.paradasAntes} parada${v.paradasAntes > 1 ? 's' : ''} antes ${jeitoAluno ? 'de você' : 'da sua casa'}`} · previsão ~${horaMais(v.eta ?? 0)}`,
    };
    case 'proximo': return { ic: '🔔', titulo: jeitoAluno ? 'Você é o próximo!' : `${n} é o próximo!`, sub: `A van chega em ~${v.eta} min` };
    case 'na_porta': return { ic: '📍', titulo: ida ? 'O tio chegou no portão!' : 'A van chegou na sua casa!', sub: ida ? 'Pode embarcar 🚐' : 'Hora de descer' };
    case 'a_bordo': return { ic: '🚐', titulo: jeitoAluno ? 'Você está a bordo' : `${n} está a bordo`, sub: `Buscando mais ${v.paradasAntes} colega${v.paradasAntes > 1 ? 's' : ''} · chega em ${destino} ~${horaMais(v.eta ?? 0)}` };
    case 'a_bordo_final': return { ic: '🏫', titulo: `A caminho de ${destino}`, sub: `Chega em ~${v.eta} min` };
    case 'chegou_destino': return { ic: '🏫', titulo: jeitoAluno ? `Você chegou em ${destino}` : `${n} chegou em ${destino}`, sub: `Às ${hora(viagem?.concluidaEm)}` };
    case 'entregue': return { ic: '🏠', titulo: jeitoAluno ? 'Você chegou em casa' : `${n} chegou em casa`, sub: `Às ${hora(viagem?.paradas.find((p) => p.alunoId === a.id)?.hora)}` };
  }
}

/** Mapa da família: só a van, a casa (ou o destino) e o trecho permitido. */
export function MapaFamilia({ v, aluno, viagem, altura = 320 }: { v: VisaoFamilia; aluno: Aluno; viagem: Viagem; altura?: number | string }) {
  const mk: Marcador[] = [
    v.fase === 'a_bordo_final'
      ? { id: 'destino', pos: viagem.destino, tipo: viagem.tipo === 'ida' ? 'escola' : 'garagem', rotulo: viagem.destinoNome }
      : { id: 'casa', pos: aluno.local, tipo: 'casa', rotulo: 'Sua casa' },
    { id: 'van', pos: viagem.pos, tipo: 'van' },
  ];
  return <Mapa3D altura={altura} marcadores={mk} linhas={[{ id: 'r', pts: v.caminho, tipo: 'rota' }]} seguir={viagem.pos} />;
}

/** Linha do tempo só do próprio aluno (estilo rastreio de encomenda). */
export function LinhaTempo({ viagem, alunoId, v }: { viagem?: Viagem; alunoId: string; v: VisaoFamilia }) {
  if (!viagem) return null;
  const p = viagem.paradas.find((x) => x.alunoId === alunoId);
  const ida = viagem.tipo === 'ida';
  const passos = ida ? [
    { ok: true, t: 'Van saiu para a rota', h: hora(viagem.iniciadaEm) },
    { ok: viagem.avisados.includes(alunoId), agora: v.fase === 'aguardando', t: 'Você é o próximo', h: '' },
    { ok: p?.status === 'feito', agora: v.fase === 'proximo' || v.fase === 'na_porta', t: p?.status === 'ausente' ? 'Não embarcou' : 'Embarcou', h: p?.hora ? hora(p.hora) : '' },
    { ok: viagem.status === 'concluida' && p?.status === 'feito', agora: v.fase === 'a_bordo' || v.fase === 'a_bordo_final', t: `Chegou em ${viagem.destinoNome}`, h: viagem.concluidaEm ? hora(viagem.concluidaEm) : '' },
    { ok: !!p?.recebidoEscolaEm, t: 'Entrada confirmada pela escola', h: p?.recebidoEscolaEm ? hora(p.recebidoEscolaEm) : '' },
  ] : [
    { ok: true, t: 'Saiu da escola', h: hora(viagem.iniciadaEm) },
    { ok: viagem.avisados.includes(alunoId), agora: v.fase === 'aguardando', t: 'Próximo a ser entregue', h: '' },
    { ok: p?.status === 'feito', agora: v.fase === 'proximo' || v.fase === 'na_porta', t: 'Chegou em casa', h: p?.hora ? hora(p.hora) : '' },
  ];
  return (
    <ul className="linha-tempo">
      {passos.map((s, i) => (
        <li key={i} className={s.ok ? 'ok' : s.agora ? 'agora' : ''}>
          <span className="b">{s.ok ? '✓' : ''}</span>
          <div><strong style={{ color: s.ok || s.agora ? undefined : 'var(--texto-2)' }}>{s.t}</strong></div>
          <small>{s.h}</small>
        </li>
      ))}
    </ul>
  );
}
