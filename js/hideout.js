window.Game = window.Game || {};

(function(){
  "use strict";

  // Esconderijo (armário/mesa): o Sobrevivente entra parado perto de um
  // ponto de esconderijo (`Game.CONFIG.hideout.radius`) e some da visão do
  // Assassino igual à habilidade Camuflagem, só que de graça (sem gastar
  // cooldown/uso) — em troca não pode se mexer enquanto escondido, e é
  // obrigado a sair sozinho depois de `maxDuration` segundos.
  function createHideout(){
    const state = { hidden: false, timeLeft: 0 };

    function enter(){
      if (state.hidden) return;
      state.hidden = true;
      state.timeLeft = Game.CONFIG.hideout.maxDuration;
    }

    function exit(){
      state.hidden = false;
      state.timeLeft = 0;
    }

    // retorna true se acabou de sair forçado (útil pra quem chama avisar/tocar som)
    function update(delta){
      if (!state.hidden) return false;
      state.timeLeft -= delta;
      if (state.timeLeft <= 0){
        exit();
        return true;
      }
      return false;
    }

    return { state, enter, exit, update };
  }

  Game.createHideout = createHideout;
})();
