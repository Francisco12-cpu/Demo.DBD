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

**Assassino vs Sobreviventes** — jogo assimétrico competitivo estilo Dead by
Daylight simplificado, rodando 100% no navegador (HTML/CSS/JS puro, sem
build step, sem framework). 1 jogador é o Assassino, até 4 são Sobreviventes
tentando reparar geradores e escapar. Feito pra jogar com celular, incluindo
com amigos pela mesma rede Wi-Fi (LAN) ou por P2P sem precisar de servidor
dedicado. Autor: Francisco Audir (@filho.af).

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
  `js/health.js`, `js/hideout.js`, `js/capture.js` como modelo. `state` é
  sempre um objeto plano exposto direto (não encapsulado), porque o modo
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
- **Sem assets externos** — sprites são CSS `mask-image` gerados
  localmente por script Python/Pillow (ver `assets/`), áudio é 100%
  sintetizado via Web Audio API (`js/audio.js`, osciladores, zero arquivo de
  som). Ícones do PWA (`assets/icon-*.png`) idem.
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
oposto), menu responsivo, PWA instalável.

**Pendente/backlog** (ver `README.md` → "Planos futuros"): pallets e
janelas (loops de perseguição — só chase em linha reta hoje), sprite/mapa
em pixel art de verdade (hoje é tudo CSS/canvas gerado), protocolo de sala
com host/dono controlando kick/papel, 2ª estágio de gancho antes da morte
definitiva (hoje é só 1 estágio, simplificação consciente).

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
js/audio.js             tudo sintetizado, sem arquivo de som
js/input.js             teclado/touch/gamepad, unificado
server/server.js        servidor LAN (Node + ws)
```

## Ao terminar uma tarefa

Atualize este arquivo (a seção "Estado atual" acima) se o que mudou afeta o
que uma sessão futura precisa saber — não precisa duplicar o
`README.md`, só manter o resumo aqui coerente com a realidade.
