window.Game = window.Game || {};

(function(){
  "use strict";

  // Porta de sala (mapa V3, ver js/map.js): qualquer Sobrevivente perto
  // (sem o Assassino perto) tranca ela ficando por perto por
  // `Game.CONFIG.door.lockDuration` segundos — igual ao jeito que um
  // objetivo enche, só que sem skill check. Trancada, o retângulo do vão
  // vira uma parede de verdade (ver allWalls() em js/main.js). O Assassino
  // sempre consegue arrombar ficando perto por `breakDuration` segundos —
  // de propósito mais rápido que trancar, pra nunca virar bloqueio
  // permanente, só custar um tempo da perseguição.
  function createDoor(rect, el){
    const center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
    const state = { rect, locked: false, lockProgress: 0, breakProgress: 0 };

    function render(){
      el.classList.toggle('locked', state.locked);
      const progress = state.locked ? state.breakProgress : state.lockProgress;
      el.classList.toggle('channeling', progress > 0.02);
      el.style.setProperty('--door-progress', Math.round(progress * 100) + '%');
    }

    // Cada cliente só simula o lado que o jogador LOCAL dele pode
    // influenciar (Sobrevivente tranca, Assassino arromba) — a transição
    // final (trancou/arrombou) é sincronizada por evento de rede pros
    // outros clientes, igual o resto do jogo (objetivo concluído, etc.),
    // em vez de tentar simular os dois lados com posições de rede
    // atrasadas. Retorna true no frame em que a transição acontece.
    function progressLock(delta, survivorNear){
      if (state.locked) return false;
      const cfg = Game.CONFIG.door;
      if (survivorNear){
        state.lockProgress += delta / cfg.lockDuration;
        if (state.lockProgress >= 1){
          state.locked = true;
          state.lockProgress = 0;
          render();
          return true;
        }
      } else if (state.lockProgress > 0){
        state.lockProgress = Math.max(0, state.lockProgress - delta * 0.6);
      }
      render();
      return false;
    }

    function progressBreak(delta, killerNear){
      if (!state.locked) return false;
      const cfg = Game.CONFIG.door;
      if (killerNear){
        state.breakProgress += delta / cfg.breakDuration;
        if (state.breakProgress >= 1){
          state.locked = false;
          state.breakProgress = 0;
          render();
          return true;
        }
      } else if (state.breakProgress > 0){
        state.breakProgress = Math.max(0, state.breakProgress - delta * 0.6);
      }
      render();
      return false;
    }

    function setLocked(locked){
      state.locked = locked;
      state.lockProgress = 0;
      state.breakProgress = 0;
      render();
    }

    render();
    return { state, center, progressLock, progressBreak, setLocked, render };
  }

  Game.createDoor = createDoor;
})();
