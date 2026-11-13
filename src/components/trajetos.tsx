import { useEffect, useState } from 'react';
import { api } from '../api/cliente';
import type { LatLng, Turno } from '../db/types';
import { NOME_TURNO } from '../lib/turnos';
import { I } from './Icone';
import Mapa3D, { type Marcador } from './Mapa3D';

/** PL 1240/2026 — tipos do histórico de trajetos (iguais aos do servidor). */
export interface PontoTrajeto { lat: number; lng: number; em: string }
export interface ResumoViagem {
  id: string; data: string; turno: Turno; tipo: 'ida' | 'volta'; status: string; iniciadaEm: string; concluidaEm?: string;
  escolas: string[]; alunos: number; ausentes: number; pontos: number; km: number; origem: 'gps' | 'simulacao'; primeiraEm?: string; ultimaEm?: string;
}
export interface AcessoFiscal { token: string; nome: string; criadoEm: string; expiraEm: string; revogadoEm?: string; ultimoAcessoEm?: string; acessos: number }

const hhmm = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');
export const dataBr = (d: string) => d.split('-').reverse().slice(0, 2).join('/');
const diaSemana = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
export const duracao = (a?: string, b?: string) => {
  if (!a || !b) return '—';
  const m = Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`;
};

/** Lista de trajetos (mais recentes primeiro). */
export function HistoricoLista({ lista, sel, onSel, limite = 60 }: { lista: ResumoViagem[]; sel?: string; onSel: (id: string) => void; limite?: number }) {
  if (!lista.length) return <div className="vazio"><span className="ic"><I n="historico" /></span>Nenhum trajeto registrado ainda. Eles aparecem aqui assim que a primeira rota terminar.</div>;
  return (
    <div className="historico-lista">
      {lista.slice(0, limite).map((v) => (
        <button key={v.id} type="button" className={`viagem-linha ${sel === v.id ? 'ativa' : ''}`} onClick={() => onSel(v.id)}>
          <span className="quando"><strong>{dataBr(v.data)} · {diaSemana(v.data)}</strong><small>{hhmm(v.primeiraEm ?? v.iniciadaEm)}–{hhmm(v.ultimaEm ?? v.concluidaEm)}</small></span>
          <span className="oque">
            <strong><I n={v.turno} tam={15} />{v.tipo === 'ida' ? 'Ida' : 'Volta'} · {NOME_TURNO[v.turno]}{v.status === 'em_andamento' && <span className="tag tag-verde ao-vivo"><span className="ponto" />agora</span>}{v.status === 'encerrada' && <span className="tag">encerrada antes</span>}</strong>
            <small>{v.escolas.join(' · ') || '—'}</small>
          </span>
          <span className="num">{v.km.toFixed(1)} km · {v.alunos} aluno{v.alunos === 1 ? '' : 's'}<br />{v.pontos} pontos{v.origem === 'simulacao' ? ' · simulação' : ''}</span>
        </button>
      ))}
    </div>
  );
}

/** Busca as posições de uma viagem (rota do motorista ou do link público). */
export function useTrajeto(caminho: string | null, publico = false) {
  const [pts, setPts] = useState<PontoTrajeto[] | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    if (!caminho) { setPts(null); return; }
    let vivo = true;
    setPts(null); setErro('');
    api<PontoTrajeto[]>(caminho, { semToken: publico }).then((l) => { if (vivo) setPts(l); }).catch((e) => { if (vivo) setErro((e as Error).message); });
    return () => { vivo = false; };
  }, [caminho, publico]);
  return { pts, erro };
}

/** Mapa com o trajeto registrado: linha contínua, início e fim. */
export function MapaTrajeto({ v, pts, altura = 380 }: { v?: ResumoViagem; pts: PontoTrajeto[] | null; altura?: number | string }) {
  if (!pts) return <div className="mapa3d" style={{ height: altura, display: 'grid', placeItems: 'center' }}><div className="giro" /></div>;
  const linha: LatLng[] = pts.map((p) => ({ lat: p.lat, lng: p.lng }));
  const mk: Marcador[] = linha.length ? [
    { id: 'ini', pos: linha[0], tipo: 'inicio', rotulo: `Início ${hhmm(pts[0].em)}` },
    { id: 'fim', pos: linha[linha.length - 1], tipo: 'fim', rotulo: `Fim ${hhmm(pts[pts.length - 1].em)}` },
  ] : [];
  return (
    <div className="pilha" style={{ gap: 10 }}>
      <Mapa3D altura={altura} marcadores={mk} linhas={[{ id: 't', pts: linha, tipo: 'rota' }]} enquadrar={linha} chave={v?.id ?? String(linha.length)} />
      {v && (
        <div className="linha small muted">
          <span className="tag"><I n="calendario" />{dataBr(v.data)}</span>
          <span className="tag"><I n="relogio" />{hhmm(pts[0]?.em)}–{hhmm(pts[pts.length - 1]?.em)} · {duracao(pts[0]?.em, pts[pts.length - 1]?.em)}</span>
          <span className="tag"><I n="rota" />{v.km.toFixed(1)} km</span>
          <span className="tag"><I n="pin" />{pts.length} posições</span>
          <span className="tag"><I n="alunos" />{v.alunos} {v.tipo === 'ida' ? 'embarcados' : 'entregues'}{v.ausentes ? ` · ${v.ausentes} ausente(s)` : ''}</span>
        </div>
      )}
    </div>
  );
}
