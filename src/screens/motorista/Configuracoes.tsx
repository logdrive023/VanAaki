import { useEffect, useState } from 'react';
import { I } from '../../components/Icone';
import { Toggle } from '../../components/ui';
import type { ConfigVan } from '../../db/types';
import { pixCopiaECola, temPix } from '../../lib/pix';
import { reais } from '../../lib/util';
import { salvarConfig } from '../../services/acoes';
import type { DadosVan } from './dados';

const TIPOS: { id: NonNullable<ConfigVan['pixTipo']>; nome: string; ex: string }[] = [
  { id: 'celular', nome: 'Celular', ex: '11 99999-9999' },
  { id: 'cpf', nome: 'CPF', ex: '000.000.000-00' },
  { id: 'email', nome: 'E-mail', ex: 'voce@email.com' },
  { id: 'cnpj', nome: 'CNPJ', ex: '00.000.000/0001-00' },
  { id: 'aleatoria', nome: 'Aleatória', ex: 'chave aleatória do banco' },
];

/**
 * Configurações do tio: o que muda o dia a dia dele. Tudo tem um padrão bom — ele só mexe se quiser.
 * Os dados da van, os turnos e as escolas ficam nos botões "Minha van" e "Turnos e escolas".
 */
export function Configuracoes({ d, onMinhaVan, onTurnos }: { d: DadosVan; onMinhaVan: () => void; onTurnos: () => void }) {
  const inicial = d.van!.config ?? {};
  const [c, setC] = useState<ConfigVan>(inicial);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);
  useEffect(() => { setC(d.van!.config ?? {}); }, [d.van?.config]); // eslint-disable-line react-hooks/exhaustive-deps
  const mudou = JSON.stringify(c) !== JSON.stringify(inicial);
  const set = <K extends keyof ConfigVan>(k: K, v: ConfigVan[K]) => { setOk(false); setC((x) => ({ ...x, [k]: v })); };
  const salvar = async () => {
    setErro('');
    try { await salvarConfig(c); setOk(true); setTimeout(() => setOk(false), 2500); } catch (e) { setErro((e as Error).message); }
  };
  const tipo = TIPOS.find((t) => t.id === c.pixTipo);
  const exemplo = temPix(c) ? pixCopiaECola(c, d.van!.precoPadrao, 'EXEMPLO') : '';

  return (
    <div className="pilha">
      <div className="grade-config">
        <section className="card config-sec">
          <h3><I n="dinheiro" />Receber pelo Pix</h3>
          <p className="muted small">As famílias pagam a mensalidade direto na sua conta, com QR Code e "copia e cola" já com o valor. Sem taxa e sem intermediário. Você confirma quando o dinheiro cair.</p>
          <div className="fld"><span>Tipo da chave</span>
            <div className="escolha">{TIPOS.map((t) => <button key={t.id} type="button" className={c.pixTipo === t.id ? 'ativo' : ''} onClick={() => set('pixTipo', t.id)}>{t.nome}</button>)}</div>
          </div>
          <label className="fld"><span>Chave Pix</span><input value={c.pixChave ?? ''} onChange={(e) => set('pixChave', e.target.value)} placeholder={tipo?.ex ?? 'Escolha o tipo acima'} disabled={!c.pixTipo} inputMode={c.pixTipo === 'celular' || c.pixTipo === 'cpf' || c.pixTipo === 'cnpj' ? 'numeric' : 'text'} /></label>
          <div className="dupla">
            <label className="fld"><span>Nome do titular</span><input value={c.pixNome ?? ''} onChange={(e) => set('pixNome', e.target.value)} placeholder="Como aparece no banco" /></label>
            <label className="fld"><span>Cidade</span><input value={c.pixCidade ?? ''} onChange={(e) => set('pixCidade', e.target.value)} placeholder="São Paulo" /></label>
          </div>
          {exemplo
            ? <div className="aviso-ok"><I n="check" />Pronto: a família vai pagar {reais(d.van!.precoPadrao)} (exemplo) direto na sua chave.</div>
            : <span className="muted small">Sem Pix cadastrado, a família vê só o valor e combina o pagamento com você.</span>}
        </section>

        <section className="card config-sec">
          <h3><I n="van" />Rota</h3>
          <div className="opcao-linha">
            <div><strong>Confirmar embarque pelo GPS</strong><small>Parou na casa e saiu? O app marca "embarcou" sozinho. Você só dirige.</small></div>
            <Toggle on={!c.confirmarManual} onChange={(v) => set('confirmarManual', !v)} />
          </div>
          <div className="fld"><span>Avisar a família</span>
            <div className="escolha">
              {[1, 2, 3].map((n) => <button key={n} type="button" className={(c.avisoParadas ?? 1) === n ? 'ativo' : ''} onClick={() => set('avisoParadas', n)}>{n === 1 ? 'Quando for o próximo' : `${n} paradas antes`}</button>)}
            </div>
            <small className="muted">Com mais antecedência, a criança já está no portão quando você chega.</small>
          </div>
          <div className="fld"><span>Folga na hora de sair</span>
            <div className="escolha">
              {[3, 5, 10, 15].map((n) => <button key={n} type="button" className={(c.folgaMin ?? 5) === n ? 'ativo' : ''} onClick={() => set('folgaMin', n)}>{n} min</button>)}
            </div>
            <small className="muted">O app calcula a hora de sair pelo horário das escolas e soma essa folga.</small>
          </div>
        </section>

        <section className="card config-sec">
          <h3><I n="financeiro" />Mensalidades</h3>
          <div className="fld"><span>Dia de vencimento para aluno novo</span>
            <div className="escolha">{[5, 10, 15, 20].map((n) => <button key={n} type="button" className={(c.diaVencimento ?? 10) === n ? 'ativo' : ''} onClick={() => set('diaVencimento', n)}>Dia {n}</button>)}</div>
          </div>
          <div className="opcao-linha">
            <div><strong>Mensalidade padrão e vagas</strong><small>{reais(d.van!.precoPadrao)} · {d.van!.vagas} vaga(s) livre(s)</small></div>
            <button className="btn btn-claro btn-sm" onClick={onMinhaVan}>Editar</button>
          </div>
        </section>

        <section className="card config-sec">
          <h3><I n="estrela" />Extras</h3>
          <div className="opcao-linha">
            <div><strong>Conduta, pontos e prêmios</strong><small>Elogios, ocorrências e loja de prêmios para os alunos. Use se quiser: o resto do app funciona sem isso.</small></div>
            <Toggle on={!c.semGamificacao} onChange={(v) => set('semGamificacao', !v)} />
          </div>
          <div className="opcao-linha">
            <div><strong>Minha van</strong><small>{d.van!.nome} · {d.van!.placa || 'sem placa'} · garagem</small></div>
            <button className="btn btn-claro btn-sm" onClick={onMinhaVan}>Editar</button>
          </div>
          <div className="opcao-linha">
            <div><strong>Minhas escolas</strong><small>{d.van!.escolaIds.length} escola(s) · {d.van!.turnos.filter((t) => t.ativo).length} período(s)</small></div>
            <button className="btn btn-claro btn-sm" onClick={onTurnos}>Editar</button>
          </div>
        </section>
      </div>
      {erro && <div className="aviso-erro">{erro}</div>}
      {(mudou || ok) && (
        <div className="salvar-barra">
          <span>{ok ? 'Configurações salvas.' : 'Você tem alterações não salvas.'}</span>
          {!ok && <div className="linha" style={{ gap: 6 }}><button className="btn btn-sm btn-fantasma" style={{ color: '#fff' }} onClick={() => setC(inicial)}>Desfazer</button><button className="btn btn-primario btn-sm" onClick={() => void salvar()}>Salvar</button></div>}
        </div>
      )}
    </div>
  );
}
