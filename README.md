# VanAaki

Van escolar com **gestão para o tio**, **rastreio seguro para os pais**, **gamificação para os alunos** e **portaria para a escola**.
Versão de validação: roda 100% no navegador (PWA), sem servidor. Os dados ficam no IndexedDB do aparelho.

## Rodar

```bash
npm install
npm run dev        # desenvolvimento → http://localhost:5173
npm run build      # gera dist/ (com Service Worker / PWA)
npm run preview    # serve o build → http://localhost:4173 (dá para instalar o app)
```

- `index.html`: landing page independente (só HTML + CSS + um script de filtro).
- `app.html`: o app PWA. Cada botão da landing abre um perfil: `#/motorista`, `#/pais`, `#/aluno`, `#/escola`.
- `prototipo/`: as telas originais em HTML + CSS (só visual).

### Como testar o fluxo completo

1. Abra o **motorista** numa aba e os **pais**, o **aluno** e a **escola** em outras (botão 🧪 Teste, no canto da tela).
2. No motorista: **Rota → Iniciar ida** (ligue o "modo demonstração" para embarcar sozinho).
3. Veja as outras abas atualizarem sozinhas: aviso de "é o próximo", mapa liberado na vez da família,
   embarque, chegada na escola e (no Colégio Santa Maria) a portaria confirmando a entrada.
4. Nos pais, toque em **Não vai**: a rota do tio é reotimizada na hora.
5. No aluno, toque em **Tô no portão!** antes da van chegar: vale +10 pontos.
6. 🧪 Teste → **Restaurar dados de exemplo** volta tudo ao início.

## Publicar (GitHub Pages)

O workflow `.github/workflows/deploy.yml` gera o build e publica a cada push na `main`.
Acompanhe em **Actions**. Quando ficar verde:

- Landing page: **https://logdrive023.github.io/VanAaki/**
- App: **https://logdrive023.github.io/VanAaki/app.html** (no celular: "Adicionar à tela inicial")

Cada pessoa que abre o link tem os próprios dados de exemplo, salvos só no navegador dela.

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
Sem internet, otimiza em linha reta (vizinho mais próximo + 2-opt). O GPS é simulado: uma única aba move a van
(Web Locks), e as outras acompanham pelo banco.

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
