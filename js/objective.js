window.Game = window.Game || {};

(function(){
  "use strict";

  // Objetivo único parametrizado (raio/duração vêm de Game.CONFIG.objective)
  // — mesma ideia do personagem: um só tipo de lógica, N instâncias.
  // Inclui o skill check circular: enquanto o jogador enche a barra por
  // perto, de vez em quando um ponteiro gira e ele precisa apertar o botão
  // de ataque/interação na zona certa (senão perde progresso).
  function createObjective(pos, el){
    const fill = el.querySelector('.objective-fill');
    const scRing = el.querySelector('.skillcheck-ring');
    const scNeedle = el.querySelector('.skillcheck-needle');

    const state = { pos, progress: 0, done: false, skillCheck: null };
    let nextCheckIn = randomCheckDelay();

    function randomCheckDelay(){
      const cfg = Game.CONFIG.skillCheck;
      return cfg.minInterval + Math.random() * (cfg.maxInterval - cfg.minInterval);
    }

    function spawnSkillCheck(){
      const cfg = Game.CONFIG.skillCheck;
      const zoneStart = Math.random() * (360 - cfg.zoneWidthDeg);
      const zoneEnd = zoneStart + cfg.zoneWidthDeg;
      state.skillCheck = { angle: 0, zoneStart, zoneEnd };
      scRing.style.setProperty('--zone-start', zoneStart + 'deg');
      scRing.style.setProperty('--zone-end', zoneEnd + 'deg');
      scRing.style.display = 'block';
    }

    function resolveSkillCheck(hit){
      const cfg = Game.CONFIG.skillCheck;
      state.progress = hit
        ? Math.min(1, state.progress + cfg.successBonus)
        : Math.max(0, state.progress - cfg.failPenalty);
      if (state.progress >= 1) state.done = true;
      state.skillCheck = null;
      scRing.style.display = 'none';
      nextCheckIn = randomCheckDelay();
    }

    // interactPressed só deve ser passado como true quando ESTE objetivo já
    // tinha um skill check ativo antes deste frame (ver js/main.js).
    function update(delta, playerPos, interactPressed){
      if (state.done) return;
      const cfg = Game.CONFIG.objective;
      const dist = Math.hypot(playerPos.x - pos.x, playerPos.y - pos.y);
      const inRange = dist <= cfg.radius;

      if (state.skillCheck){
        const scCfg = Game.CONFIG.skillCheck;
        state.skillCheck.angle += scCfg.speedDegPerSec * delta;
        if (state.skillCheck.angle >= 360){
          resolveSkillCheck(false); // deu a volta sem apertar = falhou
        } else {
          scNeedle.style.transform = `translateX(-50%) rotate(${state.skillCheck.angle}deg)`;
          if (interactPressed){
            const { angle, zoneStart, zoneEnd } = state.skillCheck;
            resolveSkillCheck(angle >= zoneStart && angle <= zoneEnd);
          }
        }
      } else if (inRange){
        state.progress = Math.min(1, state.progress + delta / cfg.duration);
        nextCheckIn -= delta;
        if (nextCheckIn <= 0 && state.progress < 1) spawnSkillCheck();
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
