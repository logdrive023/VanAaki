import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/cliente';
import { I } from '../../components/Icone';
import type { ResumoViagem } from '../../components/trajetos';
import { Kpi } from '../../components/ui';
import type { ConfigVan, TipoViagem, Turno } from '../../db/types';
import { NOME_TURNO } from '../../lib/turnos';
import { centavos, reais } from '../../lib/util';
import { salvarConfig } from '../../services/acoes';
import type { DadosVan } from './dados';
import { planejarTrecho } from './plano';

const COMBUSTIVEIS: { id: NonNullable<ConfigVan['combustivel']>; nome: string }[] = [
  { id: 'gasolina', nome: 'Gasolina' }, { id: 'diesel', nome: 'Diesel' }, { id: 'etanol', nome: 'Etanol' }, { id: 'gnv', nome: 'GNV' },
];
const DIAS_UTEIS_MES = 21;
/** 28,3 (vírgula, como no Brasil) */
const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Economia da van — SÓ INFORMATIVO.
 * Junta o que o app já sabe: os km que a van rodou de verdade (GPS dos últimos 30 dias), o consumo do veículo,
 * o preço do combustível e o faturamento (mensalidades). Mostra quanto a rota custa e se dá para rodar menos
 * na mesma rota. Nunca compara crianças nem sugere deixar alguém de fora.
 */
export function Economia({ d }: { d: DadosVan }) {
  const cfg = d.van!.config ?? {};
  const consumo = cfg.consumoKmL || 8;
  const preco = cfg.precoLitro || 619;
  const custoKm = preco / consumo; // centavos por km
  const [hist, setHist] = useState<ResumoViagem[] | null>(null);
  useEffect(() => { void api<ResumoViagem[]>('/conformidade/historico?dias=30').then(setHist).catch(() => setHist([])); }, []);

  // o que já rodou (GPS)
  const r = useMemo(() => {
    const l = (hist ?? []).filter((v) => v.km > 0.2);
    const km = l.reduce((s, v) => s + v.km, 0);
    const dias = new Set(l.map((v) => v.data)).size;
    const kmDia = dias ? km / dias : 0;
    const porTrecho = new Map<string, { km: number; n: number; alunos: number }>();
    for (const v of l) {
      const k = `${v.turno}|${v.tipo}`;
      const x = porTrecho.get(k) ?? { km: 0, n: 0, alunos: 0 };
      porTrecho.set(k, { km: x.km + v.km, n: x.n + 1, alunos: x.alunos + v.alunos });
    }
    return { km, dias, kmDia, viagens: l.length, porTrecho };
  }, [hist]);

  const custoMes = Math.round(r.kmDia * DIAS_UTEIS_MES * custoKm);
  const faturamento = d.ativos.reduce((s, a) => s + a.mensalidade, 0);
  const pct = faturamento ? (custoMes / faturamento) * 100 : 0;
  const saude = pct === 0 ? null : pct < 15 ? { cls: 'verde', t: 'Saudável', s: 'O combustível pesa pouco no faturamento.' }
    : pct < 25 ? { cls: 'laranja', t: 'Atenção', s: 'Vale conferir a ordem das casas e o preço do combustível.' }
    : { cls: 'vermelho', t: 'Pesado', s: 'O combustível está levando uma parte grande das mensalidades.' };

  // rota planejada: a ordem de hoje × a melhor ordem pelas ruas
  const comparacao = useMemo(() => {
    const l: { turno: Turno; tipo: TipoViagem; atual: number; melhor: number; fixa: boolean }[] = [];
    for (const t of d.van!.turnos.filter((x) => x.ativo && x.escolaIds.length)) {
      for (const tipo of ['ida', 'volta'] as const) {
        const atual = planejarTrecho(d, t.turno, tipo, () => undefined);
        if (!atual.doTurno.length) continue;
        const melhor = planejarTrecho(d, t.turno, tipo, () => undefined, new Date(), true);
        l.push({ turno: t.turno, tipo, atual: atual.km, melhor: melhor.km, fixa: atual.fixa });
      }
    }
    return l;
  }, [d]);
  const sobraKmDia = comparacao.reduce((s, c) => s + Math.max(0, c.atual - c.melhor), 0);

  return (
    <div className="pilha">
      <div className="aviso-info"><I n="escudo" /><span><b>É só informativo.</b> Estes números ajudam você a organizar a van e o preço. O app nunca compara crianças nem sugere deixar alguém sem transporte: cada família conta.</span></div>

      <section className="kpis">
        <Kpi ic="combustivel" rot="Combustível no mês" num={hist ? reais(custoMes) : '…'} sub={r.dias ? `estimado por ${r.dias} dia(s) de rota` : 'aparece depois das primeiras rotas'} />
        <Kpi ic="rota" rot="Km por dia" num={hist ? `${fmt(r.kmDia)} km` : '…'} sub={`${r.viagens} trajeto(s) medidos pelo GPS`} />
        <Kpi ic="financeiro" rot="Faturamento do mês" num={reais(faturamento)} sub={`${d.ativos.length} aluno(s) ativos`} />
        <Kpi ic="dinheiro" rot="Custo por km" num={reais(Math.round(custoKm))} sub={`${consumo.toLocaleString('pt-BR')} km/l · ${reais(preco)}/l`} />
      </section>

      <div className="grade-painel">
        <section className="card pilha" style={{ gap: 14 }}>
          <div className="entre"><h3>A rota está pagando bem?</h3>{saude && <span className={`tag ${saude.cls === 'verde' ? 'tag-verde' : saude.cls === 'laranja' ? 'tag-laranja' : 'tag-vermelho'}`}>{saude.t}</span>}</div>
          {faturamento > 0 && r.dias > 0 ? (
            <>
              <div className="medidor">
                <div className="md-barra"><i className={saude?.cls} style={{ width: `${Math.min(100, pct)}%` }} /><span style={{ left: '15%' }} /><span style={{ left: '25%' }} /></div>
                <div className="entre small muted"><span>combustível: <b className="texto">{pct.toFixed(0)}%</b> das mensalidades</span><span>{reais(faturamento - custoMes)} sobram</span></div>
              </div>
              <p className="muted small">{saude?.s} Conta: {fmt(r.kmDia)} km/dia × {DIAS_UTEIS_MES} dias úteis × {reais(Math.round(custoKm))}/km. Não inclui manutenção, seguro e pneus.</p>
            </>
          ) : <p className="muted small">Depois das primeiras rotas com o GPS ligado, o app compara o gasto de combustível com as mensalidades.</p>}

          <h3 style={{ marginTop: 6 }}>Por trecho (média dos últimos 30 dias)</h3>
          {[...r.porTrecho.entries()].map(([k, x]) => {
            const [turno, tipo] = k.split('|') as [Turno, TipoViagem];
            const kmMedio = x.km / x.n;
            return (
              <div key={k} className="linha-item">
                <span className="ic-txt"><I n={turno} />{tipo === 'ida' ? 'Ida' : 'Volta'} · {NOME_TURNO[turno]}<span className="muted small">{fmt(kmMedio)} km · {(x.alunos / x.n).toFixed(0)} aluno(s)</span></span>
                <strong>{reais(Math.round(kmMedio * custoKm))}<span className="muted small"> /dia</span></strong>
              </div>
            );
          })}
          {!r.porTrecho.size && <span className="muted small">Nenhum trajeto com GPS nos últimos 30 dias.</span>}
        </section>

        <section className="card pilha" style={{ gap: 14 }}>
          <h3>Dá para rodar menos?</h3>
          {comparacao.length ? (
            <>
              {sobraKmDia > 0.3
                ? <div className="aviso-ok" style={{ background: 'var(--amarelo-suave)', color: 'var(--amarelo-texto)' }}><I n="raio" />A melhor ordem pelas ruas rodaria ~{fmt(sobraKmDia)} km a menos por dia: cerca de <b>{reais(Math.round(sobraKmDia * DIAS_UTEIS_MES * custoKm))}</b> por mês.</div>
                : <div className="aviso-ok"><I n="check" />Sua ordem das casas já está entre as melhores para as ruas de hoje.</div>}
              {comparacao.map((c) => (
                <div key={`${c.turno}${c.tipo}`} className="linha-item">
                  <span className="ic-txt"><I n={c.turno} />{c.tipo === 'ida' ? 'Ida' : 'Volta'} · {NOME_TURNO[c.turno]}{c.fixa && <span className="tag">rota fixa</span>}</span>
                  <span className="small">{fmt(c.atual)} km{c.atual - c.melhor > 0.3 ? <b className="laranja"> · melhor: {fmt(c.melhor)}</b> : <b className="verde"> · ótima</b>}</span>
                </div>
              ))}
              <p className="muted small">Comparação em linha reta com todos do turno indo. A rota fixa é sua escolha (às vezes a ordem leva em conta coisas que o mapa não sabe); aqui é só para você decidir com números.</p>
            </>
          ) : <p className="muted small">Cadastre turnos, escolas e alunos para comparar.</p>}
          <hr className="sep" />
          <VeiculoForm cfg={cfg} />
        </section>
      </div>
    </div>
  );
}

/** Consumo do veículo e preço do combustível (o tio coloca o que paga de verdade). */
function VeiculoForm({ cfg }: { cfg: ConfigVan }) {
  const [consumo, setConsumo] = useState(String(cfg.consumoKmL || 8).replace('.', ','));
  const [preco, setPreco] = useState(((cfg.precoLitro || 619) / 100).toFixed(2).replace('.', ','));
  const [comb, setComb] = useState<ConfigVan['combustivel']>(cfg.combustivel || 'gasolina');
  const [msg, setMsg] = useState('');
  const salvar = async () => {
    const km = Number(consumo.replace(',', '.'));
    const p = centavos(preco);
    if (!km || km <= 0 || km > 40) return setMsg('Consumo inválido (ex.: 8,5 km/l).');
    if (!p || p <= 0) return setMsg('Preço inválido (ex.: 6,19).');
    try { await salvarConfig({ ...cfg, consumoKmL: km, precoLitro: p, combustivel: comb }); setMsg('Salvo.'); } catch (e) { setMsg((e as Error).message); }
  };
  return (
    <div className="form">
      <strong className="ic-txt"><I n="van" />Seu veículo</strong>
      <div className="escolha">{COMBUSTIVEIS.map((c) => <button key={c.id} type="button" className={comb === c.id ? 'ativo' : ''} onClick={() => setComb(c.id)}>{c.nome}</button>)}</div>
      <div className="dupla">
        <label className="fld"><span>Consumo (km por litro)</span><input value={consumo} onChange={(e) => setConsumo(e.target.value)} inputMode="decimal" /></label>
        <label className="fld"><span>Preço que você paga (R$/litro)</span><input value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" /></label>
      </div>
      <div className="linha"><button className="btn btn-escuro btn-sm" onClick={() => void salvar()}>Salvar</button>{msg && <span className="muted small">{msg}</span>}</div>
    </div>
  );
}
