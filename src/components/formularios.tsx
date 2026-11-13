import { useState } from 'react';
import { api } from '../api/cliente';
import { TURNOS, type Escola, type Horario, type LatLng, type Turno } from '../db/types';
import { NOME_TURNO } from '../lib/turnos';
import { I } from './Icone';
import { salvarEscola } from '../services/acoes';
import Mapa3D from './Mapa3D';
import { Modal, Toggle } from './ui';

/** Busca o endereço (OpenStreetMap, pelo servidor) e devolve o ponto no mapa. */
export function BuscaEndereco({ valor, onTexto, onLocal }: { valor: string; onTexto: (t: string) => void; onLocal: (p: LatLng, nome: string) => void }) {
  const [res, setRes] = useState<{ nome: string; local: LatLng }[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState('');
  const buscar = async () => {
    setErro(''); setBuscando(true);
    try {
      const l = await api<{ nome: string; local: LatLng }[]>(`/geo/buscar?q=${encodeURIComponent(valor)}`);
      setRes(l);
      if (l.length === 1) { onLocal(l[0].local, l[0].nome); setRes(null); }
      if (!l.length) setErro('Não achei. Tente com o bairro e a cidade, ou toque no mapa.');
    } catch (e) { setErro((e as Error).message); }
    setBuscando(false);
  };
  return (
    <div className="busca-end">
      <div className="linha" style={{ flexWrap: 'nowrap' }}>
        <input style={{ flex: 1, minWidth: 0 }} value={valor} onChange={(e) => onTexto(e.target.value)} placeholder="Rua, número, bairro, cidade"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void buscar(); } }} />
        <button type="button" className="btn btn-claro" disabled={buscando || valor.trim().length < 4} onClick={() => void buscar()}><I n={buscando ? 'carregando' : 'busca'} />Buscar</button>
      </div>
      {erro && <small className="muted">{erro}</small>}
      {res && res.length > 1 && (
        <div className="busca-res">
          {res.map((r) => <button type="button" key={`${r.local.lat},${r.local.lng}`} onClick={() => { onLocal(r.local, r.nome); setRes(null); }}>{r.nome}</button>)}
        </div>
      )}
    </div>
  );
}

/** Cadastro/edição de escola: nome, endereço no mapa e o horário de cada turno. */
export function FormEscola({ inicial, onFechar, onSalva }: { inicial?: Escola; onFechar: () => void; onSalva?: (e: Escola) => void }) {
  const [nome, setNome] = useState(inicial?.nome ?? '');
  const [endereco, setEndereco] = useState(inicial?.endereco ?? '');
  const [local, setLocal] = useState<LatLng | null>(inicial?.local ?? null);
  const [horarios, setHorarios] = useState<Partial<Record<Turno, Horario>>>(inicial?.horarios ?? { manha: { entrada: '07:00', saida: '12:00' } });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const padrao: Record<Turno, Horario> = { manha: { entrada: '07:00', saida: '12:00' }, tarde: { entrada: '13:00', saida: '18:00' }, noite: { entrada: '19:00', saida: '22:30' } };
  const salvar = async () => {
    if (!local) return setErro('Marque a escola no mapa (busque o endereço ou toque no mapa).');
    setSalvando(true); setErro('');
    try { const e = await salvarEscola(inicial?.id ?? null, { nome, endereco, local, horarios }); onSalva?.(e); onFechar(); } catch (e) { setErro((e as Error).message); }
    setSalvando(false);
  };
  return (
    <Modal titulo={inicial ? `Editar ${inicial.nome}` : 'Nova escola'} onFechar={onFechar}>
      <div className="form">
        <label className="fld"><span>Nome da escola</span><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Colégio…" /></label>
        <div className="fld"><span>Endereço</span>
          <BuscaEndereco valor={endereco} onTexto={setEndereco} onLocal={(p) => setLocal(p)} />
        </div>
        <Mapa3D altura={220} enquadrar={local ? [local] : undefined} chave={`esc-${local?.lat}`} marcadores={local ? [{ id: 'e', pos: local, tipo: 'escola', rotulo: nome || 'Escola' }] : []} onClick={setLocal} />
        <div className="fld"><span>Horários (marque os turnos que a escola tem)</span>
          {TURNOS.map((t) => {
            const h = horarios[t];
            return (
              <div key={t} className="horario-linha">
                <Toggle on={!!h} onChange={(on) => setHorarios((x) => { const n = { ...x }; if (on) n[t] = padrao[t]; else delete n[t]; return n; })} />
                <span className="horario-nome"><I n={t} />{NOME_TURNO[t]}</span>
                {h ? (
                  <span className="linha" style={{ gap: 6 }}>
                    <input type="time" value={h.entrada} onChange={(e) => setHorarios((x) => ({ ...x, [t]: { ...h, entrada: e.target.value } }))} />
                    <span className="muted">às</span>
                    <input type="time" value={h.saida} onChange={(e) => setHorarios((x) => ({ ...x, [t]: { ...h, saida: e.target.value } }))} />
                  </span>
                ) : <span className="muted small">sem aula</span>}
              </div>
            );
          })}
        </div>
        {erro && <div className="aviso-erro">{erro}</div>}
        <button className="btn btn-primario btn-bloco" disabled={salvando} onClick={() => void salvar()}>{salvando ? 'Salvando…' : 'Salvar escola'}</button>
      </div>
    </Modal>
  );
}
