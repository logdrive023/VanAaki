import { useState } from 'react';
import { api, post, sair } from '../api/cliente';
import { db } from '../db/db';
import type { Eu, Perfil } from '../db/types';
import { dataPolitica, EMPRESA, VERSAO_POLITICA } from '../lib/empresa';
import { I, Marca } from './Icone';
import { Modal } from './ui';

/** Falta o aceite desta versão da política? (o aluno não aceita: quem consente é o responsável — LGPD art. 14) */
export const precisaConsentir = (perfil: Perfil, eu: Eu) => perfil !== 'aluno' && eu.consentimento?.versao !== VERSAO_POLITICA;

const PONTOS: Record<Exclude<Perfil, 'aluno'>, string[]> = {
  pais: [
    'Usamos os dados do seu filho só para o transporte: rota, avisos de chegada e a conversa com o motorista.',
    'O mapa abre só na sua vez. Ninguém vê a casa das outras crianças, e você não vê a delas.',
    'Não vendemos dados. Você pode baixar ou apagar tudo pelo app quando quiser.',
  ],
  motorista: [
    'Você cuida dos dados das famílias: use só para o transporte e mantenha seus documentos em dia.',
    'A localização da van é guardada só durante as rotas, por 400 dias, para prestar contas.',
    'O Pix vai direto para você. O app não cobra taxa sobre a mensalidade.',
  ],
  escola: [
    'A escola vê os alunos que recebe, a van de cada um e os documentos das vans.',
    'Endereço, telefone e mensalidade das famílias ficam de fora.',
    'Use os dados só para a segurança da entrada e da saída dos alunos.',
  ],
};

/** Tela de aceite: aparece no primeiro acesso e quando a política muda. Curta, clara e com o "porquê". */
export function TelaConsentimento({ perfil, eu }: { perfil: Exclude<Perfil, 'aluno'>; eu: Eu }) {
  const [li, setLi] = useState(false);
  const [responsavel, setResponsavel] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const pais = perfil === 'pais';
  const pode = li && (!pais || responsavel);
  const aceitar = async () => {
    setEnviando(true); setErro('');
    try {
      await post('/privacidade/consentimento', { versao: VERSAO_POLITICA });
      await db.config.put({ id: 'eu', valor: { ...eu, consentimento: { versao: VERSAO_POLITICA, aceitoEm: new Date().toISOString() } } });
    } catch (e) { setErro((e as Error).message); } finally { setEnviando(false); }
  };
  return (
    <div className="consentimento">
      <div className="cs-caixa">
        <Marca tam={40} />
        <h1>{eu.consentimento ? 'Atualizamos a nossa política' : 'Antes de começar'}</h1>
        <p className="cs-sub">Leva 30 segundos. É o que a lei pede para proteger {pais ? 'o seu filho' : 'as crianças'}.</p>
        <ul className="cs-pontos">{PONTOS[perfil].map((t) => <li key={t}><I n="check" />{t}</li>)}</ul>
        <p className="cs-links">Leia tudo: <a href="./app.html#/privacidade" target="_blank" rel="noreferrer">Política de Privacidade</a> e <a href="./app.html#/termos" target="_blank" rel="noreferrer">Termos de Uso</a> (versão de {dataPolitica()}).</p>
        <label className="cs-check"><input type="checkbox" checked={li} onChange={(e) => setLi(e.target.checked)} /><span>Li e concordo com a Política de Privacidade e os Termos de Uso.</span></label>
        {pais && (
          <label className="cs-check"><input type="checkbox" checked={responsavel} onChange={(e) => setResponsavel(e.target.checked)} />
            <span>Sou pai, mãe ou responsável e autorizo o uso dos dados do meu filho para o transporte escolar.</span></label>
        )}
        {erro && <div className="aviso-erro" role="alert">{erro}</div>}
        <button type="button" className="btn btn-primario btn-bloco btn-grande" disabled={!pode || enviando} onClick={() => void aceitar()}>
          {enviando ? <><I n="carregando" className="girando" />Um instante…</> : 'Concordar e continuar'}
        </button>
        <button type="button" className="btn btn-fantasma btn-bloco" onClick={() => sair(perfil)}>Agora não (sair)</button>
      </div>
    </div>
  );
}

/** Menu da conta → "Privacidade e meus dados": ver o aceite, baixar os dados e excluir a conta. */
export function MeusDados({ perfil, eu, onFechar }: { perfil: Perfil; eu: Eu; onFechar: () => void }) {
  const [ocupado, setOcupado] = useState<'' | 'baixar' | 'excluir'>('');
  const [erro, setErro] = useState('');
  const podeExcluir = perfil === 'pais' || perfil === 'aluno';
  const baixar = async () => {
    setOcupado('baixar'); setErro('');
    try {
      const dados = await api('/privacidade/meus-dados');
      const url = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `vanaaki-meus-dados-${new Date().toISOString().slice(0, 10)}.json` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { setErro((e as Error).message); } finally { setOcupado(''); }
  };
  const excluir = async () => {
    if (!confirm('Excluir a sua conta? Seus dados pessoais são apagados e você sai do app. Isso não pode ser desfeito.')) return;
    setOcupado('excluir'); setErro('');
    try { await api('/privacidade/conta', { metodo: 'DELETE' }); sair(perfil); } catch (e) { setErro((e as Error).message); setOcupado(''); }
  };
  const aceite = eu.consentimento;
  return (
    <Modal titulo="Privacidade e meus dados" onFechar={onFechar}>
      <div className="pilha" style={{ gap: 14 }}>
        <div className="md-aceite">
          <I n="escudo" />
          <span>{perfil === 'aluno' ? 'Quem autorizou o uso dos seus dados foi o seu responsável.'
            : aceite ? <>Você aceitou a política de {aceite.versao.split('-').reverse().join('/')} em {new Date(aceite.aceitoEm).toLocaleDateString('pt-BR')}.</>
            : 'Você ainda não aceitou a política.'}</span>
        </div>
        <p className="small"><a href="./app.html#/privacidade" target="_blank" rel="noreferrer">Política de Privacidade</a> · <a href="./app.html#/termos" target="_blank" rel="noreferrer">Termos de Uso</a></p>
        <button type="button" className="btn btn-claro btn-bloco" disabled={!!ocupado} onClick={() => void baixar()}>
          <I n={ocupado === 'baixar' ? 'carregando' : 'baixar'} className={ocupado === 'baixar' ? 'girando' : undefined} />Baixar meus dados
        </button>
        <span className="muted small">Um arquivo com tudo o que o app guarda sobre você e {perfil === 'pais' ? 'seu filho' : 'a sua conta'} (LGPD art. 18).</span>
        <hr className="sep" />
        {podeExcluir ? (
          <>
            <button type="button" className="btn btn-perigo btn-bloco" disabled={!!ocupado} onClick={() => void excluir()}><I n="lixo" />Excluir minha conta</button>
            <span className="muted small">O cadastro do aluno continua com o motorista enquanto ele fizer o transporte. Para apagar também, peça a ele.</span>
          </>
        ) : (
          <span className="muted small">Esta conta guarda dados de outras famílias, então a exclusão é feita pelo encarregado de dados{EMPRESA.encarregado.email ? <> (<a href={`mailto:${EMPRESA.encarregado.email}`}>{EMPRESA.encarregado.email}</a>)</> : ''}. Respondemos em até 15 dias.</span>
        )}
        {erro && <div className="aviso-erro" role="alert">{erro}</div>}
      </div>
    </Modal>
  );
}
