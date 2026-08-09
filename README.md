# CLAUDE.md

Este arquivo orienta o Claude Code ao trabalhar neste repositório.

**Criado por Francisco Audir — @filho.af**

## Visão geral do projeto

**Assassino vs Sobreviventes** — jogo assimétrico competitivo (estilo Dead by
Daylight simplificado): 1 jogador é o Assassino, os demais são Sobreviventes
tentando completar objetivos e escapar de uma mansão abandonada.

- **Plataforma:** HTML/CSS/JS puro, rodando direto no navegador (sem build
  step, sem framework pesado — simples de rodar abrindo o `index.html`)
- **Distribuição:** joga na web (ex: itch.io); sem servidor pago
- **Modos:** multiplayer local (vários controles no mesmo PC/teclado) →
  depois multiplayer online P2P (sem servidor dedicado)
- **Arte:** pixel art — hoje é um sprite (`assets/character-mask.png`) gerado
  localmente por script (16×20px, sem depender de internet pra baixar arte
  pronta), tingido por CSS `mask-image` com a cor de cada personagem/
  Sobrevivente. Ver nota em `Planos futuros`
- **Mapas:** 2 layouts fixos (obstáculos variam, sorteado a cada partida);
  randomização de verdade continua objetivo futuro
- **Sobrevivente não ataca ninguém** — só foge, usa habilidade e completa
  objetivos. Só o Assassino tem ataque (que inicia a captura)

## Como rodar

**Sozinho (contra a IA), no navegador:** projeto estático — abrir
`index.html` direto (duplo clique) já é suficiente, ou servir com
`npx serve` / `python3 -m http.server`. No menu inicial, escolher
"Jogar sozinho".

**Multiplayer LAN (mesma rede Wi-Fi):** um dos jogadores (o "host") roda o
servidor da sala:
```
cd server
npm install     # só na primeira vez
npm start       # porta 8787, senha "dbd123" por padrão
```
Customizar porta/senha: `PORT=9000 ROOM_PASSWORD=abc123 npm start`. O
terminal mostra o IP não é impresso automaticamente — descubra o IP local
da máquina host (`ipconfig`/`ifconfig`/Configurações de rede) e informe pros
outros jogadores.

Todo mundo (inclusive o host) abre `index.html` no navegador — do PC ou do
celular, contanto que estejam na mesma rede — escolhe "Multiplayer LAN",
digita o IP do host + porta + senha, entra na sala, escolhe o papel
(1 Assassino, até 4 Sobreviventes) e qualquer um pode apertar "Iniciar
partida" quando tiver pelo menos 2 jogadores com 1 deles sendo o Assassino.

**Multiplayer P2P (celular vira host, sem PC nenhum):** no menu, escolhe
"Multiplayer P2P (beta)" → "Criar sala (virar host)" — funciona em
qualquer navegador, inclusive celular, sem instalar nem rodar nada. Aparece
um código curto (ex: `dbd-XK3F9`) **e um QR code**; passa o código (ou deixa
o outro jogador escanear o QR) + a senha que você escolheu. Quem escaneia o
QR já abre o jogo direto na tela de "entrar com código" com o código
preenchido — só falta digitar a senha. Sem QR, dá pra digitar o código à
mão também, em "Entrar com código". Depois disso é o mesmo lobby de sempre.
Só precisa de internet no instante de conectar (usa o broker público e
gratuito da biblioteca PeerJS pra fazer as duas pontas se acharem); o jogo
em si troca dados direto celular-a-celular depois disso.

**Jogar pela web (sem instalar nada, só pro modo solo/teste):** existe um
workflow (`.github/workflows/deploy-pages.yml`) que publica o site
automaticamente no GitHub Pages a cada push na `main`. **Isso não é sobre
arquivos faltando** — o workflow e todos os arquivos já estão certos; falta
só 1 configuração no GitHub que ninguém trocou ainda: em
`Settings → Pages → Build and deployment → Source`, está marcado "Deploy
from a branch" (o padrão do GitHub, que tenta rodar Jekyll numa pasta
`/docs` que não existe nesse projeto — por isso falha). Trocar esse dropdown
pra **GitHub Actions** resolve em definitivo; depois disso o link público
(`https://<usuário>.github.io/<repo>/`) fica sempre atualizado sozinho. O
modo Multiplayer LAN não funciona pelo GitHub Pages (precisa do servidor
Node.js rodando em alguém na mesma rede) — o Pages é só pra jogar/testar
sozinho e mandar o link pra alguém dar uma olhada.

## Estrutura do projeto
```
index.html              esqueleto HTML (menu + jogo) + tags <script>
css/style.css             todo o CSS (visual, animações, menu, controles touch)
js/config.js               config central de balanceamento por tipo de personagem
js/map.js                   dados do mapa (2 layouts, spawns, objetivos, porta) + colisão
js/input.js                 teclado + joystick touch + gamepad, unificados (movimento/ação/habilidades)
js/character.js             personagem único parametrizado (movimento/ataque/visual/cor)
js/ability.js                estado genérico de habilidade (duração/cooldown/usos)
js/objective.js             objetivo com barra de progresso + skill check circular
js/capture.js               estado "capturado" + barra de struggle
js/audio.js                  sons sintetizados via Web Audio API (batimento espacial + sfx)
js/net.js                   cliente WebSocket fino pro modo LAN
js/net-webrtc.js            host e cliente P2P (WebRTC via PeerJS) pro modo sem PC
js/menu.js                  telas de menu, lobby (LAN e P2P), QR code e resultado
js/main.js                  monta o mundo, roda o modo solo ou o modo online, habilidades, áudio
server/server.js            servidor da sala (Node.js + ws) pro modo LAN
server/package.json         dependência (ws) e script `npm start`
vendor/peerjs.min.js        biblioteca PeerJS (MIT) vendorizada, só pro modo P2P
vendor/qrcode.min.js        biblioteca qrcode-generator (MIT) vendorizada, só pro QR do P2P
assets/character-mask.png   sprite pixel art (16×20px) gerado localmente, usado via CSS mask
```
Client em `<script>` clássico (sem `type="module"`, sem bundler) pra
continuar funcionando ao abrir `index.html` direto com duplo clique. O
servidor Node.js só é necessário pro modo LAN — o modo P2P não precisa de
nada rodando além do navegador. `js/net.js` e `js/net-webrtc.js` implementam
exatamente a mesma interface (mesmos métodos, mesmos callbacks), então
`js/main.js`/`js/menu.js` não sabem nem precisam saber qual transporte está
em uso.

## Ordem de desenvolvimento (seguir esta prioridade)
1. ~~Movimento básico (teclado, depois gamepad)~~ feito (+ touch)
2. ~~Mapa fixo com colisão~~ feito
3. ~~Sistema de objetivo (ficar perto de um ponto, barra de progresso enche)~~ feito
4. ~~Skill check (mini-jogo do círculo giratório)~~ feito
5. ~~Segundo personagem (Assassino) e sua diferenciação de gameplay~~ feito
   (IA no modo solo; jogador real no modo online)
6. ~~Captura + barra de "struggle"~~ feito, com vitória/derrota de verdade
7. ~~Habilidades/poderes de cada personagem~~ feito
8. Multiplayer local (vários controles no mesmo PC) — **fora de escopo por
   pedido do usuário** ("não tenho uso pra isso, quero focar só no online")
9. ~~Multiplayer online~~ feito **fora de ordem**, a pedido explícito do
   usuário, e com 2 modalidades em vez de 1: LAN (servidor num PC) e P2P
   (WebRTC, qualquer celular vira host) — ver seção Multiplayer abaixo.

Pulamos o passo 8 por pedido direto — registrado aqui pra não parecer
inconsistência com a regra "não pular etapas" de cima. Diferente do passo 8,
que só ficou pra trás na ordem, o multiplayer local em si foi descartado do
escopo (não do jeito "ainda não fizemos", e sim "não vamos fazer por agora").

---

## Lista completa de funcionalidades

### Movimento e controles
- [x] Movimento em 8 direções via teclado (WASD + setas)
- [x] Suporte a controle/gamepad
- [x] Controle touch (joystick virtual + botão de ataque) pra jogar no
      celular sem depender de controle físico
- [x] Sprite vira (flip horizontal) ao mudar de direção esquerda/direita
- [x] Animação "parado" (idle)
- [x] Animação "correr" — agora com spritesheet de verdade (4 frames,
      `assets/character-walk.png`, gerado localmente igual ao resto da arte),
      trocando de quadro via `mask-position` animado em CSS puro (sem
      trocar elemento nem depender de JS pra isso)
- [x] Animação "matar"/ataque (trava movimento durante a execução)
- [x] Velocidade como variável configurável por personagem (não hardcoded)
- [x] Teclado, gamepad e joystick touch funcionam ao mesmo tempo sem
      atrapalhar um ao outro (`js/input.js`): movimento usa o primeiro que
      detectar input (teclado > touch > gamepad), e os botões de ação são
      OR entre os três — testado que apertar tecla e usar gamepad junto não
      trava nada
- [x] Sensibilidade do joystick virtual configurável (menu Configurações)

### Menu e seleção de personagem
- [ ] Menu inicial para escolher: Assassino ou Sobrevivente
- [ ] A escolha define todos os parâmetros do personagem (velocidade,
      habilidades disponíveis, animações, etc.) — um único sistema de
      personagem parametrizado, não código duplicado
- [ ] Sobreviventes escolhem 1 habilidade adicional no menu antes de entrar

### Assassino (1 jogador por partida)
- [x] Mais rápido que os Sobreviventes (velocidade maior, configurável)
- [x] Ataque básico: espada curta — exige estar bem perto do alvo (**só o
      Assassino ataca** — Sobrevivente não tem nenhum ataque, por decisão
      do usuário: "eu sou sobrevivente, não é pra ter ataque")
  - [x] Cooldown pequeno entre ataques
  - [x] Hitbox/zona de colisão de dano
  - [x] Anima "matar" no alvo atingido — no modo online, atingir um
        Sobrevivente inicia a captura de verdade (struggle bar) e toca um
        efeito sonoro; no modo solo é a mesma captura, contra a IA
- [x] Poder 1: "Sentido" — revela todos os Sobreviventes por alguns
      segundos, mesmo os que estariam escondidos (fora do alcance normal de
      visão ou atrás de parede — o jogo não simula linha de visão de
      verdade, só distância). Tecla **E**, `Game.CONFIG.abilities.killerSense`
- [x] Poder 2: "Investida" — Dash, aumento de velocidade temporário. Tecla
      **Q**, `Game.CONFIG.abilities.killerDash`
- [x] Habilidades têm cooldown visível na UI (`#ability-hud`, texto simples
      tipo "Sentido: 12s")

**Modo solo:** a IA não usa Sentido (não faz sentido pra ela, já sabe onde
o jogador está direto), mas usa Investida sozinha quando está longe do
alvo, só pra dar um pouco mais de desafio.

**Nota:** no modo solo o Assassino continua sendo uma IA simples (anda
direto na direção do Sobrevivente e ataca ao alcançar) — é só um jeito de
testar sozinho. Agora com um desvio de obstáculo básico: se a IA fica
"colada" numa parede por um instante (mal se move apesar de tentar), ela
desvia perpendicular por um tempo antes de voltar a mirar direto no alvo —
não é pathfinding de verdade, só o suficiente pra não ficar burra numa
quina. No **modo online** o Assassino é um jogador de verdade, controlado
por quem escolheu esse papel na sala.

### Sobreviventes (até 4 jogadores por partida)
- [x] Velocidade base mais lenta que o Assassino (180 vs 220,
      `Game.CONFIG.characters`)
- [x] Escolhem 1 habilidade no menu (solo) ou no lobby (online), entre:
  - [x] Sprint — corrida temporária (`speedMultiplier` em
        `Game.CONFIG.abilities.survivor.sprint`)
  - [x] Camuflagem — fica invisível pro Sentido do Assassino e pro alcance
        normal de visão dele, mesmo perto (não afeta o modo solo, já que a
        IA não usa visão restrita)
  - [x] Trancar porta — tranca instantaneamente a porta mais perto (das
        salas do mapa V3, ver seção `Mapa` abaixo), sem precisar canalizar
        feito a mecânica base; usos limitados (2 por padrão); precisa estar
        perto de alguma porta pra usar
  - [x] Distrair — solta um "ping" visual; no modo solo, a IA vai atrás
        desse ponto em vez do jogador de verdade por alguns segundos; no
        modo online é só um chamariz visual (o Assassino é humano, não dá
        pra forçar ele a ir lá — mas pode enganar)
- **Ataque próprio removido do escopo por pedido direto do usuário** — não
  é "ainda não fizemos": o Sobrevivente não tem e não vai ter ataque. O
  boneco de treino que existia só pra testar esse ataque foi removido do
  jogo junto (não fazia mais sentido sem ninguém pra bater nele)
- [ ] Futuro: usar túneis/atalhos no mapa

### Sistema de captura
- [x] Ao ser atingido pelo Assassino, o Sobrevivente entra em estado de
      "capturado" (trava movimento) — `js/capture.js`
- [x] Barra de "struggle" — apertar o botão de ataque/interação repetidas
      vezes enche a barra (`Game.CONFIG.capture.pulseGain`), que também
      decai sozinha com o tempo — não dá pra só apertar uma vez e esperar
- [x] Encher a barra a tempo = escapa (com uma imunidade curta pra não ser
      recapturado na hora, colado); não encher a tempo = eliminado **daquela
      partida** (não é banimento nem afeta partidas futuras — reabrindo o
      jogo ou numa nova sala é tudo do zero de novo)
- [x] Vitória/derrota: Sobreviventes vencem completando todos os objetivos
      e escapando; Assassino vence quando todos os Sobreviventes forem
      eliminados (capturados sem escapar)

### Objetivos e skill checks
- [x] Objetivos espalhados pelo mapa (pontos de interação) — `js/objective.js`
      + `MAP.objectiveSpots` em `js/map.js`
- [x] Número de objetivos escala com a quantidade de jogadores:
      `objetivos = sobreviventes + 1` — no modo solo usa
      `Game.CONFIG.survivorCount` (fixo em 1); no modo online usa a
      quantidade real de Sobreviventes na sala
- [x] Ao interagir com um objetivo, preencher uma barra de progresso ficando
      por perto (raio/duração configuráveis em `Game.CONFIG.objective`)
- [x] Skill check circular (estilo Dead by Daylight): um ponteiro giratório,
      o jogador precisa clicar/apertar no momento certo pra não falhar —
      dispara sozinho de vez em quando enquanto o objetivo enche, reaproveita
      o mesmo botão de ataque/interação (config em `Game.CONFIG.skillCheck`)
- [x] Cooperação: no modo online, cada Sobreviventes extra perto do mesmo
      objetivo (além de quem já está preenchendo) acelera o preenchimento em
      +50% — só quem está fisicamente perto continua contando, igual antes,
      só que junto acelera em vez de não fazer diferença

### Áudio
- [x] Som de "batimento cardíaco" que aumenta de intensidade quanto mais
      perto o Assassino está de um Sobrevivente — **espacial de verdade**
      (`js/audio.js`, Web Audio API com `PannerNode`/HRTF): a posição do
      Assassino em relação ao Sobrevivente vira posição 3D no áudio, então
      o som muda de lado no fone conforme a direção real, mesmo sem o
      Assassino estar visível na tela (`Game.CONFIG.heartbeatRange`)
- [x] Efeito sonoro de ataque (golpe do Assassino)
- [x] Efeito sonoro de dano/captura
- [x] Som de passo (discreto, throttled a cada 300ms enquanto anda) — dá
      presença sonora ao jogo mesmo fora de eventos de captura/ataque
- [x] Volume master configurável (menu Configurações), persistido em
      `localStorage`; todos os sons passam por um único `GainNode` central
- [x] Música ambiente de terror — drone grave com 2 osciladores levemente
      destonados entre si (bate um zumbido tenso) e um LFO bem lento
      modulando o volume tipo uma "respiração"; toca baixinho a partida
      inteira, começa/para junto com `beginMatchUi`/`hideMatchUi`

Todos os sons são **sintetizados na hora** via osciladores (sem arquivo de
áudio, sem depender de internet) — ver `js/audio.js`. Só o Sobrevivente
ouve o batimento cardíaco (é a "audição" dele do Assassino, o Assassino não
ouve o próprio batimento). Complementando o áudio, o Sobrevivente também
tem uma bússola visual no HUD (`#killer-compass`) apontando a direção real
do Assassino quando ele está dentro do alcance do batimento — útil pra quem
joga sem fone/som ligado.

### UI/HUD
- [x] Indicador visual de cooldown de habilidades — texto simples no HUD
      (`#ability-hud`), sem ícone customizado desenhado
- [x] Barra de progresso dos objetivos (por objetivo + contador geral no HUD)
- [ ] Barra de vida (se aplicável ao personagem) — só o boneco de treino
      tem barra de HP hoje; personagens não tomam dano numérico, só
      capturam/são capturados
- [x] Indicador de estado — classes visuais (`.captured`, `.eliminated`,
      barra de struggle) mostram capturado/eliminado

### Mapa
- [x] V1: mapa fixo com colisão — dados do mapa (paredes) vivem em `js/map.js`,
      sem nenhuma referência a personagem/DOM; `js/main.js` só lê esses dados
      e desenha. Essa mesma estrutura é o ponto de partida pro sistema de
      "criar um mapa e o jogo carregar e desenhar" que é objetivo futuro
      (ver `Planos futuros` abaixo) — só falta trocar o array de paredes
      escrito à mão por um formato de tileset/arquivo de mapa carregado.
- [x] **V3: mapa com salas de verdade**, bem maior (3000×2000, era
      1800×1120) — 6 "prédios" fechados (480×360 cada, 1 porta cada) num
      campo aberto, no estilo do jogo oficial que inspirou o projeto (áreas
      fechadas de risco/recompensa entre corredores abertos pra correr). As
      paredes de cada sala são geradas a partir de retângulos + posição da
      porta (`roomsToWalls` em `js/map.js`) em vez de escritas parede por
      parede à mão — bem menos chance de errar a aritmética, e cada porta já
      sai com o retângulo exato do vão, reaproveitado tanto pra colisão
      (trancada vira parede de verdade) quanto pra saber quem está perto o
      bastante pra interagir. 2 layouts (lado da porta de cada sala + os
      obstáculos soltos do campo aberto variam; a planta das salas em si é
      fixa) sorteados por partida, mesmo esquema de sempre pro modo online
      (`MAP_LAYOUT_COUNT` em `server/server.js` batendo com
      `MAP.layouts.length`)
- [x] 8 pontos de objetivo (era 5): 4 "arriscados" dentro de sala (atrás de
      porta) + 4 "seguros" no campo aberto — a mesma tensão risco/recompensa
      do jogo oficial
- [x] Essa estrutura de dados (retângulo de sala + lado da porta) já está
      pronta pra um editor visual carregar layouts de um arquivo em vez de
      escritos à mão (ver `Planos futuros`, esse editor em si ainda não existe)

### Salas, portas e esconderijo
- [x] **Porta trancável/arrombável** (`js/door.js`, novo): parada perto de
      uma porta destrancada por `Game.CONFIG.door.lockDuration` segundos
      (3s por padrão) tranca ela — vira uma parede de verdade, ninguém
      atravessa. O Assassino **sempre** consegue arrombar ficando perto por
      `breakDuration` segundos (2s, de propósito mais rápido que trancar,
      pra nunca virar bloqueio permanente — só custa um tempo da
      perseguição). No modo online, cada cliente só simula o lado que o
      jogador local dele pode influenciar (Sobrevivente tranca, Assassino
      arromba) e sincroniza a transição por evento de rede, mesmo padrão já
      usado pra objetivo concluído
- [x] A habilidade "Barricar porta" virou **"Trancar porta"**: em vez de
      spawnar uma parede num ponto fixo do mapa, agora tranca
      instantaneamente (sem canalizar) a porta mais próxima — usos
      limitados continuam (2 por padrão)
- [x] **Esconderijo** (`js/hideout.js`, novo): 1 por sala, num canto —
      Sobrevivente entra (botão de ação) e some da visão do Assassino igual
      à Camuflagem, de graça (sem gastar habilidade), mas não pode se mexer
      enquanto escondido e é obrigado a sair sozinho depois de
      `Game.CONFIG.hideout.maxDuration` segundos (14s por padrão) — ou sai
      antes por vontade própria apertando o botão de ação de novo. No modo
      solo, a IA do Assassino esquece a posição exata do Sobrevivente
      escondido (mira no último lugar visto em vez de atravessar o
      esconderijo), senão a mecânica seria inútil sozinho
- [x] IA do Assassino no modo solo agora **arromba porta trancada** em vez
      de só desviar dela feito qualquer parede — reaproveita o mesmo desvio
      de obstáculo, só que prioriza arrombar quando a parede na frente é
      uma porta

### Câmera e iluminação
- [x] Câmera segue o jogador local em vez de encolher o mapa inteiro pra
      caber na tela — resolve o bug do celular em retrato onde o personagem
      ficava minúsculo e sobrava borda preta em cima/embaixo. Zoom maior no
      celular (1.7x) que no desktop (1.3x), travado nas bordas do mapa
      (`updateCamera` em `js/main.js`)
- [x] Iluminação/raio de visão pra **todo mundo**, não só pro Assassino, e
      agora **bloqueada por parede de verdade** (não só um círculo): um
      `<canvas id="lighting">` calcula por raycasting um polígono de
      visibilidade a cada frame (um raio pra cada canto de parede + um
      leque de raios uniformes pra manter a borda arredondada onde não tem
      parede por perto), então uma parede entre você e uma área realmente
      bloqueia a luz — a sombra "encosta" na parede — em vez de só
      escurecer por distância. Vale igual pro Assassino e pros
      Sobreviventes (`wallSegmentsScreen`/`visibilityPolygon`/`drawLighting`
      em `js/main.js`)
- [x] Legibilidade da fonte: rótulo do nome não força mais maiúsculas
      (`text-transform` removido), fonte maior e com contorno/sombra pra
      distinguir maiúscula de minúscula de longe
- [x] Rastro de poeira ao correr — efeito visual simples via CSS
      (`.dust`/`@keyframes dustFade`), sem imagem nenhuma, some sozinho

### Configurações e progressão
- [x] Menu de Configurações: volume master e sensibilidade do joystick
      touch, persistidos em `localStorage` e aplicados na hora (não precisa
      reiniciar o jogo pra sentir a mudança)
- [x] Contador local de progressão (partidas jogadas / vitórias) — mostrado
      no menu inicial e no resultado de cada partida, salvo em
      `localStorage`. É só um contador simples, **não** é um sistema de
      perks/desbloqueáveis (ver `Planos futuros`)
- [x] Tela de resultado agora mostra estatísticas da partida: duração,
      objetivos completos, e no modo online também quantos Sobreviventes
      sobreviveram

### Multiplayer
Local (mesmo teclado) foi cortado do escopo por pedido do usuário — o foco
agora é só online, com **2 modalidades**, ambas com o mesmo lobby (papel,
habilidade, início de partida) e a mesma sincronização de jogo por trás
(`js/main.js` não diferencia uma da outra — só o transporte muda):

- [x] **LAN (mesma rede Wi-Fi), via `server/server.js`:** um jogador roda o
      servidor (Node.js + `ws`) na própria máquina; os demais (PC ou
      celular) entram pelo navegador digitando o IP local do host + porta +
      senha. Não depende de internet nem de infraestrutura paga.
- [x] **P2P (WebRTC via PeerJS), via `js/net-webrtc.js` — "beta":**
      qualquer navegador (inclusive celular) pode criar a sala sem rodar
      nada além da própria página. O host roda, dentro do próprio
      navegador, a mesma lógica de sala que o `server.js` roda em Node
      (mesmas mensagens: join/chooseRole/startMatch/state/event/rematch),
      só que trafegando por WebRTC em vez de WebSocket. Só depende de
      internet no instante de conectar (usa o broker público e gratuito
      `0.peerjs.com`, só pra o "aperto de mão" inicial); o jogo em si troca
      dados direto celular-a-celular depois disso.
  - O ambiente onde isso foi desenvolvido bloqueia conexão de saída com
    `0.peerjs.com` (política de rede do sandbox), então aqui só deu pra
    validar por revisão de código + reaproveitamento da mesma lógica de
    sala já testada no modo LAN — mas já foi **testado com celulares reais
    pelo usuário** e confirmado funcionando.

Funcionalidades comuns aos dois modos (testadas de ponta a ponta com 2+
clientes reais no modo LAN):
- [x] Sala única por servidor/host, protegida por senha
- [x] Lobby com lista de jogadores + escolha de papel (1 Assassino, até
      4 Sobreviventes — `Game.CONFIG.maxSurvivors`) + escolha de habilidade
- [x] Iniciar exige pelo menos 2 jogadores, exatamente 1 Assassino, e
      todo mundo com um papel escolhido
- [x] Durante a partida: posição/animação de cada jogador é retransmitida
      pelos outros (`state`); ataques, captura, struggle, habilidades,
      objetivo concluído e fim de partida são eventos (`event`)
- [x] Vitória/derrota sincronizada pra todo mundo na sala

- [x] "Jogar de novo" volta pro lobby **da mesma sala**, sem recarregar a
      página nem precisar reentrar com IP/código/senha (`net.rematch()`)
- [x] Se o Assassino sair no meio da partida, os Sobreviventes vencem por
      desistência em vez da partida travar
- [x] Reconexão no meio da partida: cada cliente guarda um token
      (`localStorage`) e reenvia no `join`; se a conexão cair durante uma
      partida em andamento, o host/servidor guarda o lugar desse jogador por
      25s (`RECONNECT_GRACE_MS`) esperando o mesmo token voltar — aí manda
      `matchResume` com o progresso atual (objetivos já feitos, quem já foi
      eliminado) em vez de `matchStart`, e quem reconectou volta pro
      **mesmo personagem/cor**, não pra estaca zero. Passado esse tempo sem
      voltar, conta como saída definitiva (mesmo comportamento de antes).
      Implementado igual nos dois transportes (`server/server.js` e
      `js/net-webrtc.js`), testado de ponta a ponta no modo LAN.
      **Limitação conhecida:** o `matchResume` não carrega o estado de
      portas trancadas/esconderijo — quem reconecta vê as portas todas
      destrancadas de novo (cosmético, não trava nem quebra a partida).

- [x] Validação básica de posição: o relay (`server/server.js` e o host em
      `js/net-webrtc.js`) clampa deslocamento implausível entre duas
      mensagens de posição do mesmo jogador (acima de 700px/s — bem generoso
      acima da maior velocidade possível no jogo, a Investida do Assassino a
      ~484px/s) pra um "teletransporte" não se propagar pros outros
      clientes. Não é anti-cheat de verdade (continua confiando no cliente
      pra tudo mais — dano, captura, objetivo), só corta o caso mais óbvio.

**Limitações conhecidas (simplificações de propósito, não bugs):** continua
sendo um relay que confia nos clientes pra tudo além da checagem de
velocidade acima (ok pra jogar com amigos, não pra torneio competitivo); no
modo P2P, se o host fechar a aba de vez, a sala inteira cai junto (ele é o servidor)
— não tem eleição automática de um novo host. O que existe é resiliência a
quedas curtas de conexão com o broker de sinalização (`peer.on('disconnected',
() => peer.reconnect())`), que mantém a mesma sala/código no ar sem precisar
trocar de host; ver `Planos futuros` pro failover completo.

---

## Planos futuros (fora de escopo agora, mas já anotado)
- **Sistema de mapa "criar e carregar":** hoje `js/map.js` já é 100% dados
  (paredes por layout) separado da lógica de jogo — é a base certa pra
  evoluir pra: desenhar/exportar um mapa em uma ferramenta (ex: Tiled) e o
  jogo só carregar esse arquivo e desenhar em cima, em vez de ter os
  arrays de paredes escritos à mão como hoje (só 2 layouts fixos). Trocar o
  "conteúdo" do mapa sem mexer no motor de colisão/jogo.
- **Failover de host de verdade no modo P2P:** hoje só existe reconexão ao
  broker de sinalização em quedas curtas (a sala/código continuam os
  mesmos). Se a aba de quem hospedou fechar de vez, a sala cai — eleger
  outro jogador como novo host automaticamente exigiria replicar todo o
  estado da sala em mais de um cliente e sincronizar a troca no meio da
  partida; ficou de fora por ser bem mais complexo de fazer direito e
  impossível de testar de ponta a ponta neste ambiente (sem saída de rede
  pro broker WebRTC).
- **Estado "pronto" no lobby e 2ª habilidade do Sobrevivente:** as duas
  exigiriam mudar o protocolo de sala (novos tipos de mensagem/campos) nos
  **três** lugares que implementam o lobby (`server/server.js`,
  `js/net-webrtc.js` host **e** join) ao mesmo tempo — justamente a parte
  já testada de ponta a ponta e mais delicada do projeto. Ficam anotadas
  pra uma próxima rodada, feitas (e testadas) uma de cada vez, em vez de
  arriscar o núcleo de sala testado no mesmo lote de outra mudança grande.
  **Modo "2 Assassinos"**, que eu tinha sugerido antes, foi descartado a
  pedido direto do usuário — só 1 Assassino por partida, sempre.
- **Armadilha e invisibilidade do Assassino:** duas habilidades novas
  pedidas pelo usuário — a Armadilha (planta, dispara por proximidade,
  reaproveitando o mesmo padrão client-autoritativo de porta/objetivo) e a
  Invisibilidade (esconde o Assassino da bússola/batimento/HUD dos
  Sobreviventes, o oposto da Camuflagem que já existe). Ficaram de fora
  desta rodada — que já trouxe o mapa com salas/portas/esconderijo — junto
  com a decisão de design de como o Assassino escolheria uma 3ª habilidade
  (proposta: escolher 1 de 2 no lobby, no mesmo padrão que o Sobrevivente já
  usa pra escolher 1 de 4).
- **Modo espectador:** quando o Sobrevivente é eliminado e a partida ainda
  não acabou, poder assistir a câmera de quem continua vivo em vez de só
  travar a tela. Só faz sentido no modo online (no solo, ser capturado já
  vai direto pro resultado).
- **Sistema de tileset customizável:** o usuário quer poder subir o próprio
  sprite (PNG + um arquivo de config dizendo tamanho de quadro e qual
  animação é qual, formato já decidido com ele) em vez do sprite gerado
  local de hoje, caindo pro gerado automaticamente se não subir nada
  válido. É o item mais diferente dos outros (pipeline de asset novo, não
  só mais uma habilidade) — fica pra quando os outros itens desta lista
  estiverem prontos.

---

## Sprite (pixel art)
`assets/character-mask.png` é uma silhueta pixel art de 16×20px, desenhada
por um script Python (Pillow) direto nesse projeto — não foi baixada de
lugar nenhum. `css/style.css` usa ela como `mask-image` no `.torso`: o PNG
só define o "recorte" (transparência), e a cor de cada personagem continua
vindo do JS (`character.js`/`Game.CONFIG`), igual antes. Pra gerar uma
variante diferente, é só desenhar outra grade de pixels e trocar o arquivo
— não precisa mudar nada em CSS/JS.

`assets/character-walk.png` é um spritesheet de 4 frames (64×20px, também
gerado por script, mesma técnica) usado só enquanto o personagem está
correndo (`.char.running .torso`) — troca de quadro via `mask-position`
animado com `steps(4)`, técnica clássica de spritesheet em CSS puro, sem
nenhum JS controlando frame a frame. Continua sem acesso à internet pra
buscar arte pronta, então a arte em si é minimalista de propósito (ver
`Planos futuros` na rodada anterior — pedido de sprite "pronto" de algum
banco de dados/GitHub foi tentado e bloqueado pela política de rede do
ambiente onde isso foi desenvolvido, documentado então e continua valendo).

## Convenções de código
- Toda variável de balanceamento (velocidade, dano, cooldowns, duração de
  timers, etc.) deve ser configurável em um único lugar — nunca hardcoded
  espalhado pelo código
- Um único sistema de "personagem" parametrizado por tipo (Assassino /
  Sobrevivente), não dois sistemas separados duplicando lógica
- Preferir soluções simples de UI (barras, números) a assets visuais
  customizados, já que o projeto não depende de arte original
- Nomes de função e variável em português ou inglês — manter consistência
  com o que já existir no arquivo que estiver sendo editado

## Fora de escopo por agora
- Servidor dedicado / infraestrutura paga (o servidor LAN roda na máquina
  de um dos jogadores, não em nuvem; o modo P2P nem isso precisa)
- **Multiplayer local (mesmo teclado/tela)** — cortado do escopo por pedido
  direto do usuário, não é só "ainda não fizemos"
- Arte original desenhada do zero
- Mapas aleatórios (fica pra depois do mapa fixo funcionar)
- Eliminação permanente entre partidas (a eliminação por captura vale só
  pra partida atual — ver Sistema de captura)
- Anti-cheat / validação de servidor nos modos online (são relays simples,
  pensados pra jogar com amigos, não pra competição séria)
