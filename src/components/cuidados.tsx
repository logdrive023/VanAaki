import { useState } from 'react';
import type { Aluno } from '../db/types';
import { primeiroNome } from '../lib/util';
import { salvarCuidados } from '../services/acoes';
import { I } from './Icone';
import { Modal } from './ui';

export const temCuidados = (a: Aluno) => !!(a.cuidados?.trim() || a.contatoExtra?.trim() || a.telefoneExtra?.trim());

/** Para o tio: a linha que aparece no aluno e na parada da rota. Discreta quando não tem nada. */
export function CuidadosLinha({ a, onEditar }: { a: Aluno; onEditar?: () => void }) {
  if (!temCuidados(a)) return onEditar ? <button type="button" className="cuidados-add" onClick={onEditar}><I n="saude" />cuidados e emergência</button> : null;
  return (
    <div className="cuidados-linha" onClick={onEditar} role={onEditar ? 'button' : undefined}>
      <I n="saude" />
      <div>
        {a.cuidados && <strong>{a.cuidados}</strong>}
        {(a.contatoExtra || a.telefoneExtra) && (
          <span>Emergência: {a.contatoExtra || 'contato'}{a.telefoneExtra && <> · <a href={`tel:${a.telefoneExtra}`} onClick={(e) => e.stopPropagation()}>{a.telefoneExtra}</a></>}</span>
        )}
      </div>
    </div>
  );
}

/** Para a família: o cartão no início. Vazio, convida a preencher; preenchido, mostra o que o tio sabe. */
export function CuidadosCard({ a }: { a: Aluno }) {
  const [editar, setEditar] = useState(false);
  const nome = primeiroNome(a.nome);
  return (
    <div className="m-card">
      <h4>Cuidados com {nome} {temCuidados(a) && <button type="button" className="ver-tudo" onClick={() => setEditar(true)}>editar</button>}</h4>
      {temCuidados(a) ? (
        <>
          <CuidadosLinha a={a} />
          <p className="muted small" style={{ marginTop: 8 }}>Só o tio vê. A escola e as outras famílias, não.</p>
        </>
      ) : (
        <>
          <p className="muted small">Alergia, remédio, medo de algo, quem chamar se você não atender. Leva 1 minuto e o tio fica sabendo.</p>
          <button type="button" className="btn btn-claro btn-bloco" style={{ marginTop: 10 }} onClick={() => setEditar(true)}><I n="saude" />Contar ao tio</button>
        </>
      )}
      {editar && <EditarCuidados a={a} onFechar={() => setEditar(false)} />}
    </div>
  );
}

export function EditarCuidados({ a, onFechar, porTio }: { a: Aluno; onFechar: () => void; porTio?: boolean }) {
  const [cuidados, setCuidados] = useState(a.cuidados ?? '');
  const [contato, setContato] = useState(a.contatoExtra ?? '');
  const [tel, setTel] = useState(a.telefoneExtra ?? '');
  const [salvando, setSalvando] = useState(false);
  const nome = primeiroNome(a.nome);
  const salvar = async () => {
    setSalvando(true);
    try { await salvarCuidados(a.id, cuidados.trim(), contato.trim(), tel.trim()); onFechar(); } finally { setSalvando(false); }
  };
  return (
    <Modal titulo={`Cuidados com ${nome}`} onFechar={onFechar}>
      <div className="pilha" style={{ gap: 14 }}>
        <label className="fld"><span>{porTio ? 'O que precisa saber' : `O que o tio precisa saber sobre ${nome}`}</span>
          <textarea rows={3} maxLength={500} value={cuidados} onChange={(e) => setCuidados(e.target.value)} placeholder="Ex.: alergia a amendoim · usa bombinha de asma na mochila · tem medo de cachorro" />
        </label>
        <strong style={{ fontSize: 14 }}>Se {porTio ? 'a família' : 'você'} não atender, chamar</strong>
        <label className="fld"><span>Nome</span><input value={contato} maxLength={80} onChange={(e) => setContato(e.target.value)} placeholder="Ex.: Vó Maria" /></label>
        <label className="fld"><span>Telefone</span><input value={tel} maxLength={30} inputMode="tel" onChange={(e) => setTel(e.target.value)} placeholder="11 90000-0000" /></label>
        <span className="muted small">Só o tio da van e a família veem. Funciona mesmo sem internet: envia quando voltar.</span>
        <button className="btn btn-primario btn-bloco btn-grande" disabled={salvando} onClick={() => void salvar()}><I n="check" />Salvar</button>
      </div>
    </Modal>
  );
}
