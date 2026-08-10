window.Game = window.Game || {};

(function(){
  "use strict";

  // Esconderijo (armário/mesa): o Sobrevivente entra parado perto de um
  // ponto de esconderijo (`Game.CONFIG.hideout.radius`) e some da visão do
  // Assassino igual à habilidade Camuflagem, só que de graça (sem gastar
  // cooldown/uso) — em troca não pode se mexer enquanto escondido, e é
  // obrigado a sair sozinho depois de `maxDuration` segundos.
  function createHideout(){
    const state = { hidden: false, timeLeft: 0, hiddenFor: 0 };
    let nextNoiseAt = 0;

    function enter(){
      if (state.hidden) return;
      state.hidden = true;
      state.timeLeft = Game.CONFIG.hideout.maxDuration;
      state.hiddenFor = 0;
      nextNoiseAt = Game.CONFIG.hideout.noiseAfter;
    }

    function exit(){
      state.hidden = false;
      state.timeLeft = 0;
      state.hiddenFor = 0;
    }

    // retorna { forcedExit, madeNoise } — forcedExit quando o tempo máximo
    // acaba (útil pra quem chama avisar/tocar som), madeNoise quando ficou
    // escondido tempo demais e acabou de entregar a posição pro Assassino.
    function update(delta){
      const result = { forcedExit: false, madeNoise: false };
      if (!state.hidden) return result;
      state.timeLeft -= delta;
      state.hiddenFor += delta;
      if (state.timeLeft <= 0){
        exit();
        result.forcedExit = true;
        return result;
      }
      const cfg = Game.CONFIG.hideout;
      if (state.hiddenFor >= nextNoiseAt){
        nextNoiseAt += cfg.noiseInterval;
        result.madeNoise = true;
      }
      return result;
    }

    return { state, enter, exit, update };
  }

  Game.createHideout = createHideout;
})();
