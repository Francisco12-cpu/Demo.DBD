window.Game = window.Game || {};

(function(){
  "use strict";

  // Objetivo único parametrizado (raio/duração vêm de Game.CONFIG.objective)
  // — mesma ideia do personagem: um só tipo de lógica, N instâncias.
  function createObjective(pos, el){
    const fill = el.querySelector('.objective-fill');
    const state = { pos, progress: 0, done: false };

    function update(delta, playerPos){
      if (state.done) return;
      const cfg = Game.CONFIG.objective;
      const dist = Math.hypot(playerPos.x - pos.x, playerPos.y - pos.y);
      const inRange = dist <= cfg.radius;

      if (inRange){
        state.progress = Math.min(1, state.progress + delta / cfg.duration);
        if (state.progress >= 1) state.done = true;
      }

      fill.style.width = (state.progress * 100) + '%';
      el.classList.toggle('active', inRange && !state.done);
      el.classList.toggle('done', state.done);
    }

    function render(){
      el.style.left = pos.x + 'px';
      el.style.top = pos.y + 'px';
    }

    return { state, update, render };
  }

  Game.createObjective = createObjective;
})();
