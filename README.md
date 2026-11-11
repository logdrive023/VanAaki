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
   embarque, chegada na escola e a portaria confirmando a entrada.
4. Nos pais, toque em **Não vai**: a rota do tio é reotimizada na hora.
5. No aluno, toque em **Tô no portão!** antes da van chegar: vale +10 pontos.
6. 🧪 Teste → **Restaurar dados de exemplo** volta tudo ao início.

## Regras principais

**Privacidade (combinado com o time):** a família não vê onde a van está enquanto o tio busca outras crianças
e não sabe quem são nem onde moram. Vê só o próprio filho, quantas paradas faltam, a previsão e o destino final.
O mapa abre quando a próxima parada é a casa dela, ou quando o filho já está a bordo no trecho final até a escola.
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
