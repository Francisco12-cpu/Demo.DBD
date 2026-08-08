# CLAUDE.md

Este arquivo orienta o Claude Code ao trabalhar neste repositório.

## Visão geral do projeto

**Assassino vs Sobreviventes** — jogo assimétrico competitivo (estilo Dead by
Daylight simplificado): 1 jogador é o Assassino, os demais são Sobreviventes
tentando completar objetivos e escapar de uma mansão abandonada.

- **Plataforma:** HTML/CSS/JS puro, rodando direto no navegador (sem build
  step, sem framework pesado — simples de rodar abrindo o `index.html`)
- **Distribuição:** joga na web (ex: itch.io); sem servidor pago
- **Modos:** multiplayer local (vários controles no mesmo PC/teclado) →
  depois multiplayer online P2P (sem servidor dedicado)
- **Arte:** pixel art; sprites pegos prontos da internet e editados por cima
  (o projeto não depende de arte original desenhada do zero)
- **Mapas:** começa com 1 mapa fixo; randomização de mapa é objetivo futuro

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
celular, contanto que estejam na mesma rede — escolhe "Multiplayer LAN
(beta)", digita o IP do host + porta + senha, entra na sala, escolhe o papel
(1 Assassino, até 4 Sobreviventes) e qualquer um pode apertar "Iniciar
partida" quando tiver pelo menos 2 jogadores com 1 deles sendo o Assassino.

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
js/map.js                   dados do mapa fixo (paredes, spawns, objetivos) + colisão
js/input.js                 teclado + joystick touch + gamepad, unificados
js/character.js             personagem único parametrizado (movimento/ataque/visual)
js/objective.js             objetivo com barra de progresso + skill check circular
js/capture.js               estado "capturado" + barra de struggle
js/net.js                   cliente WebSocket fino pro modo online
js/menu.js                  telas de menu, lobby e resultado
js/main.js                  monta o mundo, roda o modo solo ou o modo online
server/server.js            servidor da sala (Node.js + ws) pro modo LAN
server/package.json         dependência (ws) e script `npm start`
```
Client em `<script>` clássico (sem `type="module"`, sem bundler) pra
continuar funcionando ao abrir `index.html` direto com duplo clique. O
servidor é a única parte que precisa de Node.js instalado.

## Ordem de desenvolvimento (seguir esta prioridade)
1. ~~Movimento básico (teclado, depois gamepad)~~ feito (+ touch)
2. ~~Mapa fixo com colisão~~ feito
3. ~~Sistema de objetivo (ficar perto de um ponto, barra de progresso enche)~~ feito
4. ~~Skill check (mini-jogo do círculo giratório)~~ feito
5. ~~Segundo personagem (Assassino) e sua diferenciação de gameplay~~ feito
   (IA no modo solo; jogador real no modo online)
6. ~~Captura + barra de "struggle"~~ feito, com vitória/derrota de verdade
7. Habilidades/poderes de cada personagem
8. Multiplayer local (vários controles no mesmo PC) — ainda não feito
9. ~~Multiplayer online~~ feito **fora de ordem**, a pedido explícito do
   usuário: LAN (mesma rede) em vez de P2P pela internet — ver seção
   Multiplayer abaixo. Local (passo 8) continua pendente.

Pulamos o passo 8 por pedido direto — registrado aqui pra não parecer
inconsistência com a regra "não pular etapas" de cima.

---

## Lista completa de funcionalidades

### Movimento e controles
- [x] Movimento em 8 direções via teclado (WASD + setas)
- [x] Suporte a controle/gamepad
- [x] Controle touch (joystick virtual + botão de ataque) pra jogar no
      celular sem depender de controle físico
- [x] Sprite vira (flip horizontal) ao mudar de direção esquerda/direita
- [x] Animação "parado" (idle)
- [x] Animação "correr" (enquanto há input de movimento)
- [x] Animação "matar"/ataque (trava movimento durante a execução)
- [x] Velocidade como variável configurável por personagem (não hardcoded)

### Menu e seleção de personagem
- [ ] Menu inicial para escolher: Assassino ou Sobrevivente
- [ ] A escolha define todos os parâmetros do personagem (velocidade,
      habilidades disponíveis, animações, etc.) — um único sistema de
      personagem parametrizado, não código duplicado
- [ ] Sobreviventes escolhem 1 habilidade adicional no menu antes de entrar

### Assassino (1 jogador por partida)
- [x] Mais rápido que os Sobreviventes (velocidade maior, configurável)
- [x] Ataque básico: espada curta — exige estar bem perto do alvo
  - [x] Cooldown pequeno entre ataques
  - [x] Hitbox/zona de colisão de dano
  - [x] Anima "matar" no alvo atingido — no modo online, atingir um
        Sobrevivente inicia a captura de verdade (struggle bar); no modo
        solo continua sendo um flash visual, já que lá o "alvo" é só a IA
        testando distância/cooldown
- [ ] Poder 1: "Sentido" — consegue ver a posição dos Sobreviventes
      (avaliar viabilidade; se complexo demais, pode virar Invisibilidade)
- [ ] Poder 2: Dash / aumento de velocidade temporário
- [ ] Habilidades têm cooldown visível na UI

**Nota:** no modo solo o Assassino continua sendo uma IA simples (anda
direto na direção do Sobrevivente, sem desvio de obstáculo, e ataca ao
alcançar) — é só um jeito de testar sozinho. No **modo online** o Assassino
é um jogador de verdade, controlado por quem escolheu esse papel na sala.

### Sobreviventes (até 4 jogadores por partida)
- [ ] Velocidade base mais lenta que o Assassino
- [ ] Escolhem 1 habilidade no menu, entre:
  - [ ] Sprint (corrida temporária)
  - [ ] Camuflagem
  - [ ] Barricar portas (usos limitados, não infinito)
  - [ ] Chamar atenção (distrair o Assassino)
- [ ] Ataque próprio (opcional/defensivo), com 2 variantes à escolha:
  - [ ] Ataque rápido — cooldown curto, dano menor
  - [ ] Ataque forte — cooldown longo, dano maior
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

### Áudio
- [ ] Som de "batimento cardíaco" que aumenta de intensidade quanto mais
      perto o Assassino está de um Sobrevivente
- [ ] Efeito sonoro de ataque
- [ ] Efeito sonoro de dano/captura

### UI/HUD
- [ ] Indicador visual de cooldown de habilidades (barra ou ícone com número
      — solução simples, sem ícones customizados desenhados)
- [x] Barra de progresso dos objetivos (por objetivo + contador geral no HUD)
- [ ] Barra de vida (se aplicável ao personagem)
- [ ] Indicador de estado (ex: "capturado", "struggle ativo")

### Mapa
- [x] V1: mapa fixo com colisão — dados do mapa (paredes) vivem em `js/map.js`,
      sem nenhuma referência a personagem/DOM; `js/main.js` só lê esses dados
      e desenha. Essa mesma estrutura é o ponto de partida pro sistema de
      "criar um mapa e o jogo carregar e desenhar" que é objetivo futuro
      (ver `Planos futuros` abaixo) — só falta trocar o array de paredes
      escrito à mão por um formato de tileset/arquivo de mapa carregado.
- [ ] V2: randomização de elementos do mapa (não é a versão inicial —
      cuidado ao migrar de fixo pra aleatório sem quebrar o código já feito;
      manter o gerador de mapa desacoplado da lógica de jogo desde o início)

### Multiplayer
Existem 3 modalidades — decisão registrada aqui pra não se perder:
- [ ] Local: múltiplos jogadores no mesmo teclado/tela, cada um com seu
      próprio conjunto de teclas (e/ou controles físicos) — ainda não feito
- [x] **LAN (mesma rede Wi-Fi) — "beta":** um jogador roda `server/server.js`
      (Node.js + `ws`) na própria máquina; os demais (PC ou celular) entram
      pelo navegador digitando o IP local do host + porta + senha. Não
      depende de internet nem de infraestrutura paga.
  - [x] Sala única por servidor, protegida por senha
  - [x] Lobby com lista de jogadores + escolha de papel (1 Assassino, até
        4 Sobreviventes — `Game.CONFIG.maxSurvivors`)
  - [x] Iniciar exige pelo menos 2 jogadores, exatamente 1 Assassino, e
        todo mundo com um papel escolhido
  - [x] Durante a partida: posição/animação de cada jogador é retransmitida
        pelos outros (`state`); ataques, captura, struggle, objetivo
        concluído e fim de partida são eventos (`event`) — ver mensagens
        em `server/server.js`
  - [x] Vitória/derrota sincronizada pra todo mundo na sala
  - **Limitações conhecidas (simplificações de propósito, não bugs):** é um
    relay simples sem validação/anti-cheat (confia nos clientes — ok pra
    jogar com amigos, não pra torneio competitivo); cada objetivo só conta
    o progresso de quem está fisicamente perto dele (sem "encher mais
    rápido" cooperativamente com vários Sobreviventes no mesmo objetivo);
    "Jogar de novo" recarrega a página, então quem estava numa sala online
    precisa reentrar com IP/senha de novo; entrada só por IP + senha (sem
    QR code ainda, ver Planos futuros); se o Assassino cair a partida trava
    (sem tratamento de desconexão do papel principal ainda)
- [ ] Online pela internet: P2P direto entre jogadores, sem servidor
      dedicado pago (avaliar WebRTC ou solução equivalente) — ainda não
      feito; o modo LAN acima cobre "jogar com quem está perto" por agora

---

## Planos futuros (fora de escopo agora, mas já anotado)
- **Entrar na sala por QR code:** mais fácil que digitar IP+senha no
  celular; adiado porque IP+senha já funciona e QR é mais complexo de
  gerar/ler sem biblioteca externa. Pode entrar como alternativa ao IP,
  não substituindo a senha.
- **Reconexão/tratamento de desconexão do Assassino em partida:** hoje só o
  desconectar de um Sobrevivente é tratado (conta como eliminado); o
  servidor não tem um plano B se o Assassino cair no meio do jogo.
- **Sprites em pixel art:** trocar os retângulos/CSS atuais por sprites de
  verdade — a maioria com folhas de animação (spritesheet) e usando tileset
  pro cenário. Sprites pegos prontos/editados, não arte original do zero
  (ver seção "Arte" acima). Só entra depois que a jogabilidade das etapas
  1-7 estiver validada com os placeholders simples de hoje.
- **Sistema de mapa "criar e carregar":** hoje `js/map.js` já é 100% dados
  (lista de paredes) separado da lógica de jogo — é a base certa pra evoluir
  pra: desenhar/exportar um mapa em uma ferramenta (ex: Tiled) e o jogo só
  carregar esse arquivo e desenhar em cima, em vez de ter o array de paredes
  escrito à mão como está agora. Trocar o "conteúdo" do mapa sem mexer no
  motor de colisão/jogo.

---

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
  de um dos jogadores, não em nuvem)
- Arte original desenhada do zero
- Mapas aleatórios (fica pra depois do mapa fixo funcionar)
- Eliminação permanente entre partidas (a eliminação por captura vale só
  pra partida atual — ver Sistema de captura)
- Anti-cheat / validação de servidor no modo LAN (é um relay simples,
  pensado pra jogar com amigos na mesma rede)
