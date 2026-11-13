import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Check } from 'lucide-react';
import Mapa3D, { type Marcador } from '../components/Mapa3D';
import { db } from '../db/db';
import { useEu } from '../api/sync';
import type { Aluno, Escola, Viagem } from '../db/types';
import { visaoFamilia, type VisaoFamilia } from '../lib/privacidade';
import { NOME_TURNO, planoDe, type Plano } from '../lib/turnos';
import { hoje, hora, horaMais, primeiroNome } from '../lib/util';
import { idxAluno, idxEscola } from '../services/viagem';
import type { NomeIcone } from '../components/Icone';

/** Filho escolhido (a família pode ter mais de um). Só vale um dos filhos da conta. */
export function useAlunoPerfil(): [string, (id: string) => void] {
  const eu = useEu();
  const ler = () => { try { return localStorage.getItem('vanaaki-aluno') ?? ''; } catch { return ''; } };
  const [id, setId] = useState(ler);
  const meus = eu?.alunoIds ?? [];
  const atual = meus.includes(id) ? id : meus[0] ?? '';
  return [atual, (n: string) => { try { localStorage.setItem('vanaaki-aluno', n); } catch { /* sem storage */ } setId(n); }];
}

/** Dados de UMA família — nunca carrega posição/nome de outros alunos para a tela. */
export function useFamilia(alunoId: string) {
  const aluno = useLiveQuery(() => db.alunos.get(alunoId), [alunoId]);
  const van = useLiveQuery(() => (aluno ? db.vans.get(aluno.vanId) : undefined), [aluno?.vanId]);
  const escola = useLiveQuery(() => (aluno ? db.escolas.get(aluno.escolaId) : undefined), [aluno?.escolaId]);
  const viagem = useLiveQuery(async () => {
    if (!aluno) return undefined;
    const l = await db.viagens.where('data').equals(hoje()).filter((v) => v.vanId === aluno.vanId && v.status !== 'cancelada' && idxAluno(v, alunoId) >= 0).toArray();
    return l.find((v) => v.status === 'em_andamento') ?? l.sort((a, b) => b.iniciadaEm.localeCompare(a.iniciadaEm))[0];
  }, [aluno?.vanId, alunoId]);
  const presenca = useLiveQuery(() => db.presencas.get(`${alunoId}|${hoje()}`), [alunoId]);
  const eu = useEu();
  const irmaos = useLiveQuery(() => db.alunos.filter((a) => a.completo).toArray()) ?? [];
  const visao = aluno ? visaoFamilia(viagem, aluno, escola) : undefined;
  return { aluno, van, escola, viagem, presenca, plano: planoDe(presenca), visao, perfis: irmaos.filter((a) => eu?.alunoIds.includes(a.id)), carregando: aluno === undefined };
}

export function SeletorAluno({ id, onChange, perfis }: { id: string; onChange: (id: string) => void; perfis: Aluno[] }) {
  if (perfis.length < 2) return <strong className="nome-perfil">{perfis[0]?.nome}</strong>;
  return (
    <select className="seletor-perfil" value={id} onChange={(e) => onChange(e.target.value)} title="Trocar de filho">
      {perfis.map((a) => <option key={a.id} value={a.id}>{a.nome} · {NOME_TURNO[a.turno]}</option>)}
    </select>
  );
}

const paradas = (n: number) => `${n} parada${n > 1 ? 's' : ''}`;
/** 'Falta 1 parada' / 'Faltam 3 paradas' */
const faltam = (n: number, minuscula = false) => { const t = `${n > 1 ? 'Faltam' : 'Falta'} ${paradas(n)}`; return minuscula ? t[0].toLowerCase() + t.slice(1) : t; };

/**
 * Texto do status, igual para pais e aluno (respeitando a privacidade).
 * A previsão vem do MOVIMENTO REAL da van (velocidade medida pelo GPS hoje), e o texto começa pela
 * hora de chegada: é o que a família quer saber ("chega por volta de 07:09").
 * `chegada` = hora prevista para o próximo acontecimento desta família (para o número grande do cartão).
 */
export function textoStatus(v: VisaoFamilia, a: Aluno, viagem: Viagem | undefined, escola: string, plano: Plano, jeitoAluno = false): { ic: NomeIcone; titulo: string; sub: string; chegada?: string; rotuloChegada?: string } {
  const n = jeitoAluno ? 'você' : primeiroNome(a.nome);
  const N = jeitoAluno ? 'Você' : primeiroNome(a.nome);
  const as = horaMais(v.eta ?? 0);
  const real = (viagem?.velKmh ?? 0) > 0 ? ' · pelo trânsito de agora' : '';
  switch (v.fase) {
    case 'sem_viagem':
      if (plano === 'so_volta') return { ic: 'escola', titulo: jeitoAluno ? 'Hoje seus pais te levam' : `Hoje você leva ${n}`, sub: 'O tio traz na volta. Avisamos quando ele sair da escola.' };
      if (plano === 'so_ida') return { ic: 'van', titulo: 'Hoje só a ida de van', sub: jeitoAluno ? 'Seus pais te buscam na escola.' : `Você busca ${n} na escola.` };
      if (plano === 'nao_vai') return { ic: 'casa', titulo: jeitoAluno ? 'Hoje você não vai de van' : `${N} não vai de van hoje`, sub: 'O tio já sabe e a rota foi ajustada.' };
      return { ic: 'van', titulo: 'A van ainda não saiu', sub: `Turno da ${NOME_TURNO[a.turno].toLowerCase()} · você recebe um aviso quando o tio sair.` };
    case 'nao_vai': return { ic: 'casa', titulo: viagem?.tipo === 'volta' ? (jeitoAluno ? 'Hoje seus pais te buscam' : `Você busca ${n} hoje`) : (jeitoAluno ? 'Hoje seus pais te levam' : `Você leva ${n} hoje`), sub: 'Combinado com o tio: a rota já foi ajustada.' };
    case 'ausente': return { ic: 'alerta', titulo: 'O tio passou e não encontrou', sub: `Às ${hora(v.horaFase)}` };
    case 'aguardando': return viagem?.tipo === 'volta'
      ? { ic: 'van', titulo: jeitoAluno ? 'Você está na van, indo para casa' : `${N} está na van, indo para casa`, sub: `${v.paradasAntes ? `${faltam(v.paradasAntes)} antes${real}` : `Você é o próximo${real}`}`, chegada: as, rotuloChegada: jeitoAluno ? 'você chega em casa' : 'chega em casa' }
      : { ic: 'escudo', titulo: 'O tio está buscando outros alunos', sub: `${v.paradasAntes ? `${faltam(v.paradasAntes)} antes ${jeitoAluno ? 'de você' : 'da sua casa'}` : 'Você é o próximo'}${real}`, chegada: as, rotuloChegada: jeitoAluno ? 'a van chega para você' : 'a van chega na sua casa' };
    case 'proximo': return { ic: 'sino', titulo: jeitoAluno ? 'Você é o próximo!' : `${N} é o próximo!`, sub: `A van chega ${viagem?.tipo === 'volta' ? 'na sua casa' : 'no portão'} em ~${v.eta} min${real}`, chegada: as, rotuloChegada: viagem?.tipo === 'volta' ? 'chega em casa' : 'chega no portão' };
    case 'na_porta': return viagem?.tipo === 'volta'
      ? { ic: 'pin', titulo: 'A van chegou na sua casa!', sub: 'Hora de descer' }
      : { ic: 'pin', titulo: 'O tio chegou no portão!', sub: 'Pode embarcar' };
    case 'a_bordo': return { ic: 'van', titulo: jeitoAluno ? 'Você está a bordo' : `${N} está a bordo`, sub: `${jeitoAluno ? 'Vamos chegar' : 'Chega'} em ${escola} por volta de ${as} · ${faltam(v.paradasAntes, true)}${real}`, chegada: as, rotuloChegada: jeitoAluno ? 'vamos chegar na escola' : 'chega na escola' };
    case 'a_bordo_final': return { ic: 'escola', titulo: jeitoAluno ? `Indo para ${escola}` : `${N} está indo para ${escola}`, sub: `Chega em ~${v.eta} min${real}`, chegada: as, rotuloChegada: jeitoAluno ? 'vamos chegar na escola' : 'chega na escola' };
    case 'chegou_escola': return { ic: 'escola', titulo: jeitoAluno ? `Você chegou em ${escola}` : `${N} chegou em ${escola}`, sub: `Às ${hora(v.horaFase)}` };
    case 'volta_outra_escola': return { ic: 'escudo', titulo: 'O tio está buscando em outra escola', sub: `Depois vem para ${escola} · ${faltam(v.paradasAntes, true)}${real}`, chegada: as, rotuloChegada: `o tio chega em ${escola}` };
    case 'volta_indo_escola': return { ic: 'escola', titulo: `O tio está indo para ${escola}`, sub: `Chega em ~${v.eta} min para buscar ${n}${real}`, chegada: as, rotuloChegada: `o tio chega na escola` };
    case 'volta_na_escola': return { ic: 'pin', titulo: `O tio chegou em ${escola}`, sub: jeitoAluno ? 'Pode ir para a van' : `${N} já pode embarcar` };
    case 'entregue': return { ic: 'casa', titulo: jeitoAluno ? 'Você chegou em casa' : `${N} chegou em casa`, sub: `Às ${hora(v.horaFase)}` };
  }
}

/** Mapa da família: só a van, a casa (ou a escola do filho) e o trecho permitido. */
export function MapaFamilia({ v, aluno, escola, viagem, altura = 320 }: { v: VisaoFamilia; aluno: Aluno; escola?: Escola; viagem: Viagem; altura?: number | string }) {
  const mk: Marcador[] = [
    v.alvoTipo === 'escola' && escola
      ? { id: 'escola', pos: escola.local, tipo: 'escola', rotulo: escola.nome }
      : { id: 'casa', pos: aluno.local, tipo: 'casa', rotulo: 'Sua casa' },
    { id: 'van', pos: viagem.pos, tipo: 'van' },
  ];
  return <Mapa3D altura={altura} marcadores={mk} linhas={[{ id: 'r', pts: v.caminho, tipo: 'rota' }]} seguir={viagem.pos} />;
}

/** Linha do tempo só do próprio aluno (estilo rastreio de encomenda). */
export function LinhaTempo({ viagem, aluno, escola, v }: { viagem?: Viagem; aluno: Aluno; escola?: Escola; v: VisaoFamilia }) {
  if (!viagem) return null;
  const p = viagem.paradas[idxAluno(viagem, aluno.id)];
  const ps = viagem.paradas[idxEscola(viagem, aluno.escolaId)];
  const nomeEsc = escola?.nome ?? 'escola';
  const naEscola = ps?.status === 'feito';
  const passos = viagem.tipo === 'ida' ? [
    { ok: true, t: `Van saiu (${NOME_TURNO[viagem.turno].toLowerCase()})`, h: hora(viagem.iniciadaEm) },
    { ok: viagem.avisados.includes(aluno.id), agora: v.fase === 'aguardando', t: 'É o próximo a ser buscado', h: '' },
    { ok: p?.status === 'feito', agora: v.fase === 'proximo' || v.fase === 'na_porta', t: p?.status === 'ausente' ? 'Não embarcou' : 'Embarcou', h: p?.hora ? hora(p.hora) : '' },
    { ok: naEscola && p?.status === 'feito', agora: v.fase === 'a_bordo' || v.fase === 'a_bordo_final', t: escola?.confirmaEntrada ? `Chegou em ${nomeEsc}` : `Entregue em ${nomeEsc} pelo tio`, h: naEscola ? hora(ps.hora) : '' },
    ...(escola?.confirmaEntrada ? [{ ok: !!p?.recebidoEscolaEm, t: 'Entrada confirmada pela escola', h: p?.recebidoEscolaEm ? hora(p.recebidoEscolaEm) : '' }] : []),
  ] : [
    { ok: true, t: `Tio saiu para buscar (${NOME_TURNO[viagem.turno].toLowerCase()})`, h: hora(viagem.iniciadaEm) },
    { ok: naEscola || v.fase === 'volta_na_escola', agora: v.fase === 'volta_outra_escola' || v.fase === 'volta_indo_escola', t: `Tio chegou em ${nomeEsc}`, h: '' },
    { ok: naEscola, agora: v.fase === 'volta_na_escola', t: 'Saiu da escola com o tio', h: naEscola ? hora(ps.hora) : '' },
    { ok: viagem.avisados.includes(aluno.id), agora: v.fase === 'aguardando', t: 'É o próximo a ser entregue', h: '' },
    { ok: p?.status === 'feito', agora: v.fase === 'proximo' || v.fase === 'na_porta', t: 'Chegou em casa', h: p?.hora ? hora(p.hora) : '' },
  ];
  return (
    <ul className="linha-tempo">
      {passos.map((s, i) => (
        <li key={i} className={s.ok ? 'ok' : s.agora ? 'agora' : ''}>
          <span className="b">{s.ok ? <Check size={13} strokeWidth={2.6} /> : ''}</span>
          <div><strong style={{ color: s.ok || s.agora ? undefined : 'var(--texto-2)' }}>{s.t}</strong></div>
          <small>{s.h}</small>
        </li>
      ))}
    </ul>
  );
}
