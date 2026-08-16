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

**Existe sim uma suite formal, `test/` + `npm test`** (`smoke-solo.mjs`,
`smoke-solo-killer.mjs`, `smoke-online.mjs` — o online sobe o próprio
`server/server.js` como processo filho). Roda em todo PR via
`.github/workflows/test.yml`. **Rodar antes de considerar qualquer mudança
de fluxo do menu/lobby pronta** — ela pegou uma quebra real nesta mesma
sessão (o estado "pronto" do lobby desabilitando `#lobby-start` sem o
smoke test online nunca clicar em `#lobby-ready`, travando 30s e falhando
no CI até ser corrigido). Rodar:
```
npx http-server . -p 8941 -s &   # a suite espera o jogo servido nessa porta
npm test
```
Ao adicionar/alterar qualquer coisa no fluxo de lobby (papel, pronto,
habilidade, iniciar partida), atualizar `smoke-online.mjs` junto — não só
rodar, EDITAR o arquivo se o fluxo mudou, senão ele quebra de novo pra
próxima sessão do mesmo jeito que quebrou agora.

Pra iterar numa feature ESPECÍFICA que ainda não tem cobertura na suite
formal (a maioria das mecânicas — a suite acima é só smoke test, não
cobre habilidade por habilidade), continue escrevendo script Playwright
ad-hoc no scratchpad, mesmo padrão de sempre — só não esquecer de rodar
a suite formal também antes de terminar. `playwright` já é dependência do
projeto (`node_modules/`), Chromium baixado em `%LOCALAPPDATA%\ms-playwright`.
Se o script mora fora da pasta do projeto (scratchpad), `import` direto
do caminho do pacote quebra no ESM do Windows (erro
`ERR_UNSUPPORTED_ESM_URL_SCHEME` — caminho absoluto tipo `C:\...` não é
uma URL `file://` válida) — usar `createRequire` apontando pro
`package.json` do projeto em vez de `import`:

```js
import { createRequire } from 'node:module';
const require = createRequire('C:\\Users\\Affil\\Desktop\\Demo.DBD-main\\package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch(); // sem executablePath — usa o Chromium já baixado
```

Padrão pra testar rápido: usar `page.evaluate(() => { Game.CONFIG.x.y = valor; })`
**antes** de clicar em "Jogar" pra encurtar timers longos (geradores de 35s,
duração de gancho de 6s, etc.) — NUNCA editar `js/config.js` só pra testar.
Se o alvo (objetivo/porta/pallet) fica dentro de uma sala, um walker
"anda reto até o alvo" trava na parede — sem pathfinding de verdade, ou
usa um waypoint fora da sala primeiro, ou mira num spot de campo aberto
(`MAP.objectiveSpots[4..7]`, por exemplo). Elementos como `.pallet`/`.door`
têm `style.left/top` = canto do retângulo, não o centro (some `width/2`,
`height/2` pra mirar certo — `.gate`/personagens já são ponto exato).
Pra testar 2+ jogadores, abrir vários `browser.newContext()` apontando pro
mesmo servidor LAN. **Cuidado**: rodar vários testes online em sequência
rápida reusando os mesmos nomes/porta às vezes dá timeout de conexão por
causa de sala presa no servidor de teste anterior — se um teste isolado
passa mas falhava numa bateria, reinicie o servidor com uma porta nova
antes de tentar de novo, não é bug de código.

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
- ~~Estado "pronto" no lobby~~ — **feito**: `toggleReady` no protocolo
  (`server.js`/`net-webrtc.js` host+join/`net.js`), reseta ao trocar de
  papel ou dar rematch, `Iniciar partida` só habilita com todo mundo
  pronto (`lobby-ready`/`lobby-start` em `menu.js`+`index.html`).
- ~~Host trocar/forçar o papel~~ — **feito**: `forceRole` no protocolo
  (mesmos 3 lugares), botões "A"/"S" ao lado do kick na linha de cada
  jogador (só o host vê), reseta "pronto" do alvo se o papel mudar.
- ~~Sobrevivente escolher 2 habilidades~~ — **feito** (2026-08-15): agora
  escolhe 2 das 4 (nunca repetidas — `linkAbilitySelects` em `menu.js`
  troca os `<select>` sozinho se o jogador tentar repetir). Isso exigiu um
  **3º slot de habilidade de verdade** em todo o sistema de input
  (`js/input.js`): tecla **R**, botão touch `#touch-ability3`, botão de
  gamepad índice 3 (Círculo/B) — `consumeAbility3Request()`. A 1ª
  habilidade continua no slot 1 (E), a 2ª no slot 3 (R); o slot 2 (Q)
  continua reservado só pro "sair do reparo engajado", sem sobrepor
  significado. Protocolo de sala ganhou `ability2` ao lado de `ability`
  nos 3 lugares. `main.js` tem `triggerSurvivorAbilitySlot`/
  `triggerLocalSurvivorAbilitySlot` genéricos (solo e online) que
  qualquer uma das 4 habilidades pode ocupar em qualquer slot — sprint e
  camuflagem já checam os dois slots (`localAbilityKey`/`localAbilityKey2`).
- ~~Armadilha do Assassino~~ — **feito** (2026-08-15): 3ª habilidade fixa
  do Assassino (slot 3/R), `Game.CONFIG.abilities.killerTrap`. Planta uma
  armadilha na própria posição (`spawnTrapMarker` em `main.js`, visível
  pros dois lados — decisão consciente de não ter stealth, igual ao resto
  do jogo), fica armada até algum Sobrevivente chegar perto (cada cliente
  de Sobrevivente decide por si, client-authoritative de sempre) ou até
  `duration` (30s) passar sem ninguém pisar. Quem pisa fica "snared"
  (`state.snaredUntil` em `character.js`, `.snared` no CSS,
  `Game.CONFIG.abilities.killerTrap.snareSpeedMultiplier`) por
  `snareDuration` (3s). Eventos novos no protocolo online: `trapPlaced`/
  `trapSprung` — o `trapSprung` também força o cooldown da habilidade no
  cliente do Assassino na hora (sem esperar os 30s de `duration`
  terminarem sozinhos). Implementado em `startSoloAsKiller` (IA
  Sobrevivente checa proximidade igual um jogador) e `startOnline`; **não**
  em `startSolo` (Assassino IA não usa a 3ª habilidade, mesma decisão já
  tomada pro Sentido). Ainda **fixa** (não há escolha 1-de-2 ainda — isso é
  o próximo item, Invisibilidade).
- ~~Invisibilidade do Assassino + escolha 1-de-2~~ — **feito**
  (2026-08-15): `Game.CONFIG.abilities.killerInvisibility` — enquanto
  ativa, o Assassino some da bússola (`killer-compass`), batimento
  (`Game.Audio.updateHeartbeat`) e vinheta de perigo do(s) Sobrevivente(s)
  online (`entry.invisible`, sincronizado por `sendState`/
  `onlineStateHandler` igual a `camouflaged`) — **não** esconde ele
  visualmente nem muda a visão/fog dele, só remove os avisos de proximidade
  à distância (igual ao "Undetectable" do jogo original). Sem evento de
  rede próprio (o estado "ativa" já viaja no `sendState` de sempre). O
  slot 3 do Assassino agora é uma escolha 1-de-2 (Armadilha ou
  Invisibilidade, campo `ability` reaproveitado — o Assassino nunca usava
  esse campo antes) no `#menu-killer-ability` (solo) e
  `#lobby-killer-ability` (online, só visível pro jogador com papel
  Assassino). `main.js` renomeou a variável antes fixa `killerTrap` pra
  `localAbility3`/`killerAbility3` (startOnline/startSoloAsKiller,
  respectivamente) com um `killerAbility3Key` guardando qual das duas foi
  escolhida — toda a lógica específica de Armadilha (marcador, evento de
  rede, checagem de proximidade) ficou atrás de `if (killerAbility3Key ===
  'trap')`. **Mesma limitação da Camuflagem, só que espelhada**: no
  `startSoloAsKiller` a IA Sobrevivente tem informação perfeita da posição
  do Assassino por outros meios, então Invisibilidade não muda o
  comportamento dela lá — só tem efeito real no modo online.
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

## Ideias futuras (auditoria de código, 2026-08-15)

Depois de fechar o backlog pendente (estado pronto, controle de papel pelo
host, 2ª habilidade do Sobrevivente, Armadilha/Invisibilidade do
Assassino), foi pedido pra gerar pelo menos +30 ideias novas analisando o
código existente e continuar implementando. Já implementadas nesta mesma
sessão (pequenos ajustes de qualidade, todos testados):
- Números mágicos de decaimento de progresso (`0.4`/`0.6`/`0.3`, antes
  soltos em `health.js`/`door.js`/`pallet.js`/`gate.js`) movidos pra
  `Game.CONFIG` (`healDecayRate`/`progressDecayRate`/`breakDecayRate`).
- Bônus de cooperação em geradores (`+50% por ajudante`, antes hardcoded
  em `main.js`) movido pra `Game.CONFIG.objective.cooperationBonusPerHelper`.
- `js/audio.js`: `clearTimeout` do 2º "thump" do batimento em
  `stopHeartbeat()` (o timer ficava pendente até disparar sozinho, mesmo
  já neutralizado pela checagem `heartbeatOn`).
- `css/style.css`: cor `#1a1420` (repetida 6x) virou variável
  `--ink-on-gold` em `:root`.
- Indicador de vagas no lobby (`#lobby-counts`, "X/1 Assassino · Y/4
  Sobreviventes") em `menu.js`.
- **Considerado e descartado**: decaimento de `wiggleProgress` (fase
  *carried* de `capture.js`) pra simetria com o decaimento que
  `hookProgress` (fase *hooked*) já tem — checado contra o jogo original:
  lá o wiggle também é puramente cumulativo (só o timer de sacrifício no
  gancho decai), então a "assimetria" já era fidelidade ao original, não
  bug. Não mexer nisso sem pedido explícito.

Resto da lista (não implementado, ordenado só por área, não por
prioridade — usar julgamento na próxima sessão, cada item é pequeno e
independente):

**Jogabilidade**
- ~~Skill check "ótimo"~~ — **feito** (2026-08-15): sub-zona central
  (`Game.CONFIG.skillCheck.greatZoneFraction`=0.3 da zona normal,
  sempre recalculada e centralizada em `spawnSkillCheck()`) que multiplica
  o `successBonus` por `greatBonusMultiplier` (1.6×) quando acertada.
  `objective.update()` retorna `{ justFailed, great }` (era só
  `justFailed`) — `great` é opcional pra quem chama, não quebra nada em
  `startSoloAsKiller` (IA nunca lê o campo). Anel do skill check
  (`.skillcheck-ring`) ganha uma faixa colorida extra no `conic-gradient`
  via `--great-start`/`--great-end` (mesmo mecanismo de `--zone-start`/
  `--zone-end`). Som novo `playSkillCheckGreat()` em `audio.js`. Testado
  com `Game.createObjective()` isolado (`state.skillCheck` é objeto plano,
  dá pra forçar ângulo/zona direto): acerto normal dá exatamente
  `successBonus`, acerto na zona ótima dá exatamente `successBonus ×
  greatBonusMultiplier`, erro não dá progresso nenhum; zona ótima
  confirmada sempre dentro da zona normal ao spawnar de verdade.
- ~~Modo de dificuldade opcional (errar tira progresso)~~ — **feito**
  (2026-08-15): checkbox "Modo difícil" nas Configurações
  (`dbd_hard_skillcheck` no `localStorage`, mesmo padrão de volume/
  joystick). Liga/desliga `Game.CONFIG.skillCheck.failPenalty` entre `0`
  (padrão, nunca tira progresso) e `hardModeFailPenalty` (0.08, menor que
  `successBonus`=0.18 de propósito — machuca mas não anula um acerto
  seguinte). `objective.js` → `resolveSkillCheck()` só desconta se
  `failPenalty > 0`. Testado: desligado por padrão, liga/persiste/
  recarrega certo, e a lógica de desconto aplicada de verdade (progresso
  0.5 → 0.42 num miss forçado com o modo ligado).
- ~~Reanimar aliado *downed* sem gancho~~ — **feito** (2026-08-15):
  `capture.js` ganha `revive()` — só funciona na fase *downed* (antes do
  Assassino pegar; uma vez `carried`/`hooked`, só resgate no gancho
  mesmo). Reaproveita `resolve('revived')` por dentro, então dispara o
  mesmo `onResolve(result)` que `escaped`/`rescued` já usam — o
  `struggleResult` que isso já manda pra rede é o suficiente pra outros
  clientes espelharem, **sem precisar de handler novo pra observadores**.
  Só existe no **modo online** (solo só tem 1 Sobrevivente, não tem quem
  reanimar). Novo evento `'revived'` no protocolo, `targetId===localId`
  no alvo chama `capture.revive()`, mesmo padrão de `'rescued'`.
  `Game.CONFIG.capture.reviveRange` (55px, igual ao `rescueRange`).
  **Corrida real fechada**: se o Assassino pegar (`pickedUp`) e um
  aliado reanimar (`revived`) quase ao mesmo tempo, o evento que chegar
  por último não podia mais aplicar por cima — `revive()` já se recusa
  se `!state.downed`, e o handler de `'pickedUp'` ganhou a mesma checagem
  (`entry.capture.state.downed` precisa ser `true` antes de aplicar).
  Testado via Playwright com 3 clientes LAN (Assassino + 2 Sobreviventes):
  Assassino derruba de verdade (2 golpes reais), aliado anda até lá e
  reanima, o próprio alvo, o Assassino E o aliado todos veem o estado
  certo (`captured:false, downed:false, injured:true`), e o alvo
  reanimado consegue andar de novo.
- ~~Cooldown de reentrada em `hideout.js`~~ — **feito** (2026-08-15):
  `Game.CONFIG.hideout.reentryCooldown` (5s), `state.reentryLockedUntil`
  (timestamp `performance.now()`, mesmo padrão de `stunnedUntil`/
  `snaredUntil`) setado em toda saída (voluntária ou forçada);
  `enter()` recusa (retorna `false`, no-op silencioso) enquanto em
  cooldown. Testado isolado (`Game.createHideout()` via
  `page.evaluate`): reentrada imediata bloqueada, libera depois do
  cooldown, barulho depois de tempo escondido continua funcionando.
- ~~Regeneração de pallets já quebrados~~ — **feito** (2026-08-15):
  `pallet.js` ganha `reset()` — só mexe em pallets já `broken` (volta
  `dropped`/`broken`/`breakProgress` pro estado inicial "em pé"); não
  toca em pallets ainda de pé ou só derrubados. Chamado no exato instante
  em que `gatesActive` vira `true` (geradores todos prontos) nos 3 modos.
  **Sem evento de rede novo no online**: todo cliente chega em
  `gatesActive=true` de forma sincronizada e determinística (a partir de
  `objectiveDone`, que já é sincronizado) — cada um reseta a própria
  cópia dos pallets de forma idêntica, mesmo truque que o multiplicador
  de velocidade da janela já usa. Testado: unidade (`Game.createPallet()`
  isolado — não mexe em pallet de pé/só derrubado, só reseta de verdade
  um `broken`) + integração (partida solo real com objetivo/duração
  encurtados via `page.evaluate`, completou um gerador de verdade,
  `gatesActive` disparou e a chamada de reset rodou sem erro).
- Mais layouts de mapa além dos 2 atuais (`DOOR_SIDES_BY_LAYOUT`/
  `PALLET_SPOTS_BY_LAYOUT`/`LOOSE_OBSTACLES_BY_LAYOUT` em `map.js`).
- ~~Spawn do Assassino variável por layout~~ — **feito** (2026-08-15):
  `KILLER_SPAWN_BY_LAYOUT` em `map.js` (layout 0 mantém `{1500,1000}`,
  layout 1 ganha `{2100,1000}` — os dois no corredor aberto central,
  fora de qualquer sala, só deslocados lateralmente). `buildRoomLayout()`
  agora recebe o spawn como parâmetro extra; `buildWorld()` em `main.js`
  guarda o valor resolvido em `currentKillerSpawn` (mesmo padrão de
  `currentLayoutWalls`), substituindo as 3 leituras diretas de
  `MAP.killer` (`startSolo`/`startSoloAsKiller`/`startOnline`).
  `MAP.killer` continua existindo só como fallback. Entra também na
  checagem de sanidade (`assertPointsOutsideRooms`). Testado: 10
  partidas solo-como-Assassino seguidas mostraram os 2 pontos
  diferentes, e um teste online com 2 clientes LAN confirmou que os dois
  concordam na mesma posição (prova que o `mapLayoutIndex` sincronizado
  continua funcionando).
- Diferenciar `GAP_SIZE` (hoje 96px fixo pros dois) de porta vs janela em
  `map.js`, pra telegraphing melhor de qual vão é qual à distância.
- Sistema de ping/marcador no mapa pra Sobreviventes se comunicarem sem
  voz (loop LAN/P2P não tem chat nem voz — só o ping falso da Distração).

**Áudio**
- ~~SFX dedicados de porta/pallet/portão/fuga~~ — **feito** (2026-08-15):
  `playDoorLock`/`playDoorBreak`/`playPalletDrop`/`playPalletBreak`/
  `playGateOpen`/`playSurvivorEscape` em `audio.js` (ruído branco via
  buffer reaproveitado — `getNoiseBuffer()` — pros sons de quebra/impacto,
  já que Web Audio não tem gerador de ruído pronto). Porta/pallet/gate
  ganham **raio de audição** novo (`Game.CONFIG.sfxRadius`, 650px) —
  ação do PRÓPRIO jogador sempre toca (a mecânica já exige proximidade
  pra interagir), mas ouvir a ação de OUTRO jogador/IA longe é
  distance-gated, mesmo cuidado que o sistema de ruído já tinha (evita
  reintroduzir "ouve não importa a distância"). Portão abrir/Sobrevivente
  escapar ficam **fora** do raio de propósito — são poucos por partida e
  sinalizam virada de jogo, tocam pra todo mundo. Pallet drop/break já
  passavam pelo sistema de ruído (`emitNoiseOnline`) pro Assassino
  especificamente — em vez de duplicar, o `sound` desse sistema ganhou
  `'palletDrop'`/`'palletBreak'` mapeando pro som certo em vez do
  `playError()` genérico de antes; meu novo handler de rede só toca pros
  OUTROS Sobreviventes por perto (que o sistema de ruído não cobria).
  Implementado nos 2 modos solo e online (local + remoto).

  **Achado durante o teste, não corrigido** (fora de escopo desta
  entrega): `js/net-webrtc.js` → `host()` → `sendEvent()` não passa
  `exceptId` pro `broadcast()`, então quando o **próprio host P2P** é
  quem dispara um evento, ele recebe de volta via `deliverLocally` (ao
  contrário do `server.js`, que corretamente exclui o remetente). Isso é
  inofensivo pra maioria dos handlers (idempotentes — reaplicar o mesmo
  estado não quebra nada) mas pode duplicar efeitos sonoros/vibração só
  quando o host P2P (não jogadores comuns, nem LAN) é o autor do evento.
  Consertar exigiria mexer no `broadcast()` genérico usado por todo
  `net-webrtc.js`, risco maior que o benefício pra essa entrega — anotado
  aqui pra uma rodada futura dedicada só a isso.
- ~~Sinalizar na UI quando Web Audio indisponível~~ — **feito**
  (2026-08-15): `Game.Audio.init()` agora retorna `true`/`false`
  (Web Audio existe nesse navegador ou não). O `pointerdown` de
  desbloqueio de áudio em `menu.js` (já existia, é o mesmo listener que
  resolve o "jogo mudo" quando quem inicia a partida é outro jogador)
  mostra `#audio-warning` (`menu-start`) se vier `false`. Testado via
  Playwright: navegador normal nunca mostra o aviso; com
  `window.AudioContext`/`webkitAudioContext` removidos via
  `addInitScript` (simula um navegador sem suporte), o aviso aparece
  certo depois do primeiro toque.
- ~~Volumes separados por categoria~~ — **feito** (2026-08-15): 3 gain
  nodes independentes em `audio.js` (`sfxGain`/`heartbeatGain`/
  `ambientGain`, cada um `ctx.destination` direto — não tem mais um
  "master" por cima) — todo som se conecta na categoria certa em vez de
  um `masterGain` único. API muda de `setMasterVolume(v)` pra
  `setSfxVolume`/`setHeartbeatVolume`/`setAmbientVolume`. 3 sliders nas
  Configurações (`dbd_volume_sfx`/`dbd_volume_heartbeat`/
  `dbd_volume_ambient` no `localStorage`, substituindo o único
  `dbd_volume` de antes). Testado via Playwright: sliders persistem e
  recarregam certo, API antiga (`setMasterVolume`) não existe mais, e
  (verificação mais forte) interceptando `AudioContext.prototype.
  createGain` pra capturar os nodes de verdade — os 3 primeiros criados
  batem exatamente com os valores dos sliders (`0.25`/`0.6`/`0.05` pra
  `25`/`60`/`5`).

**Multiplayer / protocolo**
- ~~Persistir o loadout de habilidades~~ — **feito** (2026-08-15):
  `dbd_ability`/`dbd_ability2`/`dbd_killer_ability` no `localStorage`,
  mesmo padrão do token de reconexão. Solo e lobby online compartilham a
  mesma preferência (`loadAbilityPrefs()` seeda os 6 `<select>` — 3 solo +
  3 lobby — a partir das mesmas 3 chaves; qualquer um deles mudando
  salva de volta). Testado: mudar os 3 selects, recarregar a página,
  confirmar que os 6 `<select>` voltam com o valor salvo.
- ~~Botão "copiar código da sala"~~ — **feito** (2026-08-15):
  `#lobby-room-code-copy` ao lado do código/QR, usa `navigator.clipboard`
  (só aparece se a API existir — precisa de contexto seguro, https ou
  localhost; sem fallback, o código já fica visível na tela pra copiar à
  mão). Testado via Playwright com permissão de clipboard concedida:
  clica, mostra "Copiado!" por 1.5s, clipboard recebe o código certo.
- ~~Validação leve de protocolo~~ — **feito** (2026-08-15):
  `Game.Protocol.KNOWN_EVENT_KINDS` (Set com os 21 kinds usados hoje,
  atualizado nesta mesma sessão pra incluir `revived`/`trapPlaced`/
  `trapSprung` que ainda não estavam listados). `onlineEventHandler` em
  `main.js` confere todo evento recebido contra essa lista e dá
  `console.warn` se vier um `kind` desconhecido — nunca bloqueia nada,
  só avisa cedo em vez de falhar silenciosamente até alguém notar em
  teste manual. Testado via Playwright: partida online real (2 clientes)
  não gera nenhum warning nas ações normais; injetar um `kind`
  inventado direto via `Game.onlineEventHandler` (exposto em `Game`)
  gera o warning esperado; um `kind` conhecido injetado do mesmo jeito
  não gera nada.
- ~~Assert de sanidade em `map.js`~~ — **feito** (2026-08-15):
  `assertPointsOutsideRooms()` roda uma vez no carregamento, checa
  `hookSpots`/`gateSpots` contra `ROOM_DEF` (`objectiveSpots` e
  `hideoutSpots` ficaram de fora de propósito — os 4 primeiros
  objectiveSpots e todos os hideoutSpots são intencionalmente dentro de
  sala). Sem flag de "modo dev": custo desprezível (poucos pontos × 6
  salas) e só imprime `console.warn` se achar um problema de verdade —
  num mapa correto fica 100% silencioso. Testado: mapa atual não gera
  nenhum warning (dados já estavam certos), lógica confirmada capturando
  um ponto propositalmente inválido.

**UX/acessibilidade**
- ~~Seta pro objetivo incompleto mais próximo~~ — **feito**
  (2026-08-15): `#objective-compass` — mesmo padrão visual/CSS do
  `#killer-compass` já existente (espelhado à esquerda, dourado em vez
  de vermelho), mas **sem limite de alcance** (é ajuda de navegação, não
  informação sensível que precisa custar algo pra ver — diferente do
  killer-compass, que só existe dentro do raio do batimento).
  `updateObjectiveCompass(localPos, gatesActiveNow)` aponta pro objetivo
  incompleto mais próximo (`nearestBy(objectives, ...)`) e, depois que
  todos terminam (`gatesActive`), passa a apontar pro portão mais
  próximo ainda fechado — mesma pergunta "pra onde eu vou agora" nas 2
  fases. Só pro Sobrevivente (`startSolo`/`startOnline`, não existe em
  `startSoloAsKiller`). Testado: ângulo calculado bate exatamente com a
  matemática esperada tanto mirando um objetivo quanto (depois de
  completar um de verdade numa partida solo real, timers encurtados)
  mirando o portão; regressão online confirmando que só o Sobrevivente
  vê a seta, nunca o Assassino.
- ~~Indicador extra pros 4 Sobreviventes~~ — **feito** (2026-08-15):
  `.survivor-badge` — círculo com o número (1-4) no canto do sprite,
  criado junto com `setColorOverride()` em `startOnline` (só modo online,
  só sobrevivente — solo só tem 1, sem precisar numerar). É filho do
  `.char`, então some/aparece junto com o resto do personagem sob o
  overlay de iluminação/fog, sem precisar de lógica de visibilidade
  própria. Testado via Playwright com 3 clientes LAN: cada Sobreviventes
  recebe o número certo (1, 2), Assassino não tem badge nenhum.
- Configuração de remapeamento de tecla (hoje E/Q/R/WASD são fixos).
- ~~Histórico de partidas~~ — **feito** (2026-08-15): tela nova
  "Histórico de partidas" (`#menu-history`, botão no menu principal),
  guarda as últimas 20 em `dbd_match_history` no `localStorage`
  (`{date, won, role, detail}` — `detail` reaproveita o mesmo texto que
  já aparece na tela de resultado, sem duplicar formatação). Botão
  "Limpar histórico". `recordMatchHistory()` chamado em `showResult()`,
  ao lado do `recordMatchResult()` (agregado) que já existia — os dois
  continuam coexistindo, um não substitui o outro. Testado via
  Playwright: estado vazio mostra aviso, partida solo real completa
  (timers encurtados via `page.evaluate`) gera uma entrada com
  papel/resultado/detalhe corretos, botão de limpar funciona.

**Técnico/arquitetura**
- Estrutura espacial simples (grid) pra `nearbyWalls` em `lighting.js` —
  hoje é `O(paredes)` por frame sem particionamento; só importa se o mapa
  crescer bastante.
- ~~`shortcuts` no `manifest.json`~~ — **feito** (2026-08-15): 2 atalhos
  ("Jogar de Sobrevivente"/"Jogar de Assassino", ambos solo — LAN/P2P
  sempre exigem preencher IP/senha/código, um atalho não pouparia passo
  nenhum ali) apontando pra `index.html?mode=solo-survivor`/
  `solo-killer`. `menu.js` lê `?mode=` e clica no botão certo sozinho —
  **precisa esperar `DOMContentLoaded`** (achado testando: clicar síncrono
  na hora que o script roda dava `Game.startSolo is not a function`,
  porque `js/menu.js` carrega antes de `js/main.js` no HTML — só depois
  de `DOMContentLoaded`, que espera todo `<script defer>` terminar,
  `Game.startSolo`/`startSoloAsKiller` já existem de verdade). `screenshots`
  ficou de fora (exigiria gerar imagens reais da UI, fora do escopo de
  código). Testado: os 2 modos abrem o jogo sozinhos com a query certa, e
  o prefill de código por QR do P2P (mesma área do arquivo) continua
  funcionando sem regressão.
- ~~Restringir `cache.put` de `sw.js`~~ — **feito** (2026-08-15):
  `CACHEABLE_EXT` (whitelist de extensão: html/js/css/json/imagens/fontes)
  + raiz sem extensão (`/`) — `isCacheable(url)` decide antes do
  `cache.put`. Não muda nada hoje (o jogo só serve arquivos estáticos com
  extensão conhecida), só fecha a armadilha de cachear sem querer uma
  chamada dinâmica same-origin futura. Testado via Playwright registrando
  o SW de verdade: `js/config.js` (extensão conhecida) cacheia,
  `/fake-api-endpoint` (sem extensão, simula um endpoint dinâmico
  futuro) não cacheia.
- ~~Formalizar testes numa pasta versionada~~ — **já existia, não
  precisou criar** (2026-08-15): checado e essa ideia partia de uma
  premissa desatualizada deste próprio arquivo — `test/` (não `tests/`)
  + `npm test` já existem desde os PRs #22/#34 (`smoke-solo.mjs`/
  `smoke-solo-killer.mjs`/`smoke-online.mjs`, CI em
  `.github/workflows/test.yml`), só a seção "Como rodar/testar
  localmente" deste arquivo estava desatualizada dizendo o contrário.
  **Achado real ao rodar os 3 antes de propor algo novo**:
  `smoke-online.mjs` estava **quebrado** desde o estado "pronto" do
  lobby (item mais acima nesta lista) — clicava `#lobby-start` sem
  nunca marcar `#lobby-ready`, travava 30s e falhava, local e no CI.
  Corrigido (adicionado o clique em `#lobby-ready` nos 2 clientes antes
  de iniciar). Seção de testes deste arquivo reescrita pra parar de
  afirmar que não existe suite formal, e pra deixar registrado: sempre
  rodar `npm test` antes de considerar pronta qualquer mudança de fluxo
  de menu/lobby, e atualizar `smoke-online.mjs` junto se esse fluxo
  mudar de novo.

Itens de escopo grande já documentados em "Pendente/backlog real" acima
(mapa em pixel art, tileset customizável, 2º estágio de gancho, failover
de host P2P) continuam de fora dessa lista pra não duplicar.

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
