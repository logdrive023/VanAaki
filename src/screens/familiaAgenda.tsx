import { useLiveQuery } from 'dexie-react-hooks';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { I } from '../components/Icone';
import { EscolhaPlano } from '../components/presenca';
import { Modal } from '../components/ui';
import { db } from '../db/db';
import type { Aluno, Escola, Pagamento, Van } from '../db/types';
import { pixCopiaECola, temPix } from '../lib/pix';
import { NOME_TURNO, nomePlano, planoDe, type Plano } from '../lib/turnos';
import { hoje, nomeMes, primeiroNome, reais } from '../lib/util';
import { definirPresenca, pagar } from '../services/acoes';

const diasUteis = (n = 10) => {
  const l: string[] = []; const d = new Date();
  while (l.length < n) {
    if (d.getDay() !== 0 && d.getDay() !== 6) l.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    d.setDate(d.getDate() + 1);
  }
  return l;
};
const diaLongo = (data: string) => { const s = new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); return s[0].toUpperCase() + s.slice(1); };

/**
 * Agenda da família (e do aluno, só leitura): os próximos dias do filho na van.
 * Um toque no dia muda o combinado — o tio vê na agenda dele na hora.
 */
export function AgendaFamilia({ aluno, escola, podeMudar = true }: { aluno: Aluno; escola?: Escola; podeMudar?: boolean }) {
  const dias = useMemo(() => diasUteis(), []);
  const pres = useLiveQuery(() => db.presencas.where('alunoId').equals(aluno.id).toArray(), [aluno.id]) ?? [];
  const [aberto, setAberto] = useState<string | null>(null);
  const h = escola?.horarios[aluno.turno];
  const nome = podeMudar ? primeiroNome(aluno.nome) : 'Você';
  return (
    <>
      <div className="privacidade"><span className="ic"><I n="calendario" /></span><span>{podeMudar
        ? <>Vai faltar, levar ou buscar em algum dia? Marque aqui com antecedência: <b>o tio já vê na agenda dele</b> e a rota daquele dia se ajusta sozinha.</>
        : <>Os próximos dias na van. Quem muda são os seus pais.</>}</span></div>
      <div className="semana">
        {dias.map((dia) => {
          const p = pres.find((x) => x.data === dia);
          const pl = planoDe(p);
          const info = nomePlano(pl);
          const d = new Date(`${dia}T12:00:00`);
          return (
            <button key={dia} type="button" className={`semana-dia ${pl !== 'ambos' ? 'diferente' : ''} ${dia === hoje() ? 'hoje' : ''}`} onClick={() => podeMudar && setAberto(dia)} disabled={!podeMudar}>
              <span className="sd-data"><small>{dia === hoje() ? 'hoje' : d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</small><strong>{d.getDate()}</strong></span>
              <span className="sd-info">
                <strong>{dia === hoje() ? info.nome : info.nome.replace(' hoje', '')}</strong>
                <small>{p?.motivo ? p.motivo : pl === 'ambos' ? `${NOME_TURNO[aluno.turno]} · ${h ? `entra ${h.entrada} · sai ${h.saida}` : ''}` : info.desc}</small>
              </span>
              {podeMudar && <I n="chevron" />}
            </button>
          );
        })}
      </div>
      {aberto && <MudarDia aluno={aluno} dia={aberto} atual={planoDe(pres.find((x) => x.data === aberto))} motivoAtual={pres.find((x) => x.data === aberto)?.motivo ?? ''} nome={nome} onFechar={() => setAberto(null)} />}
    </>
  );
}

export function MudarDia({ aluno, dia, atual, motivoAtual, nome, onFechar }: { aluno: Aluno; dia: string; atual: Plano; motivoAtual: string; nome: string; onFechar: () => void }) {
  const [plano, setPlano] = useState<Plano>(atual);
  const [motivo, setMotivo] = useState(motivoAtual);
  const [erro, setErro] = useState('');
  const salvar = async () => {
    try { await definirPresenca(aluno.id, plano, motivo.trim() || undefined, 'pais', dia === hoje() ? undefined : dia); onFechar(); } catch (e) { setErro((e as Error).message); }
  };
  return (
    <Modal titulo={diaLongo(dia)} onFechar={onFechar}>
      <div className="pilha" style={{ gap: 12 }}>
        <span className="muted small">Como {nome} vai neste dia?</span>
        <EscolhaPlano valor={plano} onChange={setPlano} />
        <input className="inp" placeholder="Motivo (opcional): consulta, passeio, viagem…" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        {erro && <div className="aviso-erro">{erro}</div>}
        <button className="btn btn-primario btn-bloco btn-grande" onClick={() => void salvar()}>Salvar e avisar o tio</button>
      </div>
    </Modal>
  );
}

/** Pagar a mensalidade pelo Pix do tio (QR Code + copia e cola, com o valor). Depois a família toca em "Já paguei". */
export function PagarPix({ p, aluno, van, onFechar }: { p: Pagamento; aluno: Aluno; van?: Van; onFechar: () => void }) {
  const cfg = van?.config;
  const codigo = temPix(cfg) ? pixCopiaECola(cfg!, p.valor, `${primeiroNome(aluno.nome)}${nomeMes(p.mes).slice(0, 3)}`) : '';
  const [qr, setQr] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { if (codigo) void QRCode.toDataURL(codigo, { margin: 1, width: 360, color: { dark: '#111318', light: '#ffffff' } }).then(setQr); }, [codigo]);
  const informar = async () => { setEnviando(true); try { await pagar(p.id, 'pix', 'pais'); onFechar(); } finally { setEnviando(false); } };
  return (
    <Modal titulo={`Mensalidade de ${nomeMes(p.mes).toLowerCase()}`} onFechar={onFechar}>
      <div className="pilha" style={{ gap: 14 }}>
        <div style={{ textAlign: 'center' }}>
          <div className="big">{reais(p.valor)}</div>
          <span className="muted small">vence {p.vencimento.split('-').reverse().join('/')} · para {cfg?.pixNome || van?.motorista}</span>
        </div>
        {codigo ? (
          <>
            {qr ? <img src={qr} alt="QR Code do Pix" width={200} height={200} style={{ margin: '0 auto', borderRadius: 12, border: '1px solid var(--borda)' }} /> : <div className="giro" style={{ margin: '0 auto' }} />}
            <button className="btn btn-escuro btn-bloco btn-grande" onClick={() => { void navigator.clipboard?.writeText(codigo); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }}>
              <I n={copiado ? 'check' : 'copiar'} />{copiado ? 'Código copiado' : 'Copiar Pix copia e cola'}
            </button>
            <span className="muted small" style={{ textAlign: 'center' }}>Abra o app do seu banco, escolha Pix copia e cola e cole o código. O valor já vem preenchido.</span>
            <hr className="sep" />
            <button className="btn btn-primario btn-bloco" disabled={enviando} onClick={() => void informar()}><I n="check" />Já paguei, avisar o tio</button>
          </>
        ) : (
          <>
            <div className="privacidade"><span className="ic"><I n="alerta" /></span><span>O tio ainda não cadastrou a chave Pix no app. Combine o pagamento com ele pela conversa.</span></div>
            <button className="btn btn-claro btn-bloco" disabled={enviando} onClick={() => void informar()}><I n="check" />Já paguei, avisar o tio</button>
          </>
        )}
      </div>
    </Modal>
  );
}
