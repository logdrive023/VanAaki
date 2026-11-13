import { useState } from 'react';
import { Transicao } from '../../components/Transicao';
import { BuscaEndereco } from '../../components/formularios';
import { I } from '../../components/Icone';
import Mapa3D from '../../components/Mapa3D';
import { Modal } from '../../components/ui';
import { TURNOS, type Aluno, type Turno } from '../../db/types';
import { NOME_TURNO } from '../../lib/turnos';
import { agoraIso, centavos, CORES, primeiroNome, reais, uid } from '../../lib/util';
import { salvarAluno } from '../../services/acoes';
import { convite } from './convite';
import type { DadosVan } from './dados';

const PASSOS = ['Aluno', 'Endereço', 'Família', 'Pronto'];

/**
 * Cadastro do aluno em 4 passos curtos (uma pergunta por tela, como numa conversa):
 * quem é → onde a van busca → quem é a família → pronto + convite no WhatsApp.
 * Mensalidade e vencimento já vêm dos padrões do tio (dá para mudar no último passo).
 */
export function AssistenteAluno({ d, onFechar }: { d: DadosVan; onFechar: () => void }) {
  const van = d.van!;
  const escolas = d.escolas.filter((e) => van.escolaIds.includes(e.id));
  const periodosDa = (escolaId: string) => TURNOS.filter((t) => van.turnos.some((x) => x.turno === t && x.ativo && x.escolaIds.includes(escolaId)));
  const novoAluno = (): Aluno => {
    const escolaId = escolas.length === 1 ? escolas[0].id : '';
    const ps = escolaId ? periodosDa(escolaId) : [];
    return {
      id: uid(), vanId: van.id, escolaId, nome: '', apelido: '', cor: CORES[d.alunos.length % CORES.length], serie: '',
      turno: ps.length === 1 ? ps[0] : (ps[0] ?? 'manha'), responsavel: '', telefoneResp: '', endereco: '', local: { ...van.garagem },
      mensalidade: van.precoPadrao, diaVencimento: d.cfg.diaVencimento, ativo: true, criadoEm: agoraIso(), completo: true,
    };
  };
  const [a, setA] = useState<Aluno>(novoAluno);
  const [passo, setPasso] = useState(0);
  const [achouEndereco, setAchouEndereco] = useState(false);
  const [valor, setValor] = useState((van.precoPadrao / 100).toFixed(2).replace('.', ','));
  const [salvo, setSalvo] = useState<Aluno | null>(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const set = <K extends keyof Aluno>(k: K, v: Aluno[K]) => setA((x) => ({ ...x, [k]: v }));
  const nome = primeiroNome(a.nome.trim()) || 'o aluno';
  const periodos = a.escolaId ? periodosDa(a.escolaId) : [];

  const pode = [
    a.nome.trim().length > 1 && !!a.escolaId && periodos.includes(a.turno),
    a.endereco.trim().length > 3 && achouEndereco,
    a.responsavel.trim().length > 1,
  ];
  const salvar = async () => {
    const c = centavos(valor);
    if (c === null || c <= 0) return setErro('Mensalidade inválida.');
    setErro(''); setSalvando(true);
    try {
      const s = await salvarAluno({ ...a, nome: a.nome.trim(), apelido: a.nome.trim().split(' ')[0], responsavel: a.responsavel.trim(), mensalidade: c }, true);
      setSalvo(s); setPasso(3);
    } catch (e) { setErro((e as Error).message); }
    setSalvando(false);
  };
  const outro = () => { setA(novoAluno()); setAchouEndereco(false); setSalvo(null); setPasso(0); };

  if (!escolas.length) {
    return (
      <Modal titulo="Novo aluno" onFechar={onFechar}>
        <div className="assist-pronto"><span className="ap-ic" style={{ background: 'var(--amarelo)', color: 'var(--tinta)' }}><I n="escola" tam={28} /></span>
          <h4>Primeiro, a escola</h4><p className="muted">Adicione a escola em "Minhas escolas" (Configurações). Depois é só voltar aqui.</p></div>
      </Modal>
    );
  }

  return (
    <Modal titulo="Novo aluno" onFechar={onFechar}>
      <ol className="passos-assist">
        {PASSOS.map((t, i) => <li key={t} className={passo > i ? 'feito' : passo === i ? 'agora' : ''}><b>{passo > i ? <I n="check" tam={13} /> : i + 1}</b>{t}</li>)}
      </ol>

      <Transicao chave={passo} ordem={passo}>
      {passo === 0 && (
        <div className="pilha" style={{ gap: 14 }}>
          <h4 className="pergunta">Quem é o aluno?</h4>
          <label className="fld"><span>Nome completo</span><input value={a.nome} onChange={(e) => set('nome', e.target.value)} autoFocus placeholder="Ex.: Lucas Andrade" autoComplete="off" /></label>
          {escolas.length > 1 && (
            <div className="fld"><span>Escola</span>
              <div className="opcoes-lista">
                {escolas.map((e) => (
                  <button key={e.id} type="button" className={`opcao-grande ${a.escolaId === e.id ? 'marcada' : ''}`} onClick={() => { const ps = periodosDa(e.id); setA((x) => ({ ...x, escolaId: e.id, turno: ps.includes(x.turno) ? x.turno : ps[0] ?? x.turno })); }}>
                    <span className="og-ic"><I n="escola" /></span><span><strong>{e.nome}</strong><small>{periodosDa(e.id).map((t) => NOME_TURNO[t]).join(' · ')}</small></span>{a.escolaId === e.id && <I n="check" />}
                  </button>
                ))}
              </div>
            </div>
          )}
          {a.escolaId && periodos.length > 1 && (
            <div className="fld"><span>Período</span>
              <div className="escolha">{periodos.map((t: Turno) => <button key={t} type="button" className={a.turno === t ? 'ativo' : ''} onClick={() => set('turno', t)}>{NOME_TURNO[t]}</button>)}</div>
            </div>
          )}
          {escolas.length === 1 && <small className="muted">{escolas[0].nome} · {NOME_TURNO[a.turno]}</small>}
          <button className="btn btn-primario btn-bloco btn-grande" disabled={!pode[0]} onClick={() => setPasso(1)}>Continuar<I n="seguir" /></button>
        </div>
      )}

      {passo === 1 && (
        <div className="pilha" style={{ gap: 14 }}>
          <h4 className="pergunta">Onde a van busca <span className="destaque-amarelo">{nome}</span>?</h4>
          <div className="fld"><span>Endereço</span>
            <BuscaEndereco valor={a.endereco} onTexto={(t) => { set('endereco', t); setAchouEndereco(false); }} onLocal={(p) => { set('local', p); setAchouEndereco(true); }} />
          </div>
          {achouEndereco && (
            <>
              <Mapa3D altura={200} enquadrar={[a.local]} chave={`al-${a.local.lat.toFixed(5)}`} marcadores={[{ id: 'p', pos: a.local, tipo: 'casa', rotulo: nome }]} onClick={(p) => set('local', p)} />
              <small className="muted">É aqui? Se o portão for em outro ponto, toque no lugar certo do mapa.</small>
            </>
          )}
          <div className="linha" style={{ flexWrap: 'nowrap' }}>
            <button className="btn btn-claro btn-grande" onClick={() => setPasso(0)} aria-label="Voltar"><I n="voltar" /></button>
            <button className="btn btn-primario btn-bloco btn-grande" disabled={!pode[1]} onClick={() => setPasso(2)}>{achouEndereco ? 'É aqui, continuar' : 'Busque o endereço'}<I n="seguir" /></button>
          </div>
        </div>
      )}

      {passo === 2 && (
        <div className="pilha" style={{ gap: 14 }}>
          <h4 className="pergunta">Quem é a família de <span className="destaque-amarelo">{nome}</span>?</h4>
          <label className="fld"><span>Nome do pai ou da mãe</span><input value={a.responsavel} onChange={(e) => set('responsavel', e.target.value)} autoFocus /></label>
          <label className="fld"><span>WhatsApp (para mandar o convite)</span><input value={a.telefoneResp} onChange={(e) => set('telefoneResp', e.target.value)} inputMode="tel" placeholder="11 90000-0000" /></label>
          <details className="opcoes">
            <summary><I n="financeiro" />Mensalidade {reais(centavos(valor) ?? a.mensalidade)} · vence dia {a.diaVencimento}<I n="chevron" /></summary>
            <div className="dupla">
              <label className="fld"><span>Mensalidade (R$)</span><input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" /></label>
              <label className="fld"><span>Vence no dia</span><input type="number" min={1} max={28} value={a.diaVencimento} onChange={(e) => set('diaVencimento', Math.min(28, Math.max(1, Number(e.target.value) || 1)))} /></label>
            </div>
          </details>
          {erro && <div className="aviso-erro">{erro}</div>}
          <div className="linha" style={{ flexWrap: 'nowrap' }}>
            <button className="btn btn-claro btn-grande" onClick={() => setPasso(1)} aria-label="Voltar"><I n="voltar" /></button>
            <button className="btn btn-primario btn-bloco btn-grande" disabled={!pode[2] || salvando} onClick={() => void salvar()}>
              {salvando ? <><I n="carregando" className="girando" />Salvando…</> : <>Cadastrar {nome}<I n="check" /></>}
            </button>
          </div>
        </div>
      )}

      {passo === 3 && salvo && (
        <div className="assist-pronto">
          <span className="ap-ic"><I n="check" tam={30} /></span>
          <h4>{primeiroNome(salvo.nome)} está na van!</h4>
          <p className="muted">Agora convide a família: ela recebe os avisos e acompanha a van. O link já vai com o código.</p>
          {salvo.telefoneResp
            ? <a className="btn btn-verde btn-bloco btn-grande" href={convite(salvo, van.motorista)} target="_blank" rel="noreferrer"><I n="enviar" />Mandar convite no WhatsApp</a>
            : <div className="codigo-grande">{salvo.codigoFamilia}</div>}
          <div className="linha" style={{ width: '100%', flexWrap: 'nowrap' }}>
            <button className="btn btn-claro btn-bloco" onClick={outro}><I n="mais" />Outro aluno</button>
            <button className="btn btn-fantasma btn-bloco" onClick={onFechar}>Fechar</button>
          </div>
        </div>
      )}
      </Transicao>
    </Modal>
  );
}
