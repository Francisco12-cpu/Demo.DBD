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

    // skillCheckLevel: sobe a cada ACERTO nesse gerador (dificuldade
    // progressiva — cada skill check fica um pouco mais rápido/apertado que
    // o anterior). Errar não muda o nível, só obriga repetir no mesmo nível.
    // engaged: só progride enquanto true — precisa apertar o botão de ação
    // pra entrar nesse modo (engage()), não basta mais só chegar perto.
    /**
     * @typedef {Object} SkillCheck
     * @property {number} angle - 0..360, posição atual do ponteiro
     * @property {number} zoneStart - início da zona de acerto, em graus
     * @property {number} zoneEnd - fim da zona de acerto, em graus
     * @property {number} speedDegPerSec
     */
    /**
     * @typedef {Object} ObjectiveState
     * @property {{x:number,y:number}} pos
     * @property {number} progress - 0..1
     * @property {boolean} done
     * @property {SkillCheck|null} skillCheck
     * @property {boolean} active - true quando engaged e ainda não done (só pra CSS)
     * @property {number} skillCheckLevel - sobe a cada acerto, aumenta a dificuldade
     * @property {boolean} engaged - true só depois do jogador apertar o botão de ação (engage())
     */
    /** @type {ObjectiveState} */
    const state = { pos, progress: 0, done: false, skillCheck: null, active: false, skillCheckLevel: 0, engaged: false };
    let nextCheckIn = randomCheckDelay();

    function randomCheckDelay(){
      const cfg = Game.CONFIG.skillCheck;
      return cfg.minInterval + Math.random() * (cfg.maxInterval - cfg.minInterval);
    }

    function spawnSkillCheck(){
      const cfg = Game.CONFIG.skillCheck;
      const level = state.skillCheckLevel;
      const zoneWidthDeg = Math.max(cfg.minZoneWidthDeg, cfg.zoneWidthDeg - level * cfg.zoneShrinkPerHit);
      const speedDegPerSec = Math.min(cfg.maxSpeedDegPerSec, cfg.speedDegPerSec + level * cfg.speedGainPerHit);
      const zoneStart = Math.random() * (360 - zoneWidthDeg);
      const zoneEnd = zoneStart + zoneWidthDeg;
      state.skillCheck = { angle: 0, zoneStart, zoneEnd, speedDegPerSec };
      scRing.style.setProperty('--zone-start', zoneStart + 'deg');
      scRing.style.setProperty('--zone-end', zoneEnd + 'deg');
      scRing.style.display = 'block';
    }

    // Errar (ou deixar o ponteiro dar a volta sem apertar) não tira
    // progresso nem sobe o nível de dificuldade — só não ganha nada nesse
    // skill check, o que já custa o tempo até ele aparecer de novo no
    // mesmo nível. Só acertar avança a barra E sobe a dificuldade do
    // próximo skill check desse gerador.
    function resolveSkillCheck(hit){
      const cfg = Game.CONFIG.skillCheck;
      if (hit){
        state.progress = Math.min(1, state.progress + cfg.successBonus);
        state.skillCheckLevel += 1;
      }
      if (state.progress >= 1) state.done = true;
      state.skillCheck = null;
      scRing.style.display = 'none';
      nextCheckIn = randomCheckDelay();
    }

    // Pra progredir, o jogador precisa primeiro chamar engage() (aperta o
    // botão de ação perto do gerador) — só chegar perto não basta mais.
    // canEngage() é quem chama consulta antes, pra saber se o botão de ação
    // deve entrar nesse modo aqui ou fazer outra coisa (resgatar, pallet,
    // etc. — prioridades definidas em js/main.js).
    function canEngage(playerPos){
      if (state.done || state.engaged) return false;
      const dist = Math.hypot(playerPos.x - pos.x, playerPos.y - pos.y);
      return dist <= Game.CONFIG.objective.radius;
    }

    function engage(){
      state.engaged = true;
    }

    // sai do modo de reparo — tanto por escolha (botão X) quanto sozinho,
    // se o jogador sair do alcance sem apertar nada.
    function disengage(){
      state.engaged = false;
      state.skillCheck = null;
      scRing.style.display = 'none';
    }

    // interactPressed só deve ser passado como true quando ESTE objetivo já
    // tinha um skill check ativo antes deste frame (ver js/main.js).
    // speedMultiplier: >1 quando há mais Sobreviventes ajudando perto do
    // mesmo objetivo (cooperação) — 1 é o padrão (sozinho).
    // Retorna { justFailed } pra quem chama avisar o Assassino (evento de
    // rede no online, ou distrair a IA no solo) — igual ao jogo original,
    // errar um skill check faz barulho alto e entrega a posição.
    function update(delta, playerPos, interactPressed, speedMultiplier){
      const result = { justFailed: false };
      if (state.done) return result;
      const cfg = Game.CONFIG.objective;

      if (state.engaged){
        const dist = Math.hypot(playerPos.x - pos.x, playerPos.y - pos.y);
        if (dist > cfg.radius) disengage(); // saiu do alcance sem apertar o X
      }

      if (state.engaged){
        const mult = speedMultiplier || 1;
        if (state.skillCheck){
          state.skillCheck.angle += state.skillCheck.speedDegPerSec * delta;
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
        } else {
          state.progress = Math.min(1, state.progress + (delta / cfg.duration) * mult);
          nextCheckIn -= delta;
          if (nextCheckIn <= 0 && state.progress < 1) spawnSkillCheck();
          if (state.progress >= 1) state.done = true;
        }
      }

      state.active = state.engaged && !state.done;
      fill.style.width = (state.progress * 100) + '%';
      el.classList.toggle('active', state.active);
      el.classList.toggle('done', state.done);
      return result;
    }

    function render(){
      el.style.left = pos.x + 'px';
      el.style.top = pos.y + 'px';
    }

    return { state, update, render, canEngage, engage, disengage };
  }

  Game.createObjective = createObjective;
})();
