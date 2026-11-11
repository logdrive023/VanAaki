import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/db';
import type { Aluno, EventoPontos } from '../db/types';
import { filtrarPeriodo, missoesDe, nivelDe, selosDe, tipoEvento, xpDe, type Periodo } from '../lib/gamificacao';
import { dataCurta, haQuanto, hoje } from '../lib/util';
import { Avatar, Vazio } from './ui';

export function usePontosVan(vanId?: string) {
  return useLiveQuery(() => (vanId ? db.pontos.where('vanId').equals(vanId).toArray() : []), [vanId]) ?? [];
}
export function usePontosAluno(alunoId?: string) {
  return useLiveQuery(() => (alunoId ? db.pontos.where('alunoId').equals(alunoId).toArray() : []), [alunoId]) ?? [];
}

export interface LinhaRanking { aluno: Aluno; pontos: number; pos: number }
export function calcularRanking(alunos: Aluno[], ev: EventoPontos[], periodo: Periodo): LinhaRanking[] {
  const f = filtrarPeriodo(ev, periodo);
  const soma = new Map<string, number>();
  for (const e of f) soma.set(e.alunoId, (soma.get(e.alunoId) ?? 0) + e.pontos);
  return alunos.filter((a) => a.ativo).map((a) => ({ aluno: a, pontos: soma.get(a.id) ?? 0, pos: 0 }))
    .sort((a, b) => b.pontos - a.pontos || a.aluno.apelido.localeCompare(b.aluno.apelido))
    .map((l, i) => ({ ...l, pos: i + 1 }));
}

export function SeletorPeriodo({ valor, onChange }: { valor: Periodo; onChange: (p: Periodo) => void }) {
  return (
    <div className="abas">
      {(['semana', 'mes', 'geral'] as Periodo[]).map((p) => (
        <a key={p} className={valor === p ? 'ativo' : ''} onClick={() => onChange(p)} style={{ cursor: 'pointer' }}>{p === 'semana' ? 'Semana' : p === 'mes' ? 'Mês' : 'Geral'}</a>
      ))}
    </div>
  );
}

/** Ranking da van — mostra só APELIDOS (privacidade das outras famílias). */
export function Ranking({ alunos, ev, eu, nomesReais = false }: { alunos: Aluno[]; ev: EventoPontos[]; eu?: string; nomesReais?: boolean }) {
  const [periodo, setPeriodo] = useState<Periodo>('semana');
  const r = calcularRanking(alunos, ev, periodo);
  const top = r.slice(0, 3);
  const nome = (a: Aluno) => (nomesReais ? a.nome : a.apelido);
  return (
    <div className="pilha">
      <div className="entre"><strong>🏆 Ranking da van</strong><SeletorPeriodo valor={periodo} onChange={setPeriodo} /></div>
      {top.length === 3 && (
        <div className="podio">
          {[top[1], top[0], top[2]].map((l) => (
            <div key={l.aluno.id} className={`p${l.pos}`}>
              <div style={{ fontSize: 22 }}>{l.pos === 1 ? '👑' : l.pos === 2 ? '🥈' : '🥉'}</div>
              <Avatar nome={nome(l.aluno)} cor={l.aluno.cor} />
              <div className="small" style={{ fontWeight: 900 }}>{nome(l.aluno)}{l.aluno.id === eu ? ' (você)' : ''}</div>
              <div className="deg">{l.pontos} ⭐</div>
            </div>
          ))}
        </div>
      )}
      <div>
        {r.map((l) => (
          <div key={l.aluno.id} className={`rank-item ${l.aluno.id === eu ? 'eu' : ''}`}>
            <span className="pos">{l.pos}º</span>
            <Avatar nome={nome(l.aluno)} cor={l.aluno.cor} tam={36} />
            <strong>{nome(l.aluno)}{l.aluno.id === eu ? ' · você' : ''}</strong>
            <span className="pontos-pill" style={{ fontSize: 13 }}>{l.pontos} ⭐</span>
          </div>
        ))}
      </div>
      {!nomesReais && <small className="muted">🔒 O ranking usa apelidos: ninguém vê o nome completo nem o endereço dos colegas.</small>}
    </div>
  );
}

export function NivelCard({ ev, saldo, sequencia }: { ev: EventoPontos[]; saldo: number; sequencia: number }) {
  const xp = xpDe(ev);
  const n = nivelDe(xp);
  return (
    <div className="nivel-card">
      <div className="entre">
        <div>
          <small>Seu nível</small>
          <div style={{ fontSize: 22, fontWeight: 900 }}>{n.atual.icone} {n.atual.nome}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <small>Saldo</small>
          <div style={{ fontSize: 22, fontWeight: 900 }}>{saldo} ⭐</div>
        </div>
      </div>
      <div className="barra-xp"><i style={{ width: `${n.pct}%` }} /></div>
      <div className="entre" style={{ marginTop: 6 }}>
        <small>{xp} XP{n.prox ? ` · faltam ${n.falta} para ${n.prox.icone} ${n.prox.nome}` : ' · nível máximo!'}</small>
        {sequencia > 0 && <small>🔥 {sequencia} dia{sequencia > 1 ? 's' : ''} seguido{sequencia > 1 ? 's' : ''}</small>}
      </div>
    </div>
  );
}

export function Selos({ ev }: { ev: EventoPontos[] }) {
  return (
    <div className="selos" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
      {selosDe(ev).map((s) => (
        <div key={s.id} className={`selo ${s.ok ? 'ok' : 'off'}`} title={s.desc}>
          <span>{s.icone}</span>{s.nome}<small>{s.ok ? 'Conquistado!' : s.progresso}</small>
        </div>
      ))}
    </div>
  );
}

export function Missoes({ ev }: { ev: EventoPontos[] }) {
  return (
    <div>
      {missoesDe(ev).map((m) => {
        const ok = m.atual >= m.meta;
        return (
          <div key={m.id} className={`missao ${ok ? 'feita' : ''}`}>
            <div className="ic">{ok ? '✅' : m.icone}</div>
            <div>
              <strong style={{ fontSize: 14 }}>{m.nome}</strong>
              <div className="prog"><i style={{ width: `${Math.min(100, (m.atual / m.meta) * 100)}%` }} /></div>
            </div>
            <span className={`tag ${ok ? 'tag-verde' : 'tag-amarelo'}`}>{Math.min(m.atual, m.meta)}/{m.meta} · +{m.premio}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Histórico de pontos (elogios, ocorrências, automáticos). */
export function Feed({ ev, limite = 15, alunos }: { ev: EventoPontos[]; limite?: number; alunos?: Map<string, Aluno> }) {
  const l = [...ev].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).slice(0, limite);
  if (!l.length) return <Vazio ic="⭐">Ainda sem pontos</Vazio>;
  return (
    <div>
      {l.map((e) => {
        const t = tipoEvento(e.tipo);
        const a = alunos?.get(e.alunoId);
        return (
          <div key={e.id} className={`feed-item ${e.pontos < 0 ? 'neg' : ''}`}>
            <div className="ic">{t?.icone ?? '⭐'}</div>
            <div>
              <strong style={{ fontSize: 14 }}>{a ? `${a.nome.split(' ')[0]} · ` : ''}{e.descricao}</strong>
              <div className="small muted">{e.observacao ? `"${e.observacao}" · ` : ''}{e.data === hoje() ? haQuanto(e.criadoEm) : dataCurta(e.data)}{e.autor === 'motorista' ? ' · pelo tio' : ''}</div>
            </div>
            <strong className={e.pontos < 0 ? 'vermelho' : 'verde'}>{e.pontos > 0 ? '+' : ''}{e.pontos}</strong>
          </div>
        );
      })}
    </div>
  );
}
