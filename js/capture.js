window.Game = window.Game || {};

(function(){
  "use strict";

  // Estado de "capturado" de um Sobrevivente: trava o personagem, mostra
  // uma barra de struggle que enche a cada aperto do jogador dentro do
  // tempo limite. Encher a tempo = escapa; não encher = eliminado da
  // partida (eliminação é só daquela partida, não é permanente entre
  // partidas — a "captura" normal do README continua existindo à parte).
  function createCapture(el){
    const bar = document.createElement('div');
    bar.className = 'struggle-bar';
    bar.innerHTML = '<div class="struggle-fill"></div>';
    el.appendChild(bar);
    const fill = bar.querySelector('.struggle-fill');

    const state = { captured: false, eliminated: false, progress: 0, timeLeft: 0, immunity: 0 };
    let onResolve = null; // (result: 'escaped'|'eliminated') => void

    function start(onResolveCb){
      if (state.eliminated || state.captured || state.immunity > 0) return;
      const cfg = Game.CONFIG.capture;
      state.captured = true;
      state.progress = 0;
      state.timeLeft = cfg.duration;
      onResolve = onResolveCb;
      el.classList.add('captured');
      bar.style.display = 'block';
    }

    function pulse(){
      if (!state.captured) return;
      const cfg = Game.CONFIG.capture;
      state.progress = Math.min(1, state.progress + cfg.pulseGain);
      fill.style.width = (state.progress * 100) + '%';
      if (state.progress >= 1) resolve('escaped');
    }

    function resolve(result){
      state.captured = false;
      bar.style.display = 'none';
      el.classList.remove('captured');
      if (result === 'eliminated'){
        state.eliminated = true;
        el.classList.add('eliminated');
      } else {
        state.immunity = Game.CONFIG.capture.immunityAfterEscape;
      }
      const cb = onResolve;
      onResolve = null;
      if (cb) cb(result);
    }

    function update(delta){
      if (state.immunity > 0) state.immunity = Math.max(0, state.immunity - delta);
      if (!state.captured) return;
      state.timeLeft -= delta;
      // decai um pouco com o tempo, então só apertar de vez em quando não basta
      state.progress = Math.max(0, state.progress - Game.CONFIG.capture.decayPerSec * delta);
      fill.style.width = (state.progress * 100) + '%';
      if (state.timeLeft <= 0) resolve('eliminated');
    }

    return { state, start, pulse, update };
  }

  Game.createCapture = createCapture;
})();
