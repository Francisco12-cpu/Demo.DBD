window.Game = window.Game || {};

// Config central de balanceamento (equivalente às @export do Godot).
// Nunca duplicar esses valores espalhados pelo código — sempre ler daqui.
Game.CONFIG = {
  // O Sobrevivente não ataca ninguém (só foge/usa habilidade) — attackXxx
  // só existe pro Assassino, cujo "ataque" inicia a captura. Um único
  // objeto de personagem por tipo continua valendo (nenhuma duplicação de
  // lógica), só que o Sobrevivente simplesmente nunca chama tryAttack().
  characters: {
    survivor: {
      speed: 180,
      color: '--survivor',
      label: 'SOBREVIVENTE',
    },
    killer: {
      speed: 205, // era 220 (+22%); +14% sobre o Sobrevivente agora, proporção mais perto do jogo original
      color: '--killer',
      label: 'ASSASSINO',
      attackCooldown: 600, // ms
      attackDuration: 350, // ms
      attackRange: 55,     // px
    },
  },
  playerRadius: 21, // raio de colisão do personagem (metade do sprite de 42px)
  killerVisionRange: 240, // px — modo online: distância normal que o Assassino enxerga um Sobrevivente sem usar Sentido
  heartbeatRange: 340, // px — modo online/solo: distância máxima em que o Sobrevivente ouve o batimento cardíaco do Assassino (funciona mesmo sem ele estar visível)
  visionRadius: 150, // px (mundo) — raio do "spotlight" ao redor do próprio personagem; na tela vira visionRadius*zoom, então precisa ser bem menor que o alcance de câmera pra sobrar área escura

  // cor de cada "vaga" de Sobrevivente na partida (índice = ordem de
  // entrada/spawn) — só pra diferenciar visualmente, sem nenhuma outra
  // diferença de gameplay entre eles
  survivorColors: ['#3f8f6f', '#4a90c2', '#c2934a', '#a15fc7'],

  // 1 jogador local no modo solo (a IA é o Assassino)
  survivorCount: 1,
  // geradores fixos em 5, igual ao jogo original — não escala mais com o
  // número de Sobreviventes (era sobreviventes+1); MAP.objectiveSpots tem
  // 8 pontos disponíveis, os 5 primeiros são usados
  generatorCount: 5,
  objective: {
    radius: 70,   // px — distância máxima do centro do objetivo pra progredir
    duration: 35, // segundos parado por perto pra completar 0% -> 100% (era 4 — partida durava segundos)
  },

  // skill check circular (estilo DBD): dispara de vez em quando enquanto o
  // objetivo enche; jogador aperta o botão de ataque/interação na hora
  // certa. Reaproveita o mesmo botão de ataque — não tem tecla extra.
  skillCheck: {
    minInterval: 2.5,      // segundos mínimos entre skill checks
    maxInterval: 5,        // segundos máximos entre skill checks
    // 32deg a 220deg/s dava uma janela de reação de ~145ms — quase
    // impossível de acertar de primeira, principalmente no toque (o dedo
    // ainda precisa alcançar o botão). Aumentado pra ~270ms, ainda exige
    // atenção mas dá pra reagir de verdade.
    zoneWidthDeg: 46,       // tamanho da zona de acerto no nível 0 (primeiro skill check do gerador)
    speedDegPerSec: 170,    // velocidade do ponteiro no nível 0
    successBonus: 0.18,     // progresso ganho ao acertar

    // dificuldade progressiva: cada ACERTO no mesmo gerador deixa o próximo
    // skill check dele um pouco mais rápido/apertado (fica "mais difícil
    // até conseguir"). Errar não muda a dificuldade nem tira progresso — só
    // obriga repetir aquele mesmo skill check (perde o tempo até ele
    // aparecer nesse nível de novo). Os limites (min/max) evitam que vire
    // impossível de acertar depois de muitos geradores reparados.
    zoneShrinkPerHit: 3,     // graus a menos na zona por acerto
    speedGainPerHit: 14,     // graus/s a mais no ponteiro por acerto
    minZoneWidthDeg: 22,     // nunca fica menor que isso
    maxSpeedDegPerSec: 320,  // nunca fica mais rápido que isso
  },

  // captura (js/capture.js) — igual ao jogo original: o 2º golpe DERRUBA
  // (não captura na hora). O Assassino precisa carregar até um gancho
  // (`MAP.hookSpots`) e pendurar; só aí começa a luta de verdade (struggle
  // bar, apertando repetido antes do tempo acabar). Outro Sobrevivente
  // pode resgatar quem tá pendurado, ou a própria pessoa pode se soltar do
  // carrego se apertar rápido o bastante antes de chegar no gancho.
  capture: {
    // fase pendurado no gancho
    duration: 6,       // segundos pendurado antes de ser sacrificado (eliminado)
    pulseGain: 0.12,    // progresso ganho por aperto, tentando se soltar
    decayPerSec: 0.05,  // progresso perdido por segundo (não dá pra só apertar uma vez e esperar)
    immunityAfterEscape: 1.5, // segundos livre de ser derrubado de novo depois de se soltar/ser resgatado (senão o Assassino recaptura na hora, colado)

    // fase derrubado -> carregado -> gancho
    pickUpRange: 55,          // px — o quão perto o Assassino precisa estar de quem caiu pra pegar
    carrySpeedMultiplier: 0.72, // Assassino anda mais devagar carregando alguém (janela de perseguição/resgate)
    wiggleGoal: 5,             // apertos necessários pra se soltar do carrego antes de chegar no gancho
    hookRange: 70,             // px — o quão perto de um gancho o Assassino precisa estar pra pendurar
    rescueRange: 55,           // px — o quão perto um Sobrevivente aliado precisa estar pra resgatar quem tá pendurado
  },

  maxSurvivors: 4, // limite de sobreviventes por partida (modo online)

  // sistema de vida (js/health.js): 1º golpe do Assassino machuca (fica
  // mais lento, sangrando, dá pra curar sozinho parado); só o 2º golpe
  // derruba de vez (aí sim entra a barra de struggle de js/capture.js) —
  // igual ao jogo original em vez de cair capturado no primeiro toque
  health: {
    injuredSpeedMultiplier: 0.85,
    healDuration: 10, // segundos parado pra curar sozinho (ferido -> saudável)
  },

  // portão de saída (js/gate.js): só pode ser aberto depois que todos os
  // geradores forem concluídos. Sobrevivente canaliza parado perto por
  // `openDuration`; uma vez aberto, fica aberto pro resto da partida —
  // qualquer Sobrevivente que chegar perto depois disso escapa na hora
  gate: {
    radius: 130,
    openDuration: 15,
  },

  // portas das salas (js/door.js): Sobrevivente tranca ficando perto (sem o
  // Assassino por perto) por `lockDuration`; o Assassino sempre consegue
  // arrombar ficando perto por `breakDuration` — mais rápido que trancar de
  // propósito, pra nunca virar um bloqueio permanente
  door: {
    lockDuration: 3,
    breakDuration: 2,
    radius: 80,
  },

  // esconderijos (armário/mesa, js/hideout.js): Sobrevivente entra parado
  // perto de um ponto de esconderijo; some da visão do Assassino igual
  // Camuflagem, mas sem gastar habilidade — em troca, não pode se mexer
  // enquanto escondido e é obrigado a sair sozinho depois de `maxDuration`
  hideout: {
    radius: 40,        // precisa estar bem perto pra entrar/sair
    maxDuration: 14,   // segundos — depois disso sai forçado
    // ficar parado escondido tempo demais faz barulho: depois de
    // `noiseAfter` segundos escondido, o jogo revela a posição pro
    // Assassino (som + marcador no mapa) a cada `noiseInterval` segundos,
    // até sair (por vontade ou forçado em maxDuration). Ajuste esses dois
    // números pra deixar mais fácil ou mais arriscado ficar escondido.
    noiseAfter: 6,      // segundos escondido até começar a fazer barulho
    noiseInterval: 3,   // segundos entre cada barulho, depois de noiseAfter
  },

  // Sobrevivente controlado pela IA (modo solo, jogando de Assassino) —
  // foge do Assassino, repara geradores sozinho e tenta escapar pelo
  // portão. Espelha `characters.killer` (IA que persegue no modo solo
  // normal), só que fugindo em vez de perseguindo.
  survivorAI: {
    speedMultiplier: 0.96,  // um pouco mais devagar que o Assassino, senão nunca dá pra alcançar
    fleeRange: 260,         // px — a essa distância do Assassino, larga o gerador e foge
    // "reação" ao skill check: chance por segundo de tentar apertar
    // enquanto ele está ativo (não é acerto garantido — ainda depende de
    // estar no ângulo certo, igual ao jogador)
    reactionChancePerSecond: 2.2,
    struggleInterval: 0.6,  // segundos entre cada "puxão" de luta quando capturado
  },

  // ---------- habilidades (passo 7) ----------
  // Assassino tem sempre as duas; Sobrevivente escolhe 1 das 4 antes de
  // entrar. Todas seguem o mesmo objeto { duration, cooldown, ... } lido
  // por js/ability.js — nunca hardcoded fora daqui.
  abilities: {
    killerSense: {
      label: 'Sentido',
      duration: 4,     // segundos revelando todos os Sobreviventes através das paredes
      cooldown: 18,
    },
    killerDash: {
      label: 'Investida',
      duration: 1.2,   // segundos de velocidade aumentada
      cooldown: 10,
      speedMultiplier: 2.2,
    },
    survivor: {
      sprint: {
        label: 'Sprint',
        duration: 3,
        cooldown: 12,
        speedMultiplier: 1.6,
      },
      camouflage: {
        label: 'Camuflagem',
        duration: 6,     // segundos invisível pro Sentido do Assassino
        cooldown: 16,
      },
      barricade: {
        label: 'Trancar porta',
        duration: 8,     // segundos que a porta fica trancada instantaneamente (sem canalizar)
        cooldown: 0,
        maxUses: 2,      // usos limitados por partida, não infinito
        radius: 90,       // precisa estar perto de alguma porta (a mais próxima) pra usar
      },
      distract: {
        label: 'Distrair',
        duration: 5,     // segundos que o "ruído" falso dura
        cooldown: 14,
      },
    },
  },
};
