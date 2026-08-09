window.Game = window.Game || {};

(function(){
  "use strict";

  // Portão de saída (fase final, igual ao jogo original): só pode ser
  // canalizado depois que todos os geradores forem concluídos
  // (`active` controla isso — main.js só chama progressOpen quando os
  // geradores já terminaram). Uma vez aberto, fica aberto pro resto da
  // partida — não tem "fechar de novo".
  function createGate(pos, el){
    const state = { pos, open: false, progress: 0 };

    function render(){
      el.classList.toggle('open', state.open);
      el.style.setProperty('--gate-progress', Math.round(state.progress * 100) + '%');
    }

    // survivorNear: Sobrevivente ativo (não capturado/escondido) dentro do
    // raio do portão, no cliente local. active: geradores já concluídos?
    function progressOpen(delta, survivorNear, active){
      if (state.open || !active) return false;
      const cfg = Game.CONFIG.gate;
      if (survivorNear){
        state.progress += delta / cfg.openDuration;
        if (state.progress >= 1){
          state.open = true;
          state.progress = 0;
          render();
          return true;
        }
      } else if (state.progress > 0){
        state.progress = Math.max(0, state.progress - delta * 0.3);
      }
      render();
      return false;
    }

    function setOpen(open){
      state.open = open;
      state.progress = 0;
      render();
    }

    render();
    return { state, progressOpen, setOpen, render };
  }

  Game.createGate = createGate;
})();
