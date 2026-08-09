window.Game = window.Game || {};

(function(){
  "use strict";

  // Estado genérico de uma habilidade: fica "ativa" por `duration`, depois
  // entra em cooldown por `cooldown`. `maxUses` (opcional) limita o total
  // de usos na partida (ex: barricar porta). O efeito em si (o que
  // acontece enquanto está ativa) fica por conta de quem chama — esse
  // objeto só cuida do tempo, igual pro Assassino e pro Sobrevivente.
  function createAbility(cfg){
    const state = {
      cooldownLeft: 0,
      activeLeft: 0,
      usesLeft: cfg.maxUses === undefined ? Infinity : cfg.maxUses,
    };

    function ready(){
      return state.cooldownLeft <= 0 && state.activeLeft <= 0 && state.usesLeft > 0;
    }

    function trigger(){
      if (!ready()) return false;
      state.activeLeft = cfg.duration;
      state.usesLeft -= 1;
      return true;
    }

    function update(delta){
      if (state.activeLeft > 0){
        state.activeLeft = Math.max(0, state.activeLeft - delta);
        if (state.activeLeft === 0) state.cooldownLeft = cfg.cooldown;
      } else if (state.cooldownLeft > 0){
        state.cooldownLeft = Math.max(0, state.cooldownLeft - delta);
      }
    }

    return { cfg, state, ready, trigger, update };
  }

  Game.createAbility = createAbility;
})();
