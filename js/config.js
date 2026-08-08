window.Game = window.Game || {};

// Config central de balanceamento (equivalente às @export do Godot).
// Nunca duplicar esses valores espalhados pelo código — sempre ler daqui.
Game.CONFIG = {
  characters: {
    survivor: {
      speed: 180,
      color: '--survivor',
      label: 'SOBREVIVENTE',
      attackDamage: 25,
      attackCooldown: 600, // ms
      attackDuration: 350, // ms
      attackRange: 55,     // px
    },
    killer: {
      speed: 220,
      color: '--killer',
      label: 'ASSASSINO',
      attackDamage: 25,
      attackCooldown: 600,
      attackDuration: 350,
      attackRange: 55,
    },
  },
  playerRadius: 21, // raio de colisão do personagem (metade do sprite de 42px)

  // objetivos = sobreviventes + 1 (regra do README). Só existe 1 jogador
  // local por enquanto, então isso vira variável assim que houver mais.
  survivorCount: 1,
  objective: {
    radius: 70,   // px — distância máxima do centro do objetivo pra progredir
    duration: 4,  // segundos parado por perto pra completar 0% -> 100%
  },

  // skill check circular (estilo DBD): dispara de vez em quando enquanto o
  // objetivo enche; jogador aperta o botão de ataque/interação na hora
  // certa. Reaproveita o mesmo botão de ataque — não tem tecla extra.
  skillCheck: {
    minInterval: 2.5,      // segundos mínimos entre skill checks
    maxInterval: 5,        // segundos máximos entre skill checks
    zoneWidthDeg: 32,       // tamanho da zona de acerto, em graus
    speedDegPerSec: 220,    // velocidade do ponteiro giratório
    successBonus: 0.18,     // progresso ganho ao acertar
    failPenalty: 0.12,      // progresso perdido ao errar/deixar passar
  },

  // captura: ao ser atingido pelo Assassino, o Sobrevivente trava e precisa
  // "lutar" apertando repetidamente antes do tempo acabar
  capture: {
    duration: 6,       // segundos pra tentar escapar antes de ser eliminado da partida
    pulseGain: 0.12,    // progresso ganho por aperto
    decayPerSec: 0.05,  // progresso perdido por segundo (não dá pra só apertar uma vez e esperar)
    immunityAfterEscape: 1.5, // segundos livre de captura de novo depois de escapar (senão o Assassino recaptura na hora, colado)
  },

  maxSurvivors: 4, // limite de sobreviventes por partida (modo online)
};
