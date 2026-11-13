import { PLANOS, type Plano } from '../lib/turnos';
import { I } from './Icone';

/** As 4 opções do dia em botões grandes (família). */
export function EscolhaPlano({ valor, onChange }: { valor: Plano; onChange: (p: Plano) => void }) {
  return (
    <div className="planos-dia">
      {PLANOS.map((p) => (
        <button key={p.id} type="button" className={`plano-dia ${valor === p.id ? 'ativo' : ''} ${p.id === 'nao_vai' ? 'nao' : ''}`} onClick={() => onChange(p.id)} aria-pressed={valor === p.id}>
          <span className="ic"><I n={p.ic} /></span>
          <strong>{p.nome}</strong>
          <small>{p.desc}</small>
        </button>
      ))}
    </div>
  );
}

/** Versão compacta (lista do motorista). */
export function SeletorPlano({ valor, onChange }: { valor: Plano; onChange: (p: Plano) => void }) {
  return (
    <select className={`seletor-plano ${valor !== 'ambos' ? 'mudou' : ''}`} value={valor} onChange={(e) => onChange(e.target.value as Plano)} aria-label="Combinado do dia">
      {PLANOS.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
    </select>
  );
}
