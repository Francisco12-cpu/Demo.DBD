window.Game = window.Game || {};

(function(){
  "use strict";

  const stage = document.getElementById('stage');
  const arena = document.getElementById('arena');
  const dummy = document.getElementById('dummy');
  const hpFill = document.getElementById('hp-fill');
  const objectivesStatus = document.getElementById('objectives-status');
  const panel = document.getElementById('panel');
  const MAP = Game.MAP;

  let dummyHp = 100;
  const dummyMaxHp = 100;
  let dummyWall = null;
  let objectives = [];

  // ---------- mundo (mapa + objetivos), compartilhado entre solo e online ----------
  function buildWorld(objectiveCount, includeDummy){
    arena.querySelectorAll('.wall, .objective, .char').forEach((n) => n.remove());
    arena.style.width = MAP.width + 'px';
    arena.style.height = MAP.height + 'px';

    MAP.walls.forEach((wall) => {
      const div = document.createElement('div');
      div.className = 'wall';
      div.style.left = wall.x + 'px';
      div.style.top = wall.y + 'px';
      div.style.width = wall.w + 'px';
      div.style.height = wall.h + 'px';
      arena.insertBefore(div, arena.firstChild);
    });

    if (includeDummy){
      dummy.style.display = '';
      dummy.style.left = MAP.dummy.x + 'px';
      dummy.style.top = MAP.dummy.y + 'px';
      dummy.style.transform = 'translate(-50%,-50%)';
      const dw = 15, dh = 19;
      dummyWall = { x: MAP.dummy.x - dw, y: MAP.dummy.y - dh, w: dw * 2, h: dh * 2 };
      dummyHp = dummyMaxHp;
      hpFill.style.width = '100%';
    } else {
      dummy.style.display = 'none';
      dummyWall = null;
    }

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
    return dummyWall ? MAP.walls.concat([dummyWall]) : MAP.walls;
  }

  function updateObjectivesStatus(){
    const done = objectives.filter((o) => o.state.done).length;
    objectivesStatus.textContent = `Objetivos: ${done}/${objectives.length}`;
    return done;
  }

  function attemptDummyHit(cfg){
    if (!dummyWall) return;
    const dx = MAP.dummy.x - lastAttackerPos.x;
    const dy = MAP.dummy.y - lastAttackerPos.y;
    const dist = Math.hypot(dx, dy);
    const facingMatches = (lastAttackerFacingRight && dx > -10) || (!lastAttackerFacingRight && dx < 10);
    if (dist <= cfg.attackRange && facingMatches){
      dummyHp = Math.max(0, dummyHp - cfg.attackDamage);
      hpFill.style.width = (dummyHp / dummyMaxHp * 100) + '%';
      dummy.style.filter = 'brightness(2)';
      setTimeout(() => { dummy.style.filter = ''; }, 100);
      if (dummyHp === 0){
        setTimeout(() => { dummyHp = dummyMaxHp; hpFill.style.width = '100%'; }, 400);
      }
    }
  }
  // tryAttack() não passa a posição de quem ataca pro callback, então
  // guardamos a última antes de chamar tryAttack (ver moveAndCollide/uso abaixo)
  let lastAttackerPos = { x: 0, y: 0 };
  let lastAttackerFacingRight = true;

  function moveTowards(entityState, cfg, dir, delta){
    const len = Math.hypot(dir.x, dir.y);
    if (len <= 0.05) return false;
    const nx = dir.x / len, ny = dir.y / len;
    const radius = Game.CONFIG.playerRadius;

    let x = entityState.pos.x + nx * cfg.speed * delta;
    let y = entityState.pos.y + ny * cfg.speed * delta;
    x = Math.max(radius, Math.min(MAP.width - radius, x));
    y = Math.max(radius, Math.min(MAP.height - radius, y));

    const resolved = Game.mapCollision.resolvePosition({ x, y }, radius, allWalls());
    entityState.pos.x = resolved.x;
    entityState.pos.y = resolved.y;
    if (nx > 0.01) entityState.facingRight = true;
    if (nx < -0.01) entityState.facingRight = false;
    return true;
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
    if (Game.Input.isTouchDevice) document.getElementById('hint').style.display = 'none';
    fitToViewport();
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

  // =====================================================================
  // MODO SOLO — 1 Sobrevivente (jogador) vs 1 Assassino (IA), pra testar
  // =====================================================================
  function startSolo(name){
    panel.style.display = '';
    buildWorld(Game.CONFIG.survivorCount + 1, true);

    const playerEl = charDom();
    const killerEl = charDom();
    const player = Game.createCharacter('survivor', playerEl);
    const killer = Game.createCharacter('killer', killerEl);
    const capture = Game.createCapture(playerEl);

    player.state.pos.x = MAP.player.x; player.state.pos.y = MAP.player.y;
    killer.state.pos.x = MAP.killer.x; killer.state.pos.y = MAP.killer.y;
    player.applyVisuals();
    killer.applyVisuals();
    playerEl.querySelector('.label').textContent = (name || 'SOBREVIVENTE').toUpperCase();
    killer.render();

    beginMatchUi();

    let matchOver = false;
    function endMatch(won, detail){
      if (matchOver) return;
      matchOver = true;
      Game.Menu.showResult(won, detail);
    }

    function attemptKillerHit(){
      const dx = player.state.pos.x - killer.state.pos.x;
      const dy = player.state.pos.y - killer.state.pos.y;
      if (Math.hypot(dx, dy) <= killer.characterConfig().attackRange){
        capture.start((result) => {
          if (result === 'eliminated') endMatch(false, 'Você foi capturado pelo Assassino.');
        });
      }
    }

    function updateKillerAI(delta){
      if (capture.state.captured || killer.state.isAttacking){ killer.render(); return; }
      const cfg = killer.characterConfig();
      const dx = player.state.pos.x - killer.state.pos.x;
      const dy = player.state.pos.y - killer.state.pos.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= cfg.attackRange){
        killer.tryAttack(attemptKillerHit);
        killer.setMoving(false);
      } else {
        const moved = moveTowards(killer.state, cfg, { x: dx, y: dy }, delta);
        killer.setFacing(killer.state.facingRight);
        killer.setMoving(moved);
      }
      killer.render();
    }

    let lastTime = performance.now();
    function loop(now){
      if (matchOver) return;
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      Game.Input.update();
      capture.update(delta);
      const attackRequested = Game.Input.consumeAttackRequest();

      if (capture.state.captured){
        if (attackRequested) capture.pulse();
      } else if (!capture.state.eliminated){
        let consumedBySkillCheck = false;
        let anyObjectiveChanged = false;
        objectives.forEach((obj) => {
          const wasDone = obj.state.done;
          const hadSkillCheck = !!obj.state.skillCheck;
          obj.update(delta, player.state.pos, hadSkillCheck && attackRequested);
          if (hadSkillCheck && attackRequested) consumedBySkillCheck = true;
          if (obj.state.done && !wasDone) anyObjectiveChanged = true;
        });
        if (anyObjectiveChanged){
          const done = updateObjectivesStatus();
          if (done >= objectives.length) endMatch(true, 'Você completou todos os objetivos e escapou!');
        }

        if (attackRequested && !consumedBySkillCheck){
          lastAttackerPos = player.state.pos;
          lastAttackerFacingRight = player.state.facingRight;
          player.tryAttack(attemptDummyHit);
        }

        if (!player.state.isAttacking){
          const dir = Game.Input.readMovement();
          const moved = moveTowards(player.state, player.characterConfig(), dir, delta);
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
  // MODO ONLINE — N jogadores reais conectados via LAN (server/server.js)
  // =====================================================================
  function startOnline(net, localId, roster){
    panel.style.display = 'none';
    const survivors = roster.filter((p) => p.role === 'survivor');
    const killerInfo = roster.find((p) => p.role === 'killer');
    buildWorld(survivors.length + 1, false);

    const entries = new Map(); // id -> { info, char, el, capture, eliminated }
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
        survivorIndex++;
        char.state.pos.x = spawn.x;
        char.state.pos.y = spawn.y;
      }
      char.render();

      const entry = { info, char, el, eliminated: false };
      if (info.role === 'survivor') entry.capture = Game.createCapture(el);
      entries.set(info.id, entry);
    });

    const localEntry = entries.get(localId);
    beginMatchUi();

    let matchOver = false;
    function endMatch(won, detail, announce){
      if (matchOver) return;
      matchOver = true;
      if (announce) net.sendEvent({ kind: 'matchEnd', result: won ? 'survivors' : 'killer' });
      const localWon = localEntry.info.role === 'killer' ? !won : won;
      Game.Menu.showResult(localWon, detail);
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
    };

    Game.onlinePlayerLeftHandler = function(id){
      const entry = entries.get(id);
      if (!entry) return;
      entry.eliminated = true;
      entry.el.classList.add('eliminated');
      if (entry.info.role === 'survivor') checkWinFromCaptures();
    };

    Game.onlineEventHandler = function(fromId, data){
      if (!data) return;

      if (data.kind === 'captureStart' && data.targetId === localId && localEntry.capture){
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

    let lastTime = performance.now();
    let lastStateSent = 0;

    function loop(now){
      if (matchOver){ return; }
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      Game.Input.update();
      const isSurvivor = localEntry.info.role === 'survivor';
      if (isSurvivor) localEntry.capture.update(delta);
      const attackRequested = Game.Input.consumeAttackRequest();

      const captured = isSurvivor && localEntry.capture.state.captured;
      const eliminated = isSurvivor && localEntry.capture.state.eliminated;

      if (captured){
        if (attackRequested) localEntry.capture.pulse();
      } else if (!eliminated){
        if (isSurvivor){
          let consumedBySkillCheck = false;
          objectives.forEach((obj, index) => {
            const wasDone = obj.state.done;
            const hadSkillCheck = !!obj.state.skillCheck;
            obj.update(delta, localEntry.char.state.pos, hadSkillCheck && attackRequested);
            if (hadSkillCheck && attackRequested) consumedBySkillCheck = true;
            if (obj.state.done && !wasDone){
              net.sendEvent({ kind: 'objectiveDone', index });
              checkWinFromObjectives();
            }
          });
          if (attackRequested && !consumedBySkillCheck){
            lastAttackerPos = localEntry.char.state.pos;
            lastAttackerFacingRight = localEntry.char.state.facingRight;
            localEntry.char.tryAttack(attemptDummyHit);
          }
        } else if (attackRequested){
          localEntry.char.tryAttack(attemptKillerHit);
        }

        if (!localEntry.char.state.isAttacking){
          const dir = Game.Input.readMovement();
          const moved = moveTowards(localEntry.char.state, localEntry.char.characterConfig(), dir, delta);
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
    const damageSlider = document.getElementById('damage');
    const damageVal = document.getElementById('damage-val');

    function syncPanel(){
      const cfg = player.characterConfig();
      speedSlider.value = cfg.speed;
      speedVal.textContent = cfg.speed;
      damageSlider.value = cfg.attackDamage;
      damageVal.textContent = cfg.attackDamage;
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
    damageSlider.oninput = () => {
      const v = parseInt(damageSlider.value, 10);
      damageVal.textContent = v;
      player.characterConfig().attackDamage = v;
    };

    syncPanel();
  }

  Game.startSolo = startSolo;
  Game.startOnline = startOnline;
})();
