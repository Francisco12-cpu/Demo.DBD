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

Sistemas completos e testados: movimento (touch/teclado/gamepad), mapa com
salas reais + colisão AABB, portas trancáveis/arrombáveis (automático por
proximidade, sem botão), esconderijo com limite de tempo E barulho se ficar
escondido demais, objetivos/geradores com skill check de dificuldade
progressiva (errar não penaliza, só custa tempo), **sistema de captura em 3
fases — derrubado → carregado → pendurado num gancho, com resgate por
aliado** (cópia fiel do jogo original, ver README "Sistema de captura"),
fase de portão de saída, iluminação por raycasting (paredes bloqueiam visão
mas continuam visíveis), áudio 3D sintetizado, câmera seguindo o jogador,
multiplayer LAN + P2P com reconexão, modo solo dos dois lados (jogar de
Sobrevivente OU de Assassino, cada um contra uma IA simples do lado
oposto), menu responsivo, PWA instalável, **sprite de pixel art autoral real
pro Assassino e Sobrevivente** (spritesheets `assets/killer-sheet.png`/
`survivor-sheet.png`, substituindo a silhueta CSS antiga — animações
idle/run/sprint/attack, o `downed` da captura reaproveitado pras 3 fases
derrubado/carregado/pendurado, hitbox de ataque com offset frontal
espelhado por direção, cor dos 4 Sobreviventes por `hue-rotate`), **pallets
e janelas** (`js/pallet.js`/`js/window.js` — loops de perseguição de
verdade: pallet derruba/bloqueia/atordoa/quebra, janela deixa o
Sobrevivente passar rápido e o Assassino devagar, ver README "Loops de
perseguição"), **sistema de ruído com raio de audição real**
(`emitNoiseOnline`/`emitNoiseSolo` em `js/main.js`, unifica o que antes
eram 3 mecanismos duplicados — sprint e pallet quebrando agora fazem
barulho de verdade), **áudio 3D corrigido** (o contexto agora reativa
sozinho quando o navegador suspende no meio da partida, batimento sem
atenuação dupla, frequência mais audível em alto-falante mono — ver README
"Áudio" pro diagnóstico completo), aviso de gerador ativado agora também
nos 2 modos solo (antes só existia no Online), **2 bugs de iluminação
corrigidos** (pallet derrubado tampando a tela — a colisão dele não
deveria contar pro raycasting de luz, só pra colisão física; e Sentido do
Assassino sem efeito visível — o overlay de escuridão não sabia que a
habilidade estava ativa e continuava pintando por cima do Sobrevivente
"revelado" — ver README "Câmera e iluminação" pro diagnóstico completo de
cada um), nome do jogo decidido pelo usuário: **"Until Dawn"**.

**Reportado pelo usuário mas NÃO reproduzido ainda** (investigar numa
próxima sessão, com mais detalhe do usuário sobre como reproduzir): "o
Sobrevivente ficou preso perto de um gerador, sem conseguir se mover".
Testado diretamente — parado reparando, com e sem skill check ativo, e
tentando se mover em todas as direções depois — sem conseguir reproduzir
nenhum travamento. Hipóteses já descartadas: sobreposição geométrica de
pallet/janela com algum `objectiveSpots` (checado numericamente pros 2
layouts, nenhuma sobreposição perigosa), e o campo `stunnedUntil`
(adicionado a todo personagem via `js/character.js`, mas só é setado pro
Assassino) afetando o Sobrevivente por engano. Hipótese ainda não
descartada: confusão do usuário entre o **esconderijo** (que trava
movimento de propósito enquanto escondido, saindo só com o botão de ação)
e o gerador — os dois são "fica parado perto" e podem ter sido
confundidos. Perguntar ao usuário: em qual modo (solo/online), jogando de
quê, e se aparecia algum indicador na tela (esconderijo tem uma barra/ícone
diferente do gerador).

**Ainda em aberto sobre os sprites** (perguntar ao usuário antes de decidir
sozinho): pose de "parado" dedicada do Sobrevivente — não foi confirmada
nenhuma linha específica, hoje usa o quadro 0 do `run` como placeholder;
linha r8 do Sobrevivente ("teste") — o usuário mencionou mas não ficou claro
pra que serve; r2 do Sobrevivente (mini-animação de transição ao parar) —
descrita como "seria legal" mas não implementada; `hit` do Sobrevivente
(r7) já está no `Game.CONFIG.sprites` mas o flash de dano continua sendo o
filtro CSS antigo, não foi trocado pro sprite. `vanish`/`fall` do Assassino
(r6/r7) estão no config só reservados — não têm sistema de jogo (invisibilidade,
cutscene de fuga) que os use ainda.

**Pendente/backlog** (ver `README.md` → "Planos futuros"): mapa em pixel
art de verdade (hoje é CSS/canvas gerado — só os personagens ganharam arte
autoral até agora; os pallets/janelas novos também são divs simples, sem
arte própria ainda), protocolo de sala com host/dono controlando
kick/papel, 2ª estágio de gancho antes da morte definitiva (hoje é só 1
estágio, simplificação consciente), IA Sobrevivente (modo solo-como-
Assassino) ainda não derruba pallets sozinha (limitação conhecida, ver
README).

**Nome do jogo: decidido — "Until Dawn"**. Já trocado em `index.html`
(`<title>`, `<h1>`, `apple-mobile-web-app-title`, título do HUD),
`manifest.json` (`name`/`short_name`), `server/server.js` (log de boot),
`server/package.json` (description), `README.md` e `CLAUDE.md`. "Assassino
vs Sobreviventes" continua usado como descrição mecânica do formato em
alguns lugares (não é mais o nome do jogo). Ícone atual (`assets/icon-
*.png`) continua servindo de base (usuário gostou), só refinar se pedido.

**Ideias já discutidas mas propositalmente NÃO implementadas ainda**
(usuário pediu só análise escrita, não construir): editor visual de
partículas/som/mapa, executável de PC (Electron/Tauri — PWA já cobre a
maior parte do caso de uso), comparação de features com o jogo original.
Se o usuário mencionar essas ideias de novo, ele provavelmente já viu a
análise anterior — perguntar se é pra continuar analisando ou já
implementar algo específico.

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
