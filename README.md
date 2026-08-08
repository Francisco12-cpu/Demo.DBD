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
Projeto estático — abrir `index.html` direto no navegador é suficiente para
protótipos. Se o multiplayer P2P precisar de HTTPS/contexto seguro para
APIs do navegador, rodar com um servidor local simples (ex: `npx serve`).

**Jogar pela web:** existe um workflow (`.github/workflows/deploy-pages.yml`)
que publica o site automaticamente no GitHub Pages a cada push na `main`.
Falta só um passo manual único do dono do repositório: em
`Settings → Pages → Source`, escolher **GitHub Actions**. Depois disso o link
público (formato `https://<usuário>.github.io/<repo>/`) fica sempre
atualizado e é o que dá pra mandar pros amigos testarem sem precisar baixar
nada.

## Estrutura do projeto
```
index.html            esqueleto HTML + tags <script>
css/style.css          todo o CSS (visual, animações, controles touch)
js/config.js            config central de balanceamento por tipo de personagem
js/map.js                dados do mapa fixo (paredes) + colisão, sem depender de DOM
js/input.js              teclado + joystick touch + gamepad, unificados
js/character.js          personagem único parametrizado (movimento/ataque/visual)
js/main.js                monta o mapa, roda o game loop, liga o painel de config
```
Tudo em `<script>` clássico (sem `type="module"`, sem bundler) pra continuar
funcionando ao abrir `index.html` direto com duplo clique.

## Ordem de desenvolvimento (seguir esta prioridade)
1. ~~Movimento básico (teclado, depois gamepad)~~ feito (+ touch)
2. ~~Mapa fixo com colisão~~ feito
3. ~~Sistema de objetivo (ficar perto de um ponto, barra de progresso enche)~~ feito
4. Skill check (mini-jogo do círculo giratório)
5. Segundo personagem (Assassino) e sua diferenciação de gameplay
6. Captura + barra de "struggle" (escapar sendo capturado)
7. Habilidades/poderes de cada personagem
8. Multiplayer local (vários controles no mesmo PC)
9. Multiplayer online (P2P, sem servidor dedicado)

Não pular etapas: cada uma depende da anterior estar jogável.

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
- [ ] Mais rápido que os Sobreviventes (velocidade maior, configurável)
- [ ] Ataque básico: espada curta — exige estar bem perto do alvo
  - [ ] Cooldown pequeno entre ataques
  - [ ] Hitbox/zona de colisão de dano
  - [ ] Anima "matar" no alvo atingido
- [ ] Poder 1: "Sentido" — consegue ver a posição dos Sobreviventes
      (avaliar viabilidade; se complexo demais, pode virar Invisibilidade)
- [ ] Poder 2: Dash / aumento de velocidade temporário
- [ ] Habilidades têm cooldown visível na UI

### Sobreviventes (até 3 jogadores por partida)
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
- [ ] Ao ser atingido pelo Assassino, o Sobrevivente entra em estado de
      "capturado"
- [ ] Barra de "struggle" — o jogador precisa interagir (ex: clicar/apertar
      repetidamente) para tentar escapar antes do tempo acabar
- [ ] Capturado reaparece após X segundos (não é eliminação permanente —
      X deve ser uma variável configurável)

### Objetivos e skill checks
- [x] Objetivos espalhados pelo mapa (pontos de interação) — `js/objective.js`
      + `MAP.objectiveSpots` em `js/map.js`
- [x] Número de objetivos escala com a quantidade de jogadores:
      `objetivos = sobreviventes + 1` (hoje `Game.CONFIG.survivorCount = 1`
      fixo, já que multiplayer ainda não existe; vira dinâmico quando existir)
- [x] Ao interagir com um objetivo, preencher uma barra de progresso ficando
      por perto (raio/duração configuráveis em `Game.CONFIG.objective`)
- [ ] Skill check circular (estilo Dead by Daylight): um ponteiro giratório,
      o jogador precisa clicar/apertar no momento certo pra não falhar

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
Existem 3 modalidades (não 2) — decisão registrada aqui pra não se perder:
- [ ] Local: múltiplos jogadores no mesmo teclado/tela, cada um com seu
      próprio conjunto de teclas (e/ou controles físicos)
- [ ] **LAN (mesma rede Wi-Fi):** modalidade intermediária pedida
      explicitamente pelo usuário. Decisão: um jogador roda um servidor leve
      em Node.js na própria máquina (ex: WebSocket); os demais celulares/PCs
      na mesma rede entram digitando o IP local no navegador. Não depende de
      internet nem de infraestrutura paga — só do host estar na mesma rede.
      Implementar depois que o jogo solo (passos 1-7) estiver completo.
- [ ] Online: P2P direto entre jogadores pela internet, sem servidor dedicado
      pago (avaliar WebRTC ou solução equivalente sem custo de infraestrutura)

---

## Planos futuros (fora de escopo agora, mas já anotado)
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
- Servidor dedicado / infraestrutura paga
- Arte original desenhada do zero
- Mapas aleatórios (fica pra depois do mapa fixo funcionar)
- Eliminação permanente do Sobrevivente capturado
