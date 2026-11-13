import { useEffect, useState } from 'react';
import { api } from '../api/cliente';
import { I, Logo } from '../components/Icone';
import Mapa3D from '../components/Mapa3D';
import { HistoricoLista, MapaTrajeto, useTrajeto, type AcessoFiscal, type ResumoViagem } from '../components/trajetos';
import type { LatLng, Turno } from '../db/types';
import { NOME_TURNO } from '../lib/turnos';
import { haQuanto } from '../lib/util';

interface DadosFiscal {
  emitidoEm: string; diasHistorico: number; acesso: AcessoFiscal;
  van: { nome: string; motorista: string; telefone: string; placa: string; modelo: string; avaliacao: number };
  escolas: { nome: string; endereco: string; credenciamento: string; turnos: string[] }[];
  aoVivo: { viagemId: string; turno: Turno; tipo: 'ida' | 'volta'; pos: LatLng; atualizadoEm: string; aBordo: number; origem: string } | null;
  historico: ResumoViagem[];
}

/**
 * Página do poder público (PL 1240/2026): aberta pelo link que o motorista gera, sem login.
 * Mostra a van, a posição ao vivo e o histórico dos trajetos — nunca nome ou endereço de criança.
 */
export default function Fiscal({ token }: { token: string }) {
  const [f, setF] = useState<DadosFiscal | null>(null);
  const [erro, setErro] = useState('');
  const [sel, setSel] = useState<string>();
  useEffect(() => {
    let vivo = true;
    const carregar = () => api<DadosFiscal>(`/publico/fiscal/${encodeURIComponent(token)}`, { semToken: true })
      .then((d) => { if (vivo) { setF(d); setSel((s) => s ?? d.historico[0]?.id); } })
      .catch((e) => { if (vivo) setErro((e as Error).message); });
    void carregar();
    const t = setInterval(carregar, 15000); // posição ao vivo
    return () => { vivo = false; clearInterval(t); };
  }, [token]);
  const { pts } = useTrajeto(sel ? `/publico/fiscal/${encodeURIComponent(token)}/viagens/${sel}/trajeto` : null, true);

  if (erro && !f) {
    return (
      <div className="entrar">
        <Logo />
        <div className="entrar-card" style={{ textAlign: 'center', alignItems: 'center' }}>
          <span className="entrar-ic" style={{ background: 'var(--vermelho-suave)', color: 'var(--vermelho-texto)' }}><I n="alerta" /></span>
          <h1 style={{ fontSize: 'calc(20px * var(--esc, 1))' }}>Link indisponível</h1>
          <p className="muted">{erro}</p>
        </div>
      </div>
    );
  }
  if (!f) return <div className="carregando"><div className="giro" /><span className="muted">Abrindo o relatório…</span></div>;
  const v = f.historico.find((x) => x.id === sel);
  const km = f.historico.reduce((s, x) => s + x.km, 0);
  const pontos = f.historico.reduce((s, x) => s + x.pontos, 0);
  const alunos = f.historico.reduce((s, x) => s + x.alunos, 0);

  return (
    <div className="fiscal">
      <div className="fiscal-topo">
        <Logo />
        <div className="linha nao-imprimir">
          <span className="faixa">PL 1240/2026</span>
          <button className="btn btn-claro btn-sm" onClick={() => window.print()}><I n="imprimir" />Imprimir / PDF</button>
        </div>
      </div>

      <section className="fiscal-cab">
        <div>
          <span className="muted small">Relatório de fiscalização · transporte escolar</span>
          <h1>{f.van.nome}</h1>
          <p className="muted" style={{ marginTop: 4 }}>Motorista: {f.van.motorista} · {f.van.telefone}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className="placa" style={{ fontSize: 'calc(18px * var(--esc, 1))', padding: '4px 12px' }}>{f.van.placa}</span>
          <p className="muted small" style={{ marginTop: 8 }}>{f.van.modelo}</p>
        </div>
      </section>

      <section className="ficha">
        <div><span>Trajetos · {f.diasHistorico} dias</span><strong>{f.historico.length}</strong></div>
        <div><span>Distância registrada</span><strong>{Math.round(km).toLocaleString('pt-BR')} km</strong></div>
        <div><span>Posições com horário</span><strong>{pontos.toLocaleString('pt-BR')}</strong></div>
        <div><span>Alunos transportados</span><strong>{alunos.toLocaleString('pt-BR')}</strong></div>
      </section>

      <div className="fiscal-grade">
        <section className="card pilha" style={{ gap: 12 }}>
          <div className="entre">
            <h3>Agora</h3>
            {f.aoVivo ? <span className="tag tag-verde ao-vivo"><span className="ponto" />em rota · atualizado {haQuanto(f.aoVivo.atualizadoEm)}</span> : <span className="tag">sem rota em andamento</span>}
          </div>
          {f.aoVivo ? (
            <>
              <Mapa3D altura={320} marcadores={[{ id: 'van', pos: f.aoVivo.pos, tipo: 'van' }]} seguir={f.aoVivo.pos} />
              <div className="linha small">
                <span className="tag"><I n={f.aoVivo.turno} />{NOME_TURNO[f.aoVivo.turno]} · {f.aoVivo.tipo === 'ida' ? 'ida' : 'volta'}</span>
                <span className="tag"><I n="alunos" />{f.aoVivo.aBordo} aluno(s) a bordo</span>
                {f.aoVivo.origem === 'simulacao' && <span className="tag tag-amarelo">demonstração</span>}
              </div>
            </>
          ) : <div className="vazio"><span className="ic"><I n="van" /></span>A van não está em rota agora. A posição aparece aqui assim que o motorista iniciar a próxima.</div>}
        </section>

        <section className="card">
          <h3 style={{ marginBottom: 6 }}>Escolas atendidas</h3>
          {f.escolas.map((e) => (
            <div key={e.nome} className="linha-item">
              <div style={{ minWidth: 0 }}><strong>{e.nome}</strong><span className="muted small">{e.endereco} · {e.turnos.join(', ') || '—'}</span></div>
              <span className={`tag ${e.credenciamento === 'credenciada' ? 'tag-verde' : 'tag-laranja'}`}>{e.credenciamento}</span>
            </div>
          ))}
          {!f.escolas.length && <span className="muted small">Nenhuma escola cadastrada.</span>}
        </section>
      </div>

      <section className="card">
        <div className="card-topo">
          <div><h3>Histórico dos trajetos</h3><span className="muted small">Últimos {f.diasHistorico} dias · posição registrada com data e hora</span></div>
        </div>
        <div className="historico-grade">
          <div className="historico-rolagem"><HistoricoLista lista={f.historico} sel={sel} onSel={setSel} limite={400} /></div>
          {sel && <MapaTrajeto v={v} pts={pts} altura={440} />}
        </div>
      </section>

      <div className="nota-lgpd">
        <I n="escudo" />
        <span>Acesso somente leitura emitido pelo motorista para <b>{f.acesso.nome}</b>, válido até {new Date(f.acesso.expiraEm).toLocaleDateString('pt-BR')}.
          Em respeito à LGPD, este relatório não mostra nome, endereço ou foto de alunos: só a van, os trajetos e a quantidade de alunos transportados.
          Gerado em {new Date(f.emitidoEm).toLocaleString('pt-BR')} pelo VanAaki.</span>
      </div>
    </div>
  );
}
