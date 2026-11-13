import { useState } from 'react';
import { api, put } from '../api/cliente';
import { sincronizar } from '../api/sync';
import type { Documento, TipoDocumento } from '../db/types';
import { nomeDoc, resumoDocs, TIPOS_DOC, textoSituacao, type SituacaoDoc } from '../lib/documentos';
import { I, type NomeIcone } from './Icone';
import { Modal } from './ui';

const IC: Record<SituacaoDoc, NomeIcone> = { ok: 'check', vence: 'relogio', vencido: 'alerta', falta: 'mais' };

/** Selo com a situação (cor + ícone + texto: não depende só da cor). */
export function SeloDoc({ sit, texto }: { sit: SituacaoDoc; texto: string }) {
  return <span className={`selo-doc s-${sit}`}><I n={IC[sit]} />{texto}</span>;
}

/** Tela do tio: o que está em dia, o que vence e o que falta. Um toque edita. */
export function DocumentosTio({ docs }: { docs: Documento[] }) {
  const r = resumoDocs(docs);
  const [editando, setEditando] = useState<TipoDocumento | null>(null);
  return (
    <>
      <section className={`docs-resumo s-${r.geral}`}>
        <span className="dr-ic"><I n={r.geral === 'ok' ? 'selo' : 'alerta'} /></span>
        <div>
          <strong>{r.geral === 'ok' ? 'Tudo em dia' : r.texto}</strong>
          <span>{r.geral === 'ok'
            ? 'A escola vê que a sua van está regular. O app avisa 30 dias antes de cada vencimento.'
            : 'A escola vê a situação dos seus documentos. Atualize para continuar credenciado.'}</span>
        </div>
      </section>
      {(['condutor', 'veiculo'] as const).map((grupo) => (
        <section key={grupo} className="m-card">
          <h4>{grupo === 'condutor' ? 'Você (condutor)' : 'A van (veículo)'}</h4>
          <div className="docs-lista">
            {r.lista.filter((x) => x.de === grupo).map((x) => (
              <button key={x.tipo} type="button" className="doc-linha" onClick={() => setEditando(x.tipo)}>
                <span className="dl-txt"><strong>{x.nome}</strong>{x.doc?.numero && <small>Nº {x.doc.numero}</small>}</span>
                <SeloDoc sit={x.sit} texto={textoSituacao(x.doc)} />
                <I n="chevron" />
              </button>
            ))}
          </div>
        </section>
      ))}
      <p className="muted small" style={{ padding: '0 4px' }}>
        Exigidos para o transporte escolar pelo Código de Trânsito (arts. 136 a 138) e pelas escolas. As famílias veem só se está em dia, nunca os números.
      </p>
      {editando && <EditarDocumento tipo={editando} atual={docs.find((d) => d.tipo === editando)} onFechar={() => setEditando(null)} />}
    </>
  );
}

function EditarDocumento({ tipo, atual, onFechar }: { tipo: TipoDocumento; atual?: Documento; onFechar: () => void }) {
  const info = TIPOS_DOC.find((t) => t.tipo === tipo)!;
  const [numero, setNumero] = useState(atual?.numero ?? '');
  const [validade, setValidade] = useState(atual?.validade ?? '');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const fazer = async (f: () => Promise<unknown>) => {
    setSalvando(true); setErro('');
    try { await f(); await sincronizar(); onFechar(); } catch (e) { setErro((e as Error).message); } finally { setSalvando(false); }
  };
  return (
    <Modal titulo={info.nome} onFechar={onFechar}>
      <form className="pilha" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); void fazer(() => put('/van/documentos', { tipo, numero, validade })); }}>
        <p className="muted small">{info.dica}</p>
        <label className="fld"><span>Válido até</span><input type="date" required value={validade} onChange={(e) => setValidade(e.target.value)} /></label>
        <label className="fld"><span>Número (opcional)</span><input value={numero} maxLength={40} onChange={(e) => setNumero(e.target.value)} placeholder="Como está no documento" /></label>
        {erro && <div className="aviso-erro" role="alert">{erro}</div>}
        <button className="btn btn-primario btn-bloco btn-grande" disabled={salvando}><I n="check" />Salvar</button>
        {atual && (
          <button type="button" className="btn btn-claro btn-bloco" disabled={salvando}
            onClick={() => void fazer(() => api(`/van/documentos/${tipo}`, { metodo: 'DELETE' }))}>Remover</button>
        )}
      </form>
    </Modal>
  );
}

/** Para a escola: o resumo da van e, num toque, a lista com números e datas. */
export function DocsDaVan({ docs }: { docs: Documento[] }) {
  const r = resumoDocs(docs);
  return (
    <details className="docs-van">
      <summary><SeloDoc sit={r.geral} texto={r.texto} /></summary>
      <ul>
        {r.lista.map((x) => (
          <li key={x.tipo}>
            <span>{x.nome}{x.doc?.numero && <small> · Nº {x.doc.numero}</small>}</span>
            <SeloDoc sit={x.sit} texto={textoSituacao(x.doc)} />
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Para a família: uma linha honesta (em dia, ou o que está vencido). */
export function LinhaDocsFamilia({ docs }: { docs: Documento[] }) {
  if (!docs.length) return null;
  const r = resumoDocs(docs);
  const vencido = r.lista.find((x) => x.sit === 'vencido');
  return vencido
    ? <span className="alerta-txt"><I n="alerta" />{nomeDoc(vencido.tipo)} da van está vencido</span>
    : <span><I n="selo" />Documentos da van e do motorista em dia</span>;
}
