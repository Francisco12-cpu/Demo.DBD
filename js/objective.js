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
     * @property {boolean} regressing - true enquanto abandonado (não engaged) e perdendo progresso (BUG-008)
     */
    /** @type {ObjectiveState} */
    const state = { pos, progress: 0, done: false, skillCheck: null, active: false, skillCheckLevel: 0, engaged: false, regressing: false };
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
      // zona "ótima" — sub-faixa menor, centralizada dentro da zona normal
      // (ver Game.CONFIG.skillCheck.greatZoneFraction/greatBonusMultiplier)
      const zoneCenter = (zoneStart + zoneEnd) / 2;
      const greatWidthDeg = zoneWidthDeg * cfg.greatZoneFraction;
      const greatStart = zoneCenter - greatWidthDeg / 2;
      const greatEnd = zoneCenter + greatWidthDeg / 2;
      state.skillCheck = { angle: 0, zoneStart, zoneEnd, greatStart, greatEnd, speedDegPerSec };
      scRing.style.setProperty('--zone-start', zoneStart + 'deg');
      scRing.style.setProperty('--zone-end', zoneEnd + 'deg');
      scRing.style.setProperty('--great-start', greatStart + 'deg');
      scRing.style.setProperty('--great-end', greatEnd + 'deg');
      scRing.style.display = 'block';
    }

    // Errar (ou deixar o ponteiro dar a volta sem apertar) não sobe o
    // nível de dificuldade — só obriga repetir aquele mesmo skill check,
    // o que já custa o tempo até ele aparecer de novo no mesmo nível. Por
    // padrão também não tira progresso (cfg.failPenalty = 0); só tira se
    // o jogador ligou o "modo difícil" nas Configurações (ver menu.js).
    // Acertar sempre avança a barra E sobe a dificuldade do próximo skill
    // check desse gerador. `great` (acerto na sub-zona central) multiplica
    // o ganho — ver spawnSkillCheck.
    function resolveSkillCheck(hit, great){
      const cfg = Game.CONFIG.skillCheck;
      if (hit){
        const bonus = great ? cfg.successBonus * cfg.greatBonusMultiplier : cfg.successBonus;
        state.progress = Math.min(1, state.progress + bonus);
        state.skillCheckLevel += 1;
      } else if (cfg.failPenalty > 0){
        state.progress = Math.max(0, state.progress - cfg.failPenalty);
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
      // se estava regredindo (abandonado), reengajar volta a progredir —
      // sem isso a classe .regressing ficava presa ligada pra sempre,
      // porque decayIfAbandoned() (o único lugar que a desliga) só roda
      // pros objetivos QUE NÃO SÃO o engajado (ver js/main.js)
      if (state.regressing){
        state.regressing = false;
        el.classList.remove('regressing');
      }
    }

    // sai do modo de reparo — por escolha (botão X), sozinho se o jogador
    // sair do alcance sem apertar nada, ou forçado de fora (ex: jogador foi
    // capturado no meio do reparo — main.js chama isso direto, sem passar
    // por update() de novo, então precisa limpar a classe .active aqui
    // também — não dá pra confiar só no próximo update() pra isso, porque
    // pode não haver um próximo update() tão cedo).
    function disengage(){
      state.engaged = false;
      state.active = false;
      state.skillCheck = null;
      scRing.style.display = 'none';
      el.classList.remove('active');
    }

    // interactPressed só deve ser passado como true quando ESTE objetivo já
    // tinha um skill check ativo antes deste frame (ver js/main.js).
    // speedMultiplier: >1 quando há mais Sobreviventes ajudando perto do
    // mesmo objetivo (cooperação) — 1 é o padrão (sozinho).
    // Retorna { justFailed, great } — justFailed pra quem chama avisar o
    // Assassino (evento de rede no online, ou distrair a IA no solo) —
    // igual ao jogo original, errar um skill check faz barulho alto e
    // entrega a posição. great: true no frame em que acerta a sub-zona
    // "ótima" (ver spawnSkillCheck) — pra quem chama dar um feedback
    // extra (som/vibração diferente), opcional.
    function update(delta, playerPos, interactPressed, speedMultiplier){
      const result = { justFailed: false, great: false };
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
              const { angle, zoneStart, zoneEnd, greatStart, greatEnd } = state.skillCheck;
              const hit = angle >= zoneStart && angle <= zoneEnd;
              const great = hit && angle >= greatStart && angle <= greatEnd;
              resolveSkillCheck(hit, great);
              if (!hit) result.justFailed = true;
              result.great = great;
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

    // BUG-008 (BUGS.md): objetivo abandonado (não engaged) perdia progresso
    // NUNCA — só existia decaimento de verdade enquanto engaged (via
    // update() acima), mas update() só é chamado pro objetivo atualmente
    // engajado (ver js/main.js). Por isso essa função é separada: quem
    // chama roda ela pra TODO objetivo que não é o engajado no momento,
    // todo frame — regressão lenta até regressFloor, só quando há
    // progresso de sobra pra perder (evita trabalho/CSS toggle à toa em
    // gerador ainda intocado).
    function decayIfAbandoned(delta){
      if (state.done || state.engaged) return;
      const cfg = Game.CONFIG.objective;
      const floor = cfg.regressFloor;
      if (state.progress > floor){
        state.progress = Math.max(floor, state.progress - cfg.regressRate * delta);
        fill.style.width = (state.progress * 100) + '%';
      }
      const regressing = state.progress > floor;
      if (regressing !== state.regressing){
        state.regressing = regressing;
        el.classList.toggle('regressing', regressing);
      }
    }

    function render(){
      el.style.left = pos.x + 'px';
      el.style.top = pos.y + 'px';
    }

    return { state, update, render, canEngage, engage, disengage, decayIfAbandoned };
  }

  Game.createObjective = createObjective;
})();
