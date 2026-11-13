import type { ReactNode } from 'react';
import { BotaoAcessibilidade } from '../components/Acessibilidade';
import { I, Marca } from '../components/Icone';
import { dataPolitica, EMPRESA } from '../lib/empresa';

/** Páginas públicas (sem login): #/privacidade e #/termos. Linguagem simples, para qualquer pessoa entender. */
export default function Legal({ qual }: { qual: 'privacidade' | 'termos' }) {
  return qual === 'privacidade' ? <Privacidade /> : <Termos />;
}

const falta = (v: string) => v || 'em definição';

function PaginaLegal({ titulo, resumo, children }: { titulo: string; resumo: string; children: ReactNode }) {
  return (
    <div className="legal">
      <header className="legal-topo">
        <a href="./index.html" className="lm-logo"><Marca tam={30} /><span>Van<b>Aaki</b></span></a>
        <span className="lm-acoes"><BotaoAcessibilidade rotulo /><button type="button" className="lm-voltar" onClick={() => (history.length > 1 ? history.back() : location.assign('./index.html'))}><I n="voltar" tam={16} /><span>Voltar</span></button></span>
      </header>
      <main className="legal-corpo" id="conteudo">
        <span className="faixa">Versão de {dataPolitica()}</span>
        <h1>{titulo}</h1>
        <p className="legal-resumo">{resumo}</p>
        {children}
        <nav className="legal-links">
          <a href="./app.html#/privacidade">Política de Privacidade</a> · <a href="./app.html#/termos">Termos de Uso</a> · <a href="./index.html">Site</a>
        </nav>
      </main>
    </div>
  );
}

function Secao({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return <section className="legal-secao"><h2><span>{n}</span>{titulo}</h2>{children}</section>;
}

function Contato() {
  return (
    <ul>
      <li><b>Empresa:</b> {EMPRESA.razaoSocial || EMPRESA.nome}{EMPRESA.cnpj && ` · CNPJ ${EMPRESA.cnpj}`}</li>
      <li><b>Endereço:</b> {falta(EMPRESA.endereco)}</li>
      <li><b>Encarregado de dados (LGPD):</b> {falta(EMPRESA.encarregado.nome)}{EMPRESA.encarregado.email && <> · <a href={`mailto:${EMPRESA.encarregado.email}`}>{EMPRESA.encarregado.email}</a></>}</li>
    </ul>
  );
}

function Privacidade() {
  return (
    <PaginaLegal titulo="Política de Privacidade" resumo="Usamos o mínimo de dados para o transporte funcionar com segurança. Não vendemos dados. Ninguém vê a casa das outras crianças. Você pode baixar ou apagar seus dados pelo próprio app.">
      <Secao n={1} titulo="Quem cuida dos seus dados">
        <p>O VanAaki é o aplicativo que liga o motorista do transporte escolar, as famílias e as escolas. Para falar sobre os seus dados:</p>
        <Contato />
      </Secao>
      <Secao n={2} titulo="Quais dados usamos">
        <ul>
          <li><b>Família:</b> nome, telefone, e-mail, endereço de embarque, nome, série, escola e turno da criança, os dias em que ela vai ou não de van, pagamentos e mensagens com o motorista.</li>
          <li><b>Cuidados de saúde (opcional):</b> alergias, remédios e um contato de emergência, só se a família quiser contar.</li>
          <li><b>Motorista:</b> nome, telefone, e-mail, placa e modelo da van, chave Pix, documentos (CNH, vistoria, seguro…) e a localização da van <b>durante a rota</b>.</li>
          <li><b>Aluno:</b> apelido e pontos do jogo (quando o motorista usa).</li>
          <li><b>Escola:</b> nome e endereço da escola e o nome de quem usa a portaria.</li>
        </ul>
      </Secao>
      <Secao n={3} titulo="Para que usamos">
        <ul>
          <li>Fazer o transporte funcionar: rota, avisos de chegada, embarques e entregas (execução do serviço contratado, LGPD art. 7º, V).</li>
          <li>Dados de crianças: só com o consentimento de um dos pais ou responsável, que é pedido no primeiro acesso (art. 14).</li>
          <li>Cuidados de saúde: só com o consentimento específico da família, para o motorista saber como agir (art. 11, I).</li>
          <li>Guardar o histórico dos trajetos para prestar contas à escola, às famílias e à fiscalização do transporte escolar.</li>
        </ul>
      </Secao>
      <Secao n={4} titulo="Crianças em primeiro lugar">
        <ul>
          <li>A localização da van só aparece para a família <b>na vez dela</b> e enquanto o filho está a bordo. Ninguém vê a casa das outras crianças.</li>
          <li>Os colegas de van veem só o apelido e os pontos, nunca o nome completo, o endereço ou os dados da família.</li>
          <li>A criança entra com um código dado aos pais: não precisa de e-mail nem de senha.</li>
        </ul>
      </Secao>
      <Secao n={5} titulo="Quem vê o quê">
        <ul>
          <li><b>Motorista:</b> os dados dos alunos da van dele.</li>
          <li><b>Família:</b> só os dados do próprio filho, a van na vez dela, e se os documentos da van estão em dia.</li>
          <li><b>Escola:</b> os alunos que recebe, a van de cada um e os documentos das vans. Sem endereço, telefone ou mensalidade.</li>
          <li><b>Serviços que o app usa:</b> hospedagem dos servidores, mapas (OpenStreetMap / OpenFreeMap), busca de endereço (Nominatim) e fontes de texto (Google Fonts). Se você ligar a tradução em Libras, o VLibras, do governo federal. Se algum desses serviços estiver fora do Brasil, a transferência segue a LGPD (art. 33).</li>
        </ul>
        <p>Não vendemos nem alugamos dados. Não usamos dados de crianças para propaganda.</p>
      </Secao>
      <Secao n={6} titulo="Por quanto tempo guardamos">
        <ul>
          <li>Localização dos trajetos: 400 dias. Depois é apagada sozinha.</li>
          <li>Dados da conta: enquanto a conta existir. Excluiu a conta, os dados pessoais dela são apagados, menos o que a lei manda guardar.</li>
          <li>No seu celular fica uma cópia para o app funcionar sem internet. Ela é apagada quando você sai da conta.</li>
        </ul>
      </Secao>
      <Secao n={7} titulo="Como protegemos">
        <ul>
          <li>Senhas guardadas com criptografia (bcrypt): ninguém da equipe consegue lê-las.</li>
          <li>Conexão criptografada (HTTPS) entre o app e o servidor.</li>
          <li>Cada perfil só acessa o que é dele, conferido no servidor a cada pedido.</li>
        </ul>
      </Secao>
      <Secao n={8} titulo="Seus direitos (LGPD art. 18)">
        <ul>
          <li><b>Ver e levar seus dados:</b> no app, menu da conta → <i>Privacidade e meus dados</i> → <i>Baixar meus dados</i>.</li>
          <li><b>Corrigir:</b> pelo próprio app ou pedindo ao motorista.</li>
          <li><b>Apagar a conta e retirar o consentimento:</b> no mesmo menu, <i>Excluir minha conta</i>.</li>
          <li><b>Reclamar:</b> fale com o encarregado acima. Se não resolver, com a ANPD (Autoridade Nacional de Proteção de Dados).</li>
        </ul>
      </Secao>
      <Secao n={9} titulo="Mudanças nesta política">
        <p>Se esta política mudar, o app mostra a versão nova e pede o seu aceite de novo antes de continuar.</p>
      </Secao>
    </PaginaLegal>
  );
}

function Termos() {
  return (
    <PaginaLegal titulo="Termos de Uso" resumo="O VanAaki é uma ferramenta. Quem faz o transporte é o motorista, que responde pelo serviço e pela documentação. O pagamento vai direto para ele, sem taxa do app.">
      <Secao n={1} titulo="O que é o VanAaki">
        <p>Um aplicativo para organizar o transporte escolar: rota, avisos às famílias, agenda, mensalidades e comunicação com a escola. O transporte em si é prestado pelo motorista ou pela empresa dele.</p>
      </Secao>
      <Secao n={2} titulo="Contas">
        <ul>
          <li>Cada pessoa cuida da própria senha. As famílias entram pelo convite do motorista; os alunos, pelo código que os pais recebem.</li>
          <li>O motorista é responsável por cadastrar dados corretos dos alunos e por manter os documentos da van em dia.</li>
        </ul>
      </Secao>
      <Secao n={3} titulo="Pagamentos">
        <p>A mensalidade é paga pelo Pix direto ao motorista. O VanAaki não recebe, não guarda e não cobra taxa sobre esse dinheiro. O botão "Já paguei" só avisa o motorista, que confirma o recebimento.</p>
      </Secao>
      <Secao n={4} titulo="Horários e GPS">
        <p>As previsões de chegada são estimativas feitas pelo movimento da van e pelo trânsito do momento. Podem variar. Em caso de urgência, ligue para o motorista.</p>
      </Secao>
      <Secao n={5} titulo="Uso correto">
        <ul>
          <li>Use o app só para o transporte das crianças. É proibido usá-lo para vigiar outras pessoas.</li>
          <li>Mensagens com respeito. O motorista e a escola podem relatar abusos.</li>
        </ul>
      </Secao>
      <Secao n={6} titulo="Funcionamento">
        <p>O app funciona mesmo sem internet e envia tudo quando o sinal volta. Ainda assim pode haver falhas de rede, de GPS ou do celular. A versão de demonstração usa dados de exemplo.</p>
      </Secao>
      <Secao n={7} titulo="Encerrar">
        <p>Você pode sair e excluir a sua conta quando quiser (veja a Política de Privacidade). Contas usadas para fraude ou abuso podem ser encerradas.</p>
      </Secao>
      <Secao n={8} titulo="Lei aplicável">
        <p>Valem as leis do Brasil, incluindo o Código de Defesa do Consumidor e a Lei Geral de Proteção de Dados. Fica eleito o foro do domicílio do consumidor.</p>
        <Contato />
      </Secao>
    </PaginaLegal>
  );
}
