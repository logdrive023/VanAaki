# VanAaki

Van escolar com **gestão para o tio**, **rastreio seguro para os pais**, **gamificação para os alunos** e **portaria para a escola**.

- **Frontend:** PWA em React + Vite (`index.html` landing, `app.html` app), mapa 3D MapLibre.
- **Backend:** API em Go (`backend/`), Postgres, login com JWT e tempo real por SSE.
- As regras (rota, privacidade, pontos, permissões) rodam no servidor. O app guarda uma cópia local (IndexedDB) só do que aquele perfil pode ver.

## Rodar local

```bash
# 1. banco (Postgres 16 na porta 5434)
cd backend && docker compose up -d banco

# 2. API → http://localhost:8090 (cria as tabelas e os dados de demonstração)
go run ./cmd/api

# 3. app → http://localhost:5173
cd .. && npm install && npm run dev
```

Ou tudo em Docker: `cd backend && docker compose --profile completo up -d --build`.

| Variável | Padrão | Para quê |
|---|---|---|
| `DATABASE_URL` | `postgres://vanaaki:vanaaki@localhost:5434/vanaaki` | banco |
| `PORT` | `8090` | porta da API |
| `JWT_SECRET` | (troque em produção) | assinatura do login |
| `CORS_ORIGINS` | `*` | domínios do app (ex.: `https://logdrive023.github.io`) |
| `DEMO` | `true` | cria a demonstração e libera "Entrar na demonstração" |
| `VITE_API_URL` (app) | mesmo host, porta 8090 | endereço da API no build do app |

### Contas

- **Motorista:** cria a conta com e-mail e senha (já cria a van). Cadastra as escolas e os turnos, depois os alunos.
- **Família:** entra em "Primeiro acesso" com o **código de convite** de cada aluno (o tio manda pelo WhatsApp com um toque).
- **Aluno:** entra só com o **código do aluno** (aparece no app dos pais).
- **Escola (opcional):** cria o acesso da portaria com o **código da escola** (o tio vê em "Turnos e escolas").
- **Demonstração:** botão "Entrar na demonstração" em cada perfil (contas `tio@`, `familia@` e `escola@demo.vanaaki.app`, senha `vanaaki123`; aluno `LUQUI1`).

### Testar o fluxo completo

1. Entre na demonstração como **motorista**; pelo botão 🧪 abra **família**, **aluno** e **escola** em outras abas.
2. Motorista: **Rota → Iniciar** com "🧪 Simulação" (a van anda sozinha pelo servidor) ou "📱 GPS do celular" (posição real).
3. As outras abas atualizam ao vivo (SSE): "é o próximo", mapa liberado só na vez da família, embarque, escola.
4. Família: **Não vai hoje** → a rota do tio é reotimizada na hora. Aluno: **Tô no portão!** vale +10.
5. 🧪 → **Recomeçar a demonstração** volta os dados ao início.

## API (resumo)

`backend/` segue o padrão em camadas por domínio: `internal/domains/<domínio>/{controller,service,entities,http}`,
com `compartilhado/{repositorio,regras,avisos,transmissao}`, `middleware`, `realtime` (SSE) e migrações em
`internal/database/migrations`.

| Rota | Quem |
|---|---|
| `POST /api/auth/entrar`, `/auth/aluno`, `/auth/cadastro/{motorista,familia,escola}`, `/auth/demo` | público |
| `GET /api/sync` (dados do perfil, filtrados) · `GET /api/eventos` (tempo real) | todos |
| `POST /api/viagens`, `/viagens/{id}/parada`, `/posicao`, `/encerrar` · `PATCH /viagens/{id}/config` | motorista |
| `PUT /api/van`, `/van/turnos`, `/van/rota-fixa` · `POST/PUT /api/alunos` · `POST /api/escolas` | motorista |
| `PUT /api/presencas` · `POST /api/mensagens` · `POST /api/pagamentos/{id}/pagar` | família e motorista |
| `POST /api/viagens/pronto`, `/api/resgates` | aluno e família |
| `PUT /api/escola/confirma-entrada`, `/escola/credenciar` · `POST /api/viagens/{id}/entrada` | escola |

## Publicar

- **App (GitHub Pages):** o workflow `.github/workflows/deploy.yml` publica a cada push na `main`. Defina a variável
  `VITE_API_URL` no repositório (Settings → Secrets and variables → Actions → Variables) com o endereço da API.
- **API:** qualquer servidor com Docker (VPS, Fly.io, Railway…): `backend/Dockerfile` + um Postgres. Use HTTPS
  (o GPS do celular e o app instalado exigem) e `CORS_ORIGINS` com o domínio do app.

## Regras principais

**Turnos e várias escolas:** o motorista escolhe os turnos em que trabalha (manhã, tarde, noite) e as escolas de cada um.
Cada escola tem horário de entrada e saída por turno. Na **ida** a van busca as casas (ordem otimizada) e deixa nas escolas
pela ordem da entrada; na **volta** busca nas escolas pela ordem da saída e entrega as casas. A escola vê o seu turno:
chegadas, saídas, quem confirmou entrada e a **previsão de atraso** (previsão de chegada × horário da escola).

**Ida e volta separadas:** o combinado do dia pode ser *ida e volta*, *só a volta* ("eu levo, o tio traz"),
*só a ida* ("o tio leva, eu busco") ou *não vai*. A família e o tio podem mudar; se a rota já está andando, ela é reotimizada.


**Horário das escolas:** a rota é planejada de trás para frente. Na ida, o app calcula a **hora limite para sair da garagem**
(entrada de cada escola − tempo até ela − 5 min de folga) e a chegada prevista em cada escola. Na volta, mostra a hora de estar
na 1ª escola, quanto tempo espera nas seguintes e a hora em que todos chegam em casa.

**Rota otimizada ou rota fixa:** por turno e trecho, o tio escolhe entre a ordem otimizada do dia ou a **rota fixa** dele
(ordena com ↑ ↓; fica salva até ele mudar, ex.: o semestre todo). Na rota fixa, quem não vai no dia é só pulado, sem reotimizar.
A parada atual abre no **Waze** ou no **Google Maps** do celular (link, sem API paga).

**Entrada na escola:** por padrão fica com o tio: o "Desceram N" já avisa os pais. A escola que quiser (ex.: particular com plano)
liga "Confirmar a entrada na portaria" e confirma aluno por aluno.

**Privacidade (combinado com o time):** a família não vê onde a van está enquanto o tio busca outras crianças
e não sabe quem são nem onde moram. Vê só o próprio filho, quantas paradas faltam, a previsão e o destino final.
O mapa abre quando o próximo destino da van é a casa dela ou a escola do filho.
O ranking usa apelidos. Regras em `src/lib/privacidade.ts`.

**Gamificação:** pontos automáticos (pronto no portão +10, embarque +3, avisar ausência +2, faltar sem avisar −5),
elogios e ocorrências do tio (ocorrência avisa os pais na hora), níveis, selos, missões semanais, sequência de dias,
ranking por semana/mês e loja de prêmios que o tio define e aprova. Regras em `src/lib/gamificacao.ts`.

**Rota:** a ordem das paradas é otimizada pelas ruas reais (serviço público OSRM, respeita mão única).
Sem internet, otimiza em linha reta (vizinho mais próximo + 2-opt). A posição vem do GPS do celular do tio (tela da rota aberta)
ou, na simulação, o servidor anda com a van pelas ruas.

## Mapa

MapLibre GL (npm `maplibre-gl`) com o estilo "liberty" do OpenFreeMap: prédios em 3D, sem chave de API.
Os azulejos do mapa e as rotas vêm da internet; as partes do mapa já vistas ficam guardadas pelo Service Worker.
Só são enviadas coordenadas (dos pontos de exemplo), nunca dados de pessoas.

## Estrutura

- `src/db`: banco Dexie (tabelas), tipos e dados de exemplo (mesmo padrão do projeto dia-dia).
- `src/lib`: geo (distâncias, otimização), rotas (OSRM), privacidade, gamificação, utilidades.
- `src/services`: viagem e simulação do GPS, pontos, presença, pagamentos, mensagens, notificações.
- `src/components`: mapa 3D, layouts (painel e celular), gamificação, notificações.
- `src/screens`: motorista, pais, aluno, escola.

Os dados de exemplo (nomes, telefones, endereços) são fictícios.

- `backend/`: API em Go (domínios, Postgres, SSE).
