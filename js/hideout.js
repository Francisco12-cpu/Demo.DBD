window.Game = window.Game || {};

(function(){
  "use strict";

  // Esconderijo (armário/mesa): o Sobrevivente entra parado perto de um
  // ponto de esconderijo (`Game.CONFIG.hideout.radius`) e some da visão do
  // Assassino igual à habilidade Camuflagem, só que de graça (sem gastar
  // cooldown/uso) — em troca não pode se mexer enquanto escondido, e é
  // obrigado a sair sozinho depois de `maxDuration` segundos.
  function createHideout(){
    /**
     * @typedef {Object} HideoutState
     * @property {boolean} hidden
     * @property {number} timeLeft - segundos até a saída forçada
     * @property {number} hiddenFor - segundos escondido nesta entrada (reseta ao sair)
     * @property {number} reentryLockedUntil - performance.now() até quando enter() é recusado
     */
    /** @type {HideoutState} */
    const state = { hidden: false, timeLeft: 0, hiddenFor: 0, reentryLockedUntil: 0 };
    let nextNoiseAt = 0;

    // retorna false se recusou (ainda em cooldown de reentrada — ver
    // reentryCooldown no config, fecha o exploit de sair/entrar rápido pra
    // resetar hiddenFor sem nunca fazer barulho)
    function enter(){
      if (state.hidden) return false;
      if (performance.now() < state.reentryLockedUntil) return false;
      state.hidden = true;
      state.timeLeft = Game.CONFIG.hideout.maxDuration;
      state.hiddenFor = 0;
      nextNoiseAt = Game.CONFIG.hideout.noiseAfter;
      return true;
    }

    function exit(){
      state.hidden = false;
      state.timeLeft = 0;
      state.hiddenFor = 0;
      state.reentryLockedUntil = performance.now() + Game.CONFIG.hideout.reentryCooldown * 1000;
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
