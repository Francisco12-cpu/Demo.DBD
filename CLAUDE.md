# CLAUDE.md — orientação pra uma sessão nova do Claude Code

Este arquivo é lido automaticamente ao abrir o Claude Code neste repositório.
Ele existe pra uma sessão **nova**, sem nenhuma memória da conversa anterior,
conseguir continuar o trabalho com contexto completo — o usuário (Francisco)
pediu isso explicitamente porque pretende abrir sessões novas em vários
momentos e não quer ter que reexplicar o projeto inteiro toda vez.

**Leia isto primeiro, depois o `README.md`** (que tem o histórico completo,
funcionalidade por funcionalidade, com justificativa de cada decisão — é o
changelog vivo do projeto, bem mais longo que este arquivo). Este arquivo é
só a orientação rápida: o que é o projeto, como ele é organizado, os
padrões que **têm** que ser seguidos, e as pegadinhas já conhecidas.

## O que é o projeto

**Until Dawn** (nome escolhido pelo usuário — a mecânica interna continua
sendo referida como "Assassino vs Sobreviventes", jogo assimétrico
competitivo estilo Dead by Daylight simplificado), rodando 100% no
navegador (HTML/CSS/JS puro, sem build step, sem framework). 1 jogador é o
Assassino, até 4 são Sobreviventes tentando reparar geradores e escapar.
Feito pra jogar com celular, incluindo com amigos pela mesma rede Wi-Fi
(LAN) ou por P2P sem precisar de servidor dedicado. Autor: Francisco Audir
(@filho.af).

Repositório: `Francisco12-cpu/Demo.DBD`. Branch de trabalho principal desta
fase: `claude/dbd-simple-analysis-roadmap-7n3psv` (verificar com `git branch`
se ainda é a atual — o usuário pode ter pedido pra trabalhar numa branch
nova depois). Deploy automático pro GitHub Pages a cada push na `main` via
`.github/workflows/deploy-pages.yml`.

## Como rodar/testar localmente

```
npx http-server . -p 8941          # serve o jogo estático
cd server && npm install && PORT=8792 ROOM_PASSWORD=test123 npm start   # servidor LAN, pra testar modo online
```

Testes são feitos com **Playwright direto via script `.mjs`** (não existe
suite de testes formal no repo) — ver padrão abaixo. Não existe `npm test`.

```js
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
```

Padrão pra testar rápido: usar `page.evaluate(() => { Game.CONFIG.x.y = valor; })`
**antes** de clicar em "Jogar" pra encurtar timers longos (geradores de 35s,
duração de gancho de 6s, etc.) — NUNCA editar `js/config.js` só pra testar.
Pra testar 2 jogadores, abrir 2 `browser.newContext()` apontando pro mesmo
servidor LAN. **Cuidado**: rodar vários testes online em sequência rápida
reusando os mesmos nomes ("Killer1"/"Surv1") às vezes dá timeout de conexão
por causa de sala presa no servidor de teste — se um teste isolado passa mas
falhava numa bateria, é isso, não é bug de código.

## Convenções que este projeto segue à risca

- **`Game.CONFIG` é a única fonte de números** (`js/config.js`) — nunca
  hardcode um valor de balanceamento/timer/raio direto no código. Todo
  número novo ganha um comentário explicando a unidade e o porquê.
- **Uma fábrica, N instâncias** — `Game.createX(...)` retorna
  `{ state, ...funções }`, nunca classes. Ver `js/door.js`, `js/gate.js`,
  `js/health.js`, `js/hideout.js`, `js/capture.js`, `js/pallet.js` como
  modelo (`js/window.js` é a exceção mínima — sem `state` de verdade, só
  `{rect, center}`, porque janela não tem nenhum estado que muda). `state`
  é sempre um objeto plano exposto direto (não encapsulado), porque o modo
  online precisa inspecionar/espelhar estado de outros clientes.
- **Multiplayer é client-authoritative por evento discreto**, não
  replicação de física a cada frame. Cada cliente decide o desfecho do que
  acontece com o **seu próprio** personagem (vida, captura, objetivo) e
  manda um evento pequeno (`net.sendEvent({kind:'...', ...})`) quando algo
  muda de estado — nunca manda a barra de progresso inteira a cada frame.
  Posição é a única coisa sincronizada continuamente (`net.sendState`, a
  cada ~70ms). Ver o sistema de gancho (`js/capture.js` + os handlers
  `captureStart`/`downed`/`pickedUp`/`hooked`/`rescued`/`droppedFree`/
  `struggleResult` em `js/main.js`) como o exemplo mais complexo disso.
- **LAN (`server/server.js`) e P2P (`js/net-webrtc.js`) implementam o
  mesmo protocolo de mensagens** — `js/main.js`/`js/menu.js` não sabem qual
  dos dois está em uso. Mexer no protocolo exige mexer nos dois.
- **Sem assets baixados da internet** — sprites são arte pixel autoral do
  Francisco (`assets/killer-sheet.png`, `assets/survivor-sheet.png`,
  spritesheets 32px/quadro, uso livre), renderizados via `background-image`+
  `background-position` calculado por `js/character.js` a partir de
  `Game.CONFIG.sprites` (metadados `row`/`frames`/`fps`/`loop` por
  animação — nunca hardcoded fora do config). Cor dos 4 Sobreviventes:
  `filter: hue-rotate()` (`Game.CONFIG.survivorHues`), já que a arte é
  colorida e não uma silhueta tingível como antes. Áudio é 100%
  sintetizado via Web Audio API (`js/audio.js`, osciladores, zero arquivo de
  som). Ícones do PWA (`assets/icon-*.png`) idem (gerados por script).
- **Testar antes de considerar pronto** — qualquer mudança em mecânica de
  jogo é testada via Playwright (solo E online, quando aplicável) antes de
  reportar como concluída. Ver `README.md` → cada item `[x]` do checklist
  foi testado dessa forma.

## Pegadinha de git recorrente: squash-merge trava o push

Esse repositório sempre squash-merga PRs. Isso quebra o fluxo comum de
"continuar commitando na mesma branch local depois de mergear":

```
error: failed to push ... (non-fast-forward)
```

Por quê: o squash-merge cria um commit **novo** no `main` com o conteúdo
idêntico mas hash diferente do commit local. Continuar commitando em cima do
commit local antigo diverge da história do `main`, mesmo com o conteúdo
igual. **Correção** (fazer isso sempre que acontecer, não é hack):

```bash
git fetch origin main
git rev-parse HEAD^{tree}          # comparar
git rev-parse origin/main^{tree}   # se forem iguais, é exatamente esse caso
git reset --mixed origin/main      # mantém o diff do working tree, realinha o histórico
# reaplicar/commitar só o que ainda não foi mergeado
git push --force-with-lease origin <branch>
```

Se a branch já tinha commits que NÃO foram mergeados ainda, não descartar —
só a parte já mergeada precisa desse tratamento.

## Estado atual (resumo — ver README.md pra lista completa)

**Atualizado em 2026-08-15** — esta seção estava defasada em ~11 PRs
mergeados (#24 a #35); se você é uma sessão nova lendo isto, o resumo
abaixo já reflete o código real (confirmado lendo os arquivos, não só
commits).

O loop completo já está pronto e testado há tempos: movimento (touch/
teclado/gamepad), mapa com salas reais + colisão AABB, portas trancáveis/
arrombáveis, esconderijo com limite de tempo e barulho, objetivos/geradores
com skill check progressivo, **captura em 3 fases** (derrubado → carregado
→ pendurado, resgate por aliado), portão de saída, iluminação por
raycasting, áudio 3D sintetizado, câmera seguindo o jogador, sprites de
pixel art autorais (Assassino/Sobrevivente), **pallets e janelas** (loops
de perseguição de verdade), sistema de ruído com raio de audição real,
multiplayer LAN + P2P com reconexão, modo solo dos dois lados, menu
responsivo, PWA instalável. Nome do jogo decidido: **"Until Dawn"** (já
propagado em todos os arquivos relevantes).

Desde a última vez que este arquivo foi escrito, também entraram: **IA
Sobrevivente (modo solo-como-Assassino) agora derruba pallet sozinha ao
fugir** (`js/main.js`, mesmo caminho de código do jogador humano — a
limitação antiga não existe mais), **modo fantasma/espectador**
(`spectatorFollowEntry()` em `js/main.js` — ao ser eliminado/escapar, a
câmera passa a seguir outro Sobrevivente vivo ou o Assassino em vez de
travar a tela; cobre o item que estava em "Planos futuros"), **host pode
kickar jogador antes da partida começar** (`server.js`, `net-webrtc.js`,
`menu.js` — mas só kick; host ainda não pode *trocar* o papel de outro
jogador, isso continua pendente), **reconexão automática ao cair a rede
no modo online**, **animação `hit` (r7) do Sobrevivente já em uso de
verdade** (`character.js` → `playHit()`, não é mais só o filtro CSS
`hit-flash`), vibração (`navigator.vibrate`) em golpe/skill check
errado/gancho, vinheta de perigo com borda pulsante (acessibilidade),
JSDoc typedefs pro `state` das fábricas, câmera/iluminação extraídas pra
`js/lighting.js`, os 3 `kind` de evento duplicados entre `server.js` e
`net-webrtc.js` centralizados, CI rodando os smoke tests Playwright em
todo PR, correção da trava permanente no modo de reparo engajado.

**Bug do joystick preso no celular**: corrigido (2ª tentativa, trocado
Touch Events por Pointer Events + `setPointerCapture`/`lostpointercapture`
em `js/input.js`) e testado via toque sintético — se o usuário reportar
recorrência num aparelho real, é o próximo lugar a olhar, mas trate como
resolvido até haver relato em contrário.

**Ainda em aberto sobre os sprites** (perguntar ao usuário antes de decidir
sozinho — são só ganho estético, não bloqueiam nada): pose de "parado"
dedicada do Sobrevivente (hoje reaproveita o quadro 0 do `run`); linha r8
do Sobrevivente ("teste", propósito não esclarecido); r2 do Sobrevivente
(mini-animação de transição ao parar, "seria legal" mas não pedida
formalmente); `vanish`/`fall` do Assassino (r6/r7) reservados no config,
sem sistema de jogo que os use.

**Pendente/backlog real** (auditado item a item em 2026-08-15 — ver
`README.md` → "Planos futuros" pro texto original de cada um):
- Estado "pronto" no lobby antes de iniciar partida — não existe ainda.
- Host trocar/forçar o papel (Assassino/Sobrevivente) de outro jogador —
  só o kick existe hoje.
- Sobrevivente escolher 2 habilidades em vez de 1 — ainda é só 1 das 4.
- Habilidades novas do Assassino: Armadilha (dispara por proximidade) e
  Invisibilidade (oposto da Camuflagem) — nenhuma das duas existe; decisão
  de design já proposta antes (escolher 1 de 2 no lobby, mesmo padrão do
  Sobrevivente) mas não implementada.
- 2º estágio de gancho antes da morte definitiva — continua só 1 estágio,
  **simplificação consciente**, não necessariamente um bug a corrigir.
- Mapa em pixel art de verdade (hoje é `div`/CSS gerado a partir de
  retângulos, só os personagens têm arte autoral) e sistema de tileset
  customizável (upload do próprio sprite) — ambos de escopo grande,
  ficam pra depois dos itens acima.
- Failover de host de verdade no P2P — descartado por complexidade e por
  ser impossível de testar de ponta a ponta neste ambiente (sem saída de
  rede pro broker WebRTC).
- Modo "2 Assassinos" e multiplayer local (mesmo teclado/tela) — **fora de
  escopo por pedido direto do usuário**, não é falta de tempo, não
  reconsiderar sem perguntar de novo.

**Ideias já discutidas mas propositalmente NÃO implementadas** (usuário
pediu só análise escrita, não construir): editor visual de partículas/som/
mapa, executável de PC (Electron/Tauri — PWA já cobre a maior parte do
caso de uso), comparação de features com o jogo original. Se o usuário
mencionar de novo, ele provavelmente já viu a análise anterior — perguntar
se é pra continuar analisando ou já implementar algo específico.

## Onde cada coisa mora

```
index.html          esqueleto da página, ordem de <script defer> importa (ver o próprio arquivo)
manifest.json, sw.js PWA
css/style.css        tudo o visual, incluindo animações
js/config.js          NÚMEROS. Sempre aqui, nunca hardcoded em outro lugar
js/map.js             dados do mapa (paredes, salas, spots de gerador/gancho/portão/esconderijo)
js/main.js             o maior arquivo — monta o mundo, roda solo (2 variantes) e online, câmera, iluminação
js/menu.js             telas de menu/lobby, toda a UI que não é o jogo em si
js/net.js, net-webrtc.js  transporte (LAN via server.js / P2P via PeerJS)
js/character.js        personagem genérico (survivor/killer são só config diferente)
js/capture.js           sistema de captura (derrubado/carregado/pendurado) — o mais complexo
js/health.js, door.js, gate.js, hideout.js, objective.js, ability.js   fábricas pequenas, um sistema cada
js/pallet.js, window.js  loops de perseguição — pallet derruba/atordoa/quebra, janela só muda velocidade
js/audio.js             tudo sintetizado, sem arquivo de som
js/input.js             teclado/touch/gamepad, unificado
server/server.js        servidor LAN (Node + ws)
```

## Ao terminar uma tarefa

Atualize este arquivo (a seção "Estado atual" acima) se o que mudou afeta o
que uma sessão futura precisa saber — não precisa duplicar o
`README.md`, só manter o resumo aqui coerente com a realidade.
