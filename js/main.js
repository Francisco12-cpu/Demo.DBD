window.Game = window.Game || {};

(function(){
  "use strict";

  const stage = document.getElementById('stage');
  const arena = document.getElementById('arena');
  const objectivesStatus = document.getElementById('objectives-status');
  const abilityHudEl = document.getElementById('ability-hud');
  const panel = document.getElementById('panel');
  const MAP = Game.MAP;

  let dynamicWalls = []; // paredes temporárias (ex: habilidade "Barricar porta")
  let objectives = [];
  let currentLayoutWalls = [];

  // ---------- mundo (mapa + objetivos), compartilhado entre solo e online ----------
  function buildWorld(objectiveCount, layoutIndex){
    arena.querySelectorAll('.wall, .objective, .char, .ping-marker').forEach((n) => n.remove());
    arena.style.width = MAP.width + 'px';
    arena.style.height = MAP.height + 'px';
    dynamicWalls = [];

    const layout = MAP.layouts[layoutIndex % MAP.layouts.length];
    currentLayoutWalls = layout.walls;
    currentLayoutWalls.forEach((wall) => {
      const div = document.createElement('div');
      div.className = 'wall';
      div.style.left = wall.x + 'px';
      div.style.top = wall.y + 'px';
      div.style.width = wall.w + 'px';
      div.style.height = wall.h + 'px';
      arena.insertBefore(div, arena.firstChild);
    });

    const count = Math.min(objectiveCount, MAP.objectiveSpots.length);
    objectives = MAP.objectiveSpots.slice(0, count).map((spot) => {
      const div = document.createElement('div');
      div.className = 'objective';
      div.innerHTML =
        '<div class="progress-bar"><div class="objective-fill"></div></div>' +
        '<div class="skillcheck-ring"><div class="skillcheck-needle"></div></div>';
      arena.appendChild(div);
      const objective = Game.createObjective(spot, div);
      objective.render();
      return objective;
    });
    updateObjectivesStatus();
  }

  function allWalls(){
    return dynamicWalls.length ? currentLayoutWalls.concat(dynamicWalls) : currentLayoutWalls;
  }

  function updateObjectivesStatus(){
    const done = objectives.filter((o) => o.state.done).length;
    objectivesStatus.textContent = `Objetivos: ${done}/${objectives.length}`;
    return done;
  }

  function moveTowards(entityState, cfg, dir, delta, speedOverride){
    const len = Math.hypot(dir.x, dir.y);
    if (len <= 0.05) return false;
    const nx = dir.x / len, ny = dir.y / len;
    const radius = Game.CONFIG.playerRadius;
    const speed = speedOverride || cfg.speed;

    let x = entityState.pos.x + nx * speed * delta;
    let y = entityState.pos.y + ny * speed * delta;
    x = Math.max(radius, Math.min(MAP.width - radius, x));
    y = Math.max(radius, Math.min(MAP.height - radius, y));

    const resolved = Game.mapCollision.resolvePosition({ x, y }, radius, allWalls());
    entityState.pos.x = resolved.x;
    entityState.pos.y = resolved.y;
    if (nx > 0.01) entityState.facingRight = true;
    if (nx < -0.01) entityState.facingRight = false;
    return true;
  }

  // ---------- habilidades ----------
  function updateAbilityHud(list){
    abilityHudEl.innerHTML = list.map(({ label, ability }) => {
      const ready = ability.ready();
      let text;
      if (ability.state.activeLeft > 0) text = 'ativa';
      else if (!ready && ability.state.usesLeft <= 0) text = 'sem usos';
      else text = ready ? 'pronta' : Math.ceil(ability.state.cooldownLeft) + 's';
      const uses = isFinite(ability.state.usesLeft) ? ` · ${ability.state.usesLeft} uso(s)` : '';
      return `<span class="${ready ? 'ability-ready' : 'ability-cooling'}">${label}: ${text}${uses}</span>`;
    }).join('');
  }

  function doorCenter(){
    const d = MAP.door;
    return { x: d.x + d.w / 2, y: d.y + d.h / 2 };
  }

  // Adiciona a parede temporária da barricada (sem checar nada — quem
  // chama já validou distância/usos). Usado tanto por quem ativou quanto
  // por quem só recebeu o evento de rede.
  function spawnBarricadeWall(){
    const wall = { x: MAP.door.x, y: MAP.door.y, w: MAP.door.w, h: MAP.door.h };
    dynamicWalls.push(wall);
    const div = document.createElement('div');
    div.className = 'wall temporary-wall';
    div.style.left = wall.x + 'px';
    div.style.top = wall.y + 'px';
    div.style.width = wall.w + 'px';
    div.style.height = wall.h + 'px';
    arena.insertBefore(div, arena.firstChild);
    setTimeout(() => {
      const idx = dynamicWalls.indexOf(wall);
      if (idx >= 0) dynamicWalls.splice(idx, 1);
      div.remove();
    }, Game.CONFIG.abilities.survivor.barricade.duration * 1000);
  }

  function spawnPingMarker(x, y, durationSec){
    const div = document.createElement('div');
    div.className = 'ping-marker';
    div.style.left = x + 'px';
    div.style.top = y + 'px';
    arena.appendChild(div);
    setTimeout(() => div.remove(), durationSec * 1000);
  }

  function fitToViewport(){
    const margin = 40;
    const bottomSpace = Game.Input.isTouchDevice ? 170 : 90;
    const scale = Math.min(
      1,
      (window.innerWidth - margin) / MAP.width,
      (window.innerHeight - bottomSpace) / MAP.height
    );
    arena.style.transform = `scale(${scale})`;
  }
  window.addEventListener('resize', fitToViewport);

  function beginMatchUi(){
    stage.style.display = 'flex';
    Game.Input.init();
    Game.Audio.init();
    if (Game.Input.isTouchDevice) document.getElementById('hint').style.display = 'none';
    fitToViewport();
  }

  function hideMatchUi(){
    stage.style.display = 'none';
    Game.Audio.stopHeartbeat();
  }

  function charDom(){
    const div = document.createElement('div');
    div.className = 'char';
    div.innerHTML =
      '<div class="shadow"></div>' +
      '<div class="body"><div class="torso"><div class="face"></div></div><div class="weapon"></div></div>' +
      '<div class="label"></div>';
    arena.appendChild(div);
    return div;
  }

  function randomLayoutIndex(){
    return Math.floor(Math.random() * MAP.layouts.length);
  }

  // =====================================================================
  // MODO SOLO — 1 Sobrevivente (jogador) vs 1 Assassino (IA), pra testar
  // =====================================================================
  function startSolo(name, abilityKey){
    panel.style.display = '';
    buildWorld(Game.CONFIG.survivorCount + 1, randomLayoutIndex());

    const playerEl = charDom();
    const killerEl = charDom();
    const player = Game.createCharacter('survivor', playerEl);
    const killer = Game.createCharacter('killer', killerEl);
    const capture = Game.createCapture(playerEl);

    const abilityCfg = Game.CONFIG.abilities.survivor[abilityKey] || Game.CONFIG.abilities.survivor.sprint;
    const survivorAbility = Game.createAbility(abilityCfg);
    const killerDash = Game.createAbility(Game.CONFIG.abilities.killerDash);

    player.state.pos.x = MAP.player.x; player.state.pos.y = MAP.player.y;
    killer.state.pos.x = MAP.killer.x; killer.state.pos.y = MAP.killer.y;
    player.applyVisuals();
    killer.applyVisuals();
    playerEl.querySelector('.label').textContent = (name || 'SOBREVIVENTE').toUpperCase();
    killer.render();

    beginMatchUi();
    Game.Input.setAbilityButtonsVisible(true, false);

    let distraction = null; // { x, y, until } — pra onde a IA vai correr em vez do jogador

    let matchOver = false;
    function endMatch(won, detail){
      if (matchOver) return;
      matchOver = true;
      Game.Audio.stopHeartbeat();
      Game.Menu.showResult(won, detail, () => startSolo(name, abilityKey));
    }

    function attemptKillerHit(){
      const dx = player.state.pos.x - killer.state.pos.x;
      const dy = player.state.pos.y - killer.state.pos.y;
      if (Math.hypot(dx, dy) <= killer.characterConfig().attackRange){
        Game.Audio.playCaptureHit();
        capture.start((result) => {
          if (result === 'eliminated') endMatch(false, 'Você foi capturado pelo Assassino.');
        });
      }
    }

    function updateKillerAI(delta){
      if (capture.state.captured || killer.state.isAttacking){ killer.render(); return; }
      const cfg = killer.characterConfig();
      const target = (distraction && performance.now() < distraction.until) ? distraction : player.state.pos;
      const dx = target.x - killer.state.pos.x;
      const dy = target.y - killer.state.pos.y;
      const dist = Math.hypot(dx, dy);

      if (killerDash.ready() && dist > 220) killerDash.trigger();
      const speed = killerDash.state.activeLeft > 0
        ? cfg.speed * Game.CONFIG.abilities.killerDash.speedMultiplier
        : cfg.speed;

      if (target === player.state.pos && dist <= cfg.attackRange){
        Game.Audio.playAttackSwing();
        killer.tryAttack(attemptKillerHit);
        killer.setMoving(false);
      } else {
        const moved = moveTowards(killer.state, cfg, { x: dx, y: dy }, delta, speed);
        killer.setFacing(killer.state.facingRight);
        killer.setMoving(moved);
      }
      killer.render();
    }

    function triggerSurvivorAbility(){
      if (!survivorAbility.ready()) return;
      if (abilityKey === 'barricade'){
        const d = doorCenter();
        const dist = Math.hypot(player.state.pos.x - d.x, player.state.pos.y - d.y);
        if (dist > abilityCfg.radius) return; // precisa estar perto da porta
        survivorAbility.trigger();
        spawnBarricadeWall();
        return;
      }
      survivorAbility.trigger();
      if (abilityKey === 'distract'){
        spawnPingMarker(player.state.pos.x, player.state.pos.y, abilityCfg.duration);
        distraction = { x: player.state.pos.x, y: player.state.pos.y, until: performance.now() + abilityCfg.duration * 1000 };
      }
    }

    let lastTime = performance.now();
    function loop(now){
      if (matchOver) return;
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      Game.Input.update();
      capture.update(delta);
      survivorAbility.update(delta);
      killerDash.update(delta);
      updateAbilityHud([{ label: abilityCfg.label, ability: survivorAbility }]);
      Game.Audio.updateHeartbeat(player.state.pos, killer.state.pos, Game.CONFIG.heartbeatRange);

      const ability1Requested = Game.Input.consumeAbility1Request();

      if (capture.state.captured){
        if (Game.Input.consumeAttackRequest()) capture.pulse();
      } else if (!capture.state.eliminated){
        if (ability1Requested) triggerSurvivorAbility();

        const skillCheckPressed = Game.Input.consumeAttackRequest();
        let anyObjectiveChanged = false;
        objectives.forEach((obj) => {
          const wasDone = obj.state.done;
          const hadSkillCheck = !!obj.state.skillCheck;
          obj.update(delta, player.state.pos, hadSkillCheck && skillCheckPressed);
          if (obj.state.done && !wasDone) anyObjectiveChanged = true;
        });
        if (anyObjectiveChanged){
          const done = updateObjectivesStatus();
          if (done >= objectives.length) endMatch(true, 'Você completou todos os objetivos e escapou!');
        }

        if (!player.state.isAttacking){
          const dir = Game.Input.readMovement();
          const sprintActive = abilityKey === 'sprint' && survivorAbility.state.activeLeft > 0;
          const speed = sprintActive
            ? player.characterConfig().speed * Game.CONFIG.abilities.survivor.sprint.speedMultiplier
            : undefined;
          const moved = moveTowards(player.state, player.characterConfig(), dir, delta, speed);
          player.setFacing(player.state.facingRight);
          player.setMoving(moved);
        }
      }

      updateKillerAI(delta);
      player.render();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    setupPanel(player);
  }

  // =====================================================================
  // MODO ONLINE — N jogadores reais conectados via LAN ou P2P
  // =====================================================================
  function startOnline(net, localId, roster, mapLayoutIndex){
    panel.style.display = 'none';
    const survivors = roster.filter((p) => p.role === 'survivor');
    buildWorld(survivors.length + 1, mapLayoutIndex || 0);

    const entries = new Map(); // id -> { info, char, el, capture?, eliminated, camouflaged }
    let survivorIndex = 0;

    roster.forEach((info) => {
      const el = charDom();
      const char = Game.createCharacter(info.role, el);
      char.applyVisuals();
      el.querySelector('.label').textContent = info.name.toUpperCase() + (info.id === localId ? ' (você)' : '');

      if (info.role === 'killer'){
        char.state.pos.x = MAP.killer.x;
        char.state.pos.y = MAP.killer.y;
      } else {
        const spawn = MAP.survivorSpawns[survivorIndex % MAP.survivorSpawns.length];
        char.setColorOverride(Game.CONFIG.survivorColors[survivorIndex % Game.CONFIG.survivorColors.length]);
        survivorIndex++;
        char.state.pos.x = spawn.x;
        char.state.pos.y = spawn.y;
      }
      char.render();

      const entry = { info, char, el, eliminated: false, camouflaged: false };
      if (info.role === 'survivor') entry.capture = Game.createCapture(el);
      entries.set(info.id, entry);
    });

    const localEntry = entries.get(localId);
    const isSurvivor = localEntry.info.role === 'survivor';
    const killerEntry = [...entries.values()].find((e) => e.info.role === 'killer');

    const localAbilityCfg = isSurvivor
      ? (Game.CONFIG.abilities.survivor[localEntry.info.ability] || Game.CONFIG.abilities.survivor.sprint)
      : null;
    const localAbility1 = isSurvivor ? Game.createAbility(localAbilityCfg) : Game.createAbility(Game.CONFIG.abilities.killerSense);
    const localAbility2 = isSurvivor ? null : Game.createAbility(Game.CONFIG.abilities.killerDash);
    const localAbilityKey = isSurvivor ? localEntry.info.ability : null;

    beginMatchUi();
    Game.Input.setAbilityButtonsVisible(true, !isSurvivor);

    let matchOver = false;
    function endMatch(won, detail, announce){
      if (matchOver) return;
      matchOver = true;
      Game.Audio.stopHeartbeat();
      if (announce) net.sendEvent({ kind: 'matchEnd', result: won ? 'survivors' : 'killer' });
      const localWon = localEntry.info.role === 'killer' ? !won : won;
      Game.Menu.showResult(localWon, detail, null); // "jogar de novo" online volta pro lobby (ver menu.js)
    }

    function activeSurvivors(){
      return [...entries.values()].filter((e) => e.info.role === 'survivor' && !e.eliminated);
    }

    function checkWinFromObjectives(){
      const done = updateObjectivesStatus();
      if (done >= objectives.length){
        endMatch(true, 'Os Sobreviventes completaram os objetivos e escaparam!', true);
      }
    }

    function checkWinFromCaptures(){
      if (survivors.length > 0 && activeSurvivors().length === 0){
        endMatch(false, 'O Assassino capturou todos os Sobreviventes.', true);
      }
    }

    // ---------- eventos vindos da rede ----------
    Game.onlineStateHandler = function(fromId, data){
      const entry = entries.get(fromId);
      if (!entry || entry === localEntry) return;
      entry.char.state.pos.x = data.x;
      entry.char.state.pos.y = data.y;
      entry.char.setFacing(data.facingRight);
      entry.char.setMoving(data.moving);
      entry.char.render();
      entry.camouflaged = !!data.camouflaged;
    };

    Game.onlinePlayerLeftHandler = function(id){
      const entry = entries.get(id);
      if (!entry) return;
      entry.eliminated = true;
      entry.el.classList.add('eliminated');
      if (entry.info.role === 'survivor') checkWinFromCaptures();
      if (entry.info.role === 'killer'){
        endMatch(true, 'O Assassino saiu da partida — Sobreviventes vencem por desistência.', true);
      }
    };

    Game.onlineEventHandler = function(fromId, data){
      if (!data) return;

      if (data.kind === 'captureStart' && data.targetId === localId && localEntry.capture){
        Game.Audio.playCaptureHit();
        localEntry.capture.start((result) => {
          net.sendEvent({ kind: 'struggleResult', playerId: localId, result });
          if (result === 'eliminated'){
            localEntry.eliminated = true;
            checkWinFromCaptures();
          }
        });
        return;
      }

      if (data.kind === 'struggleResult'){
        const entry = entries.get(data.playerId);
        if (!entry) return;
        if (data.result === 'eliminated'){
          entry.eliminated = true;
          entry.el.classList.add('eliminated');
          checkWinFromCaptures();
        }
        return;
      }

      if (data.kind === 'objectiveDone'){
        const obj = objectives[data.index];
        if (obj && !obj.state.done){
          obj.state.done = true;
          obj.state.progress = 1;
        }
        checkWinFromObjectives();
        return;
      }

      if (data.kind === 'barricade'){
        spawnBarricadeWall();
        return;
      }

      if (data.kind === 'distractPing'){
        spawnPingMarker(data.x, data.y, Game.CONFIG.abilities.survivor.distract.duration);
        return;
      }

      if (data.kind === 'matchEnd' && !matchOver){
        endMatch(data.result === 'survivors', data.result === 'survivors'
          ? 'Os Sobreviventes completaram os objetivos e escaparam!'
          : 'O Assassino capturou todos os Sobreviventes.', false);
      }
    };

    function attemptKillerHit(){
      const cfg = localEntry.char.characterConfig();
      activeSurvivors().forEach((entry) => {
        if (entry.info.id === localId) return;
        const dx = entry.char.state.pos.x - localEntry.char.state.pos.x;
        const dy = entry.char.state.pos.y - localEntry.char.state.pos.y;
        if (Math.hypot(dx, dy) <= cfg.attackRange){
          net.sendEvent({ kind: 'captureStart', targetId: entry.info.id });
        }
      });
    }

    function triggerLocalSurvivorAbility(){
      if (!localAbility1.ready()) return;
      if (localAbilityKey === 'barricade'){
        const d = doorCenter();
        const dist = Math.hypot(localEntry.char.state.pos.x - d.x, localEntry.char.state.pos.y - d.y);
        if (dist > localAbilityCfg.radius) return;
        localAbility1.trigger();
        spawnBarricadeWall();
        net.sendEvent({ kind: 'barricade' });
        return;
      }
      localAbility1.trigger();
      if (localAbilityKey === 'distract'){
        spawnPingMarker(localEntry.char.state.pos.x, localEntry.char.state.pos.y, localAbilityCfg.duration);
        net.sendEvent({ kind: 'distractPing', x: localEntry.char.state.pos.x, y: localEntry.char.state.pos.y });
      }
    }

    // ---------- visão do Assassino (fog simples: perto sempre vê; Sentido revela geral; Camuflagem esconde sempre) ----------
    function updateKillerVision(){
      const senseActive = localAbility1.state.activeLeft > 0;
      entries.forEach((entry) => {
        if (entry.info.role !== 'survivor' || entry === localEntry) return;
        const dx = entry.char.state.pos.x - localEntry.char.state.pos.x;
        const dy = entry.char.state.pos.y - localEntry.char.state.pos.y;
        const dist = Math.hypot(dx, dy);
        const visible = !entry.camouflaged && (senseActive || dist <= Game.CONFIG.killerVisionRange);
        entry.el.style.display = visible ? '' : 'none';
      });
    }

    let lastTime = performance.now();
    let lastStateSent = 0;

    function loop(now){
      if (matchOver) return;
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      Game.Input.update();
      if (isSurvivor) localEntry.capture.update(delta);
      localAbility1.update(delta);
      if (localAbility2) localAbility2.update(delta);

      if (isSurvivor){
        updateAbilityHud([{ label: localAbilityCfg.label, ability: localAbility1 }]);
        const killerPos = killerEntry && !killerEntry.eliminated ? killerEntry.char.state.pos : null;
        Game.Audio.updateHeartbeat(localEntry.char.state.pos, killerPos, Game.CONFIG.heartbeatRange);
      } else {
        updateAbilityHud([
          { label: Game.CONFIG.abilities.killerSense.label, ability: localAbility1 },
          { label: Game.CONFIG.abilities.killerDash.label, ability: localAbility2 },
        ]);
        updateKillerVision();
      }

      const attackRequested = Game.Input.consumeAttackRequest();
      const ability1Requested = Game.Input.consumeAbility1Request();
      const ability2Requested = !isSurvivor && Game.Input.consumeAbility2Request();

      const captured = isSurvivor && localEntry.capture.state.captured;
      const eliminated = isSurvivor && localEntry.capture.state.eliminated;

      if (captured){
        if (attackRequested) localEntry.capture.pulse();
      } else if (!eliminated){
        if (isSurvivor){
          if (ability1Requested) triggerLocalSurvivorAbility();

          objectives.forEach((obj, index) => {
            const wasDone = obj.state.done;
            const hadSkillCheck = !!obj.state.skillCheck;
            obj.update(delta, localEntry.char.state.pos, hadSkillCheck && attackRequested);
            if (obj.state.done && !wasDone){
              net.sendEvent({ kind: 'objectiveDone', index });
              checkWinFromObjectives();
            }
          });
        } else {
          if (ability1Requested) localAbility1.trigger();
          if (ability2Requested) localAbility2.trigger();
          if (attackRequested){
            Game.Audio.playAttackSwing();
            localEntry.char.tryAttack(attemptKillerHit);
          }
        }

        if (!localEntry.char.state.isAttacking){
          const dir = Game.Input.readMovement();
          const cfg = localEntry.char.characterConfig();
          let speed;
          if (isSurvivor && localAbilityKey === 'sprint' && localAbility1.state.activeLeft > 0){
            speed = cfg.speed * Game.CONFIG.abilities.survivor.sprint.speedMultiplier;
          } else if (!isSurvivor && localAbility2.state.activeLeft > 0){
            speed = cfg.speed * Game.CONFIG.abilities.killerDash.speedMultiplier;
          }
          const moved = moveTowards(localEntry.char.state, cfg, dir, delta, speed);
          localEntry.char.setFacing(localEntry.char.state.facingRight);
          localEntry.char.setMoving(moved);
        }
      }

      localEntry.char.render();

      if (now - lastStateSent > 70){
        lastStateSent = now;
        net.sendState({
          x: localEntry.char.state.pos.x,
          y: localEntry.char.state.pos.y,
          facingRight: localEntry.char.state.facingRight,
          moving: localEntry.el.classList.contains('running'),
          camouflaged: isSurvivor && localAbilityKey === 'camouflage' && localAbility1.state.activeLeft > 0,
        });
      }

      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  // ---------- painel de configuração (só modo solo) ----------
  function setupPanel(player){
    const btnSurvivor = document.getElementById('btn-survivor');
    const btnKiller = document.getElementById('btn-killer');
    const speedSlider = document.getElementById('speed');
    const speedVal = document.getElementById('speed-val');

    function syncPanel(){
      const cfg = player.characterConfig();
      speedSlider.value = cfg.speed;
      speedVal.textContent = cfg.speed;
    }

    btnSurvivor.onclick = () => {
      player.setType('survivor');
      btnSurvivor.classList.add('active');
      btnKiller.classList.remove('active');
      syncPanel();
    };
    btnKiller.onclick = () => {
      player.setType('killer');
      btnKiller.classList.add('active');
      btnSurvivor.classList.remove('active');
      syncPanel();
    };
    speedSlider.oninput = () => {
      const v = parseInt(speedSlider.value, 10);
      speedVal.textContent = v;
      player.characterConfig().speed = v;
    };

    syncPanel();
  }

  Game.startSolo = startSolo;
  Game.startOnline = startOnline;
  Game.hideMatchUi = hideMatchUi;
})();
