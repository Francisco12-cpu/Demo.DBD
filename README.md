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

## Ordem de desenvolvimento (seguir esta prioridade)
1. Movimento básico (teclado, depois gamepad)
2. Mapa fixo com colisão
3. Sistema de objetivo (ficar perto de um ponto, barra de progresso enche)
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
- [ ] Movimento em 8 direções via teclado (WASD + setas)
- [ ] Suporte a controle/gamepad
- [ ] Sprite vira (flip horizontal) ao mudar de direção esquerda/direita
- [ ] Animação "parado" (idle)
- [ ] Animação "correr" (enquanto há input de movimento)
- [ ] Animação "matar"/ataque (trava movimento durante a execução)
- [ ] Velocidade como variável configurável por personagem (não hardcoded)

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
- [ ] Objetivos espalhados pelo mapa (pontos de interação)
- [ ] Número de objetivos escala com a quantidade de jogadores:
      `objetivos = sobreviventes + 1`
- [ ] Ao interagir com um objetivo, preencher uma barra de progresso ficando
      por perto
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
- [ ] Barra de progresso dos objetivos
- [ ] Barra de vida (se aplicável ao personagem)
- [ ] Indicador de estado (ex: "capturado", "struggle ativo")

### Mapa
- [ ] V1: mapa fixo com colisão
- [ ] V2: randomização de elementos do mapa (não é a versão inicial —
      cuidado ao migrar de fixo pra aleatório sem quebrar o código já feito;
      manter o gerador de mapa desacoplado da lógica de jogo desde o início)

### Multiplayer
- [ ] Local: múltiplos jogadores no mesmo teclado/tela, cada um com seu
      próprio conjunto de teclas (e/ou controles físicos)
- [ ] Online: P2P direto entre jogadores, sem servidor dedicado pago
      (avaliar WebRTC ou solução equivalente sem custo de infraestrutura)

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
