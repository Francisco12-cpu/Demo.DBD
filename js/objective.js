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

    const state = { pos, progress: 0, done: false, skillCheck: null, active: false };
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

    // Errar (ou deixar o ponteiro dar a volta sem apertar) não tira
    // progresso — só não ganha nada nesse skill check, o que já custa o
    // tempo que passou até ele acontecer de novo. Só acertar avança a barra.
    function resolveSkillCheck(hit){
      const cfg = Game.CONFIG.skillCheck;
      if (hit) state.progress = Math.min(1, state.progress + cfg.successBonus);
      if (state.progress >= 1) state.done = true;
      state.skillCheck = null;
      scRing.style.display = 'none';
      nextCheckIn = randomCheckDelay();
    }

    // interactPressed só deve ser passado como true quando ESTE objetivo já
    // tinha um skill check ativo antes deste frame (ver js/main.js).
    // speedMultiplier: >1 quando há mais Sobreviventes ajudando perto do
    // mesmo objetivo (cooperação) — 1 é o padrão (sozinho).
    // Retorna { justStarted, justFailed } pra quem chama avisar o Assassino
    // (evento de rede no online, ou distrair a IA no solo) — igual ao jogo
    // original, errar um skill check faz barulho alto e entrega a posição.
    function update(delta, playerPos, interactPressed, speedMultiplier){
      const result = { justStarted: false, justFailed: false };
      if (state.done) return result;
      const cfg = Game.CONFIG.objective;
      const dist = Math.hypot(playerPos.x - pos.x, playerPos.y - pos.y);
      const inRange = dist <= cfg.radius;
      const mult = speedMultiplier || 1;
      const wasActive = state.active;

      if (state.skillCheck){
        const scCfg = Game.CONFIG.skillCheck;
        state.skillCheck.angle += scCfg.speedDegPerSec * delta;
        if (state.skillCheck.angle >= 360){
          resolveSkillCheck(false); // deu a volta sem apertar = falhou
          result.justFailed = true;
        } else {
          scNeedle.style.transform = `translateX(-50%) rotate(${state.skillCheck.angle}deg)`;
          if (interactPressed){
            const { angle, zoneStart, zoneEnd } = state.skillCheck;
            const hit = angle >= zoneStart && angle <= zoneEnd;
            resolveSkillCheck(hit);
            if (!hit) result.justFailed = true;
          }
        }
      } else if (inRange){
        if (!wasActive) result.justStarted = true;
        state.progress = Math.min(1, state.progress + (delta / cfg.duration) * mult);
        nextCheckIn -= delta;
        if (nextCheckIn <= 0 && state.progress < 1) spawnSkillCheck();
        if (state.progress >= 1) state.done = true;
      }

      state.active = inRange && !state.done;
      fill.style.width = (state.progress * 100) + '%';
      el.classList.toggle('active', state.active);
      el.classList.toggle('done', state.done);
      return result;
    }

    function render(){
      el.style.left = pos.x + 'px';
      el.style.top = pos.y + 'px';
    }

    return { state, update, render };
  }

  Game.createObjective = createObjective;
})();
