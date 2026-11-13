import { useEffect, useState } from 'react';
import { api, API_URL, lerSessao, post } from '../../api/cliente';
import { I } from '../../components/Icone';
import { HistoricoLista, MapaTrajeto, useTrajeto, type AcessoFiscal, type ResumoViagem } from '../../components/trajetos';
import { Kpi } from '../../components/ui';
import { haQuanto } from '../../lib/util';
import type { DadosVan } from './dados';

interface Resumo {
  diasHistorico: number; diasGuarda: number; viagens: number; viagensComGps: number; pontos: number; km: number;
  ultimaPosicaoEm?: string; primeiraViagem?: string; acessos: AcessoFiscal[];
}

const linkFiscal = (token: string) => `${location.origin}${location.pathname}#/fiscal/${token}`;
const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

/**
 * PL 1240/2026 (GPS obrigatório no transporte escolar): o que a lei pede e onde o VanAaki já atende,
 * o histórico dos trajetos (90 dias), a planilha para a fiscalização e o link para o poder público.
 */
export function Conformidade({ d }: { d: DadosVan }) {
  const [r, setR] = useState<Resumo | null>(null);
  const [hist, setHist] = useState<ResumoViagem[] | null>(null);
  const [sel, setSel] = useState<string>();
  const [erro, setErro] = useState('');
  const recarregar = () => {
    api<Resumo>('/conformidade').then(setR).catch((e) => setErro((e as Error).message));
    api<ResumoViagem[]>('/conformidade/historico?dias=90').then((l) => { setHist(l); setSel((s) => s ?? l[0]?.id); }).catch((e) => setErro((e as Error).message));
  };
  useEffect(recarregar, [d.ativa?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const { pts } = useTrajeto(sel ? `/conformidade/viagens/${sel}/trajeto` : null);
  const v = hist?.find((x) => x.id === sel);

  const baixar = async () => {
    const s = lerSessao('motorista');
    const resp = await fetch(`${API_URL}/api/conformidade/historico.csv?dias=90`, { headers: s ? { Authorization: `Bearer ${s.token}` } : {} });
    if (!resp.ok) { setErro('Não deu para gerar a planilha agora.'); return; }
    const nome = /filename="([^"]+)"/.exec(resp.headers.get('Content-Disposition') ?? '')?.[1] ?? 'trajetos.csv';
    const url = URL.createObjectURL(await resp.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: nome });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  if (erro && !r) return <div className="aviso-erro">{erro}</div>;
  if (!r || !hist) return <div className="carregando" style={{ minHeight: 300 }}><div className="giro" /></div>;
  const ativos = r.acessos.filter((a) => !a.revogadoEm && new Date(a.expiraEm) > new Date());
  const ultima = r.ultimaPosicaoEm ? haQuanto(r.ultimaPosicaoEm) : 'nenhuma ainda';
  const credenciadas = d.escolas.filter((e) => d.van!.credenciamento[e.id] === 'credenciada').length;

  const itens: { ok: boolean; t: string; d: string }[] = [
    { ok: true, t: 'Localização em tempo real durante o trajeto', d: `GPS do celular do motorista, enviado a cada 3 segundos. Última posição recebida: ${ultima}.` },
    { ok: true, t: 'Acesso dos pais e responsáveis', d: 'No app da família: a van aparece quando o filho é o próximo e durante todo o tempo em que ele está a bordo, até chegar.' },
    { ok: credenciadas > 0, t: 'Acesso da escola, conforme o contrato', d: credenciadas ? `${credenciadas} escola(s) credenciada(s) acompanham as vans chegando na portaria.` : 'Opcional: quando a escola entrar com o código dela, ela acompanha as chegadas.' },
    { ok: ativos.length > 0, t: 'Acesso do poder público', d: ativos.length ? `${ativos.length} link(s) de fiscalização ativo(s).` : 'Crie um link quando a prefeitura, o DETRAN ou a escola pedirem. Ele mostra a van e o histórico, sem dados das crianças.' },
    { ok: true, t: `Registro dos trajetos por ${r.diasHistorico} dias`, d: `${r.viagens} trajeto(s) nos últimos ${r.diasHistorico} dias, com horário de cada posição. O VanAaki guarda por ${r.diasGuarda} dias.` },
    { ok: true, t: 'Funcionamento contínuo', d: 'Se a internet cair no caminho, o celular guarda as posições e envia tudo quando a conexão volta.' },
    { ok: true, t: 'Relatórios para a fiscalização', d: 'Planilha com todas as posições (abre no Excel) e página pronta para imprimir ou salvar em PDF.' },
    { ok: true, t: 'Privacidade das crianças (LGPD)', d: 'Nenhuma família vê o endereço de outra. O poder público vê a van e os trajetos, nunca nome ou endereço de aluno.' },
  ];

  return (
    <>
      <section className="selo-pl">
        <span className="escudo"><I n="escudo" /></span>
        <div>
          <span className="faixa">PL 1240/2026</span>
          <h2 style={{ marginTop: 10 }}>Sua van já está pronta para o GPS obrigatório</h2>
          <p>O projeto de lei, em análise na Câmara, exige rastreamento em tempo real com acesso para pais, escola e poder público, e o registro dos trajetos por pelo menos 90 dias. Tudo isso já funciona aqui, sem aparelho extra: só o celular.</p>
        </div>
        <div className="linha nao-imprimir">
          <button className="btn btn-primario" onClick={() => void baixar()}><I n="baixar" />Planilha dos trajetos</button>
          {ativos[0] && <a className="btn btn-claro" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.2)' }} href={linkFiscal(ativos[0].token)} target="_blank" rel="noreferrer"><I n="externo" />Ver como fiscal</a>}
        </div>
      </section>
      {erro && <div className="aviso-erro">{erro}</div>}

      <section className="kpis">
        <Kpi ic="historico" rot={`Trajetos · ${r.diasHistorico} dias`} num={r.viagens} sub={r.primeiraViagem ? `desde ${r.primeiraViagem.split('-').reverse().join('/')}` : 'nenhum ainda'} />
        <Kpi ic="pin" rot="Posições gravadas" num={r.pontos.toLocaleString('pt-BR')} sub="com data e hora" />
        <Kpi ic="rota" rot="Distância registrada" num={`${Math.round(r.km).toLocaleString('pt-BR')} km`} sub={`${r.viagensComGps} trajeto(s) por GPS`} />
        <Kpi ic="satelite" rot="Última posição" num={r.ultimaPosicaoEm ? new Date(r.ultimaPosicaoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'} sub={ultima} />
      </section>

      <div className="grade-painel">
        <section className="card">
          <div className="card-topo"><h3>O que o PL 1240/2026 pede</h3><span className="tag tag-verde"><I n="check" />{itens.filter((x) => x.ok).length} de {itens.length} em dia</span></div>
          <ul className="checklist">
            {itens.map((x) => (
              <li key={x.t}>
                <span className={`marca ${x.ok ? '' : 'aviso'}`}><I n={x.ok ? 'check' : 'alerta'} /></span>
                <div><strong>{x.t}</strong><span className="muted">{x.d}</span></div>
              </li>
            ))}
          </ul>
          <p className="muted small" style={{ marginTop: 12 }}>O PL ainda pode mudar antes de virar lei e depende de regulamentação. Se aprovado, as vans em operação teriam 180 dias para se adequar.</p>
        </section>
        <Acessos acessos={r.acessos} onMudou={recarregar} />
      </div>

      <section className="card">
        <div className="card-topo">
          <div><h3>Histórico dos trajetos</h3><span className="muted small">Últimos {r.diasHistorico} dias · toque num trajeto para ver o caminho registrado</span></div>
          <div className="linha nao-imprimir">
            <button className="btn btn-claro btn-sm" onClick={() => window.print()}><I n="imprimir" />Imprimir</button>
            <button className="btn btn-claro btn-sm" onClick={() => void baixar()}><I n="baixar" />CSV</button>
          </div>
        </div>
        <div className="historico-grade">
          <div className="historico-rolagem"><HistoricoLista lista={hist} sel={sel} onSel={setSel} /></div>
          {sel && <MapaTrajeto v={v} pts={pts} altura={420} />}
        </div>
      </section>
    </>
  );
}

/** Links somente leitura para o poder público (criar, copiar, cancelar). */
function Acessos({ acessos, onMudou }: { acessos: AcessoFiscal[]; onMudou: () => void }) {
  const [nome, setNome] = useState('');
  const [dias, setDias] = useState(30);
  const [novo, setNovo] = useState<AcessoFiscal | null>(null);
  const [copiado, setCopiado] = useState('');
  const [erro, setErro] = useState('');
  const criar = async () => {
    setErro('');
    try { const a = await post<AcessoFiscal>('/conformidade/acessos', { nome, dias }); setNovo(a); setNome(''); onMudou(); } catch (e) { setErro((e as Error).message); }
  };
  const copiar = (t: string) => { void navigator.clipboard?.writeText(linkFiscal(t)); setCopiado(t); setTimeout(() => setCopiado(''), 1800); };
  const validos = acessos.filter((a) => !a.revogadoEm && new Date(a.expiraEm) > new Date());
  return (
    <section className="card pilha" style={{ gap: 14 }}>
      <div>
        <h3>Acesso para fiscalização</h3>
        <p className="muted small" style={{ marginTop: 4 }}>Um link somente leitura para a prefeitura, o DETRAN ou a escola contratante: mostra a van ao vivo e o histórico dos trajetos. Você cancela quando quiser.</p>
      </div>
      <div className="form">
        <label className="fld"><span>Para quem</span><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Prefeitura de São Paulo · DTP" /></label>
        <div className="linha" style={{ flexWrap: 'nowrap' }}>
          <select className="inp" style={{ width: 'auto' }} value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            {[7, 30, 90, 180, 365].map((n) => <option key={n} value={n}>Vale {n} dias</option>)}
          </select>
          <button className="btn btn-escuro" style={{ flex: 1 }} disabled={!nome.trim()} onClick={() => void criar()}><I n="link" />Criar link</button>
        </div>
        {erro && <div className="aviso-erro">{erro}</div>}
        {novo && (
          <div className="aviso-ok" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <span>Link criado para <b>{novo.nome}</b>. Envie para quem pediu:</span>
            <div className="link-copiar"><span>{linkFiscal(novo.token)}</span><button className="btn btn-claro btn-sm" onClick={() => copiar(novo.token)}><I n={copiado === novo.token ? 'check' : 'copiar'} />{copiado === novo.token ? 'Copiado' : 'Copiar'}</button></div>
          </div>
        )}
      </div>
      <div>
        {acessos.map((a) => {
          const ativo = !a.revogadoEm && new Date(a.expiraEm) > new Date();
          return (
            <div key={a.token} className="acesso-item">
              <div style={{ minWidth: 0 }}>
                <strong className="ic-txt"><I n="governo" tam={16} />{a.nome}</strong>
                <span className="muted small" style={{ display: 'block' }}>
                  {ativo ? `Vale até ${dataCurta(a.expiraEm)}` : a.revogadoEm ? `Cancelado em ${dataCurta(a.revogadoEm)}` : 'Expirado'} · {a.acessos} visita(s){a.ultimoAcessoEm ? ` · última ${haQuanto(a.ultimoAcessoEm)}` : ''}
                </span>
              </div>
              {ativo ? (
                <div className="linha" style={{ gap: 6 }}>
                  <button className="btn btn-claro btn-sm btn-ic" title="Copiar link" aria-label="Copiar link" onClick={() => copiar(a.token)}><I n={copiado === a.token ? 'check' : 'copiar'} /></button>
                  <button className="btn btn-claro btn-sm btn-ic" title="Cancelar acesso" aria-label="Cancelar acesso" onClick={async () => { if (confirm(`Cancelar o acesso de ${a.nome}? O link para de funcionar na hora.`)) { await api(`/conformidade/acessos/${a.token}`, { metodo: 'DELETE' }); onMudou(); } }}><I n="lixo" /></button>
                </div>
              ) : <span className="tag">inativo</span>}
            </div>
          );
        })}
        {!validos.length && !acessos.length && <span className="muted small">Nenhum link criado ainda.</span>}
      </div>
    </section>
  );
}
