import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { db } from '../db/db';
import { hora } from '../lib/util';
import { enviarRecado, lerRecados } from '../services/acoes';
import { I } from './Icone';
import { Vazio } from './ui';

/** Respostas de um toque: o que acontece todo dia entre a van e a portaria. */
const RAPIDAS = {
  motorista: ['Bom dia! Chegando em 5 min', 'Vou atrasar uns 10 min', 'Hoje não faço a saída', 'Estou na portaria'],
  escola: ['Saída antecipada hoje', 'Um aluno vai sair mais cedo', 'Pode entrar pelo portão 2', 'Recebido, obrigado!'],
};

/**
 * Conversa entre o tio e a escola (uma por van + escola). Simples como WhatsApp, mas separado do pessoal:
 * fica registrado, chega como aviso e funciona sem sinal (vai pela fila do aparelho).
 */
export function ChatRecados({ vanId, escolaId, eu, titulo, sub }: { vanId: string; escolaId: string; eu: 'motorista' | 'escola'; titulo: string; sub?: string }) {
  const msgs = useLiveQuery(() => db.recados.where('vanId').equals(vanId).filter((r) => r.escolaId === escolaId).sortBy('criadoEm'), [vanId, escolaId]) ?? [];
  const [txt, setTxt] = useState('');
  const fim = useRef<HTMLDivElement>(null);
  const naoLidas = msgs.filter((m) => m.de !== eu && !m.lida).length;
  useEffect(() => { fim.current?.scrollIntoView({ block: 'nearest' }); }, [msgs.length]);
  useEffect(() => { if (naoLidas) void lerRecados(vanId, escolaId).catch(() => undefined); }, [naoLidas, vanId, escolaId]);
  const enviar = async (t: string) => { await enviarRecado(vanId, escolaId, eu, t); setTxt(''); };
  return (
    <div>
      <strong className="nome-perfil">{titulo}</strong>
      {sub && <span className="muted small">{sub}</span>}
      <div className="chat" style={{ marginTop: 10 }}>
        {msgs.length === 0 && <Vazio ic="mensagem">Nenhum recado ainda. Use as respostas rápidas abaixo.</Vazio>}
        {msgs.map((m) => (
          <div key={m.id} className={`bolha ${m.de === eu ? 'minha' : 'dele'}`}>
            {m.texto}<small>{hora(m.criadoEm)}{m.enviando ? ' · aguardando internet' : m.de === eu && m.lida ? ' · lido' : ''}</small>
          </div>
        ))}
        <div ref={fim} />
      </div>
      <div className="respostas-rapidas">{RAPIDAS[eu].map((r) => <button key={r} type="button" className="tag" onClick={() => void enviar(r)}>{r}</button>)}</div>
      <form className="chat-envio" onSubmit={(e) => { e.preventDefault(); void enviar(txt); }}>
        <input className="inp" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Escreva um recado…" enterKeyHint="send" />
        <button className="btn btn-escuro chat-enviar" disabled={!txt.trim()} aria-label="Enviar"><I n="enviar" /></button>
      </form>
    </div>
  );
}

/** Lista de conversas (escolas do tio ou vans da escola) + a conversa aberta. Celular: uma coisa de cada vez. */
export function ConversasRecados({ eu, conversas }: {
  eu: 'motorista' | 'escola';
  conversas: { vanId: string; escolaId: string; nome: string; detalhe: string; cor?: string }[];
}) {
  const todos = useLiveQuery(() => db.recados.toArray()) ?? [];
  const [sel, setSel] = useState<string | null>(null);
  const lista = conversas.map((c) => {
    const m = todos.filter((r) => r.vanId === c.vanId && r.escolaId === c.escolaId).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
    return { ...c, chave: `${c.vanId}|${c.escolaId}`, ultima: m[m.length - 1], naoLidas: m.filter((r) => r.de !== eu && !r.lida).length };
  }).sort((a, b) => (b.ultima?.criadoEm ?? '').localeCompare(a.ultima?.criadoEm ?? ''));
  const atual = lista.find((c) => c.chave === sel) ?? lista.find((c) => c.ultima) ?? lista[0];
  if (!lista.length) return <section className="card"><Vazio ic="mensagem">{eu === 'motorista' ? 'Cadastre as escolas que você atende para falar com elas.' : 'Nenhuma van atende esta escola ainda.'}</Vazio></section>;
  return (
    <div className={`mensagens ${sel ? 'com-conversa' : ''}`}>
      <section className="card lista-conversas">
        {lista.map((c) => (
          <button key={c.chave} type="button" className={`conversa ${atual?.chave === c.chave ? 'ativa' : ''}`} onClick={() => setSel(c.chave)}>
            <span className="nota-ic"><I n={eu === 'motorista' ? 'escola' : 'van'} /></span>
            <span className="conversa-texto">
              <span className="entre"><strong>{c.nome}</strong>{c.ultima && <small className="muted">{hora(c.ultima.criadoEm)}</small>}</span>
              <span className="muted small conversa-previa">{c.ultima ? `${c.ultima.de === eu ? 'Você: ' : ''}${c.ultima.texto}` : c.detalhe}</span>
            </span>
            {c.naoLidas > 0 && <span className="conversa-nao-lidas">{c.naoLidas}</span>}
          </button>
        ))}
      </section>
      <section className="card painel-conversa">
        {atual && (
          <>
            <button type="button" className="btn btn-claro btn-sm so-celular" style={{ marginBottom: 10 }} onClick={() => setSel(null)}><I n="voltar" />Conversas</button>
            <ChatRecados vanId={atual.vanId} escolaId={atual.escolaId} eu={eu} titulo={atual.nome} sub={atual.detalhe} />
          </>
        )}
      </section>
    </div>
  );
}
