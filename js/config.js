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
};
