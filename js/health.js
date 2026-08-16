window.Game = window.Game || {};

(function(){
  "use strict";

  // Sistema de vida do Sobrevivente (2 golpes, igual ao jogo original):
  // saudável -> 1º golpe do Assassino -> ferido (mais lento, sangrando,
  // dá pra curar sozinho parado) -> 2º golpe -> caído (aí sim entra a
  // barra de struggle de js/capture.js, que continua sem mudança nenhuma).
  // Escapar da struggle NÃO cura sozinho — continua ferido até curar.
  function createHealth(el){
    /**
     * @typedef {Object} HealthState
     * @property {boolean} injured - true após o 1º golpe (mais lento, cura sozinho parado)
     * @property {number} healProgress - 0..1
     */
    /** @type {HealthState} */
    const state = { injured: false, healProgress: 0 };

    function hit(){
      state.injured = true;
      el.classList.add('injured');
    }

    function heal(){
      state.injured = false;
      state.healProgress = 0;
      el.classList.remove('injured');
    }

    function reset(){
      heal();
    }

    // healing: true só quando o jogador está ferido, parado, e não
    // capturado/escondido — quem chama decide essas condições (main.js já
    // sabe se está parado, é o mesmo sinal usado pra dar bob/animação)
    function update(delta, healing){
      if (!state.injured) return false;
      const cfg = Game.CONFIG.health;
      if (healing){
        state.healProgress += delta / cfg.healDuration;
        if (state.healProgress >= 1){
          heal();
          return true; // acabou de curar agora
        }
      } else if (state.healProgress > 0){
        state.healProgress = Math.max(0, state.healProgress - delta * cfg.healDecayRate);
      }
      return false;
    }

    return { state, hit, heal, reset, update };
  }

  Game.createHealth = createHealth;
})();
