window.Game = window.Game || {};

(function(){
  "use strict";

  const stage = document.getElementById('stage');
  const arena = document.getElementById('arena');
  const lightingEl = document.getElementById('lighting');
  const dangerVignetteEl = document.getElementById('danger-vignette');
  const objectivesStatus = document.getElementById('objectives-status');
  const abilityHudEl = document.getElementById('ability-hud');
  const panel = document.getElementById('panel');
  const MAP = Game.MAP;

  let objectives = [];
  let doors = [];
  let currentLayoutWalls = [];

  // ---------- mundo (mapa + objetivos + portas + esconderijos), compartilhado entre solo e online ----------
  function buildWorld(objectiveCount, layoutIndex){
    arena.querySelectorAll('.wall, .objective, .char, .ping-marker, .door, .hideout-spot').forEach((n) => n.remove());
    arena.style.width = MAP.width + 'px';
    arena.style.height = MAP.height + 'px';

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

    doors = layout.doors.map((rect) => {
      const div = document.createElement('div');
      div.className = 'door';
      div.style.left = rect.x + 'px';
      div.style.top = rect.y + 'px';
      div.style.width = rect.w + 'px';
      div.style.height = rect.h + 'px';
      arena.appendChild(div);
      return Game.createDoor(rect, div);
    });

    MAP.hideoutSpots.forEach((spot) => {
      const div = document.createElement('div');
      div.className = 'hideout-spot';
      div.style.left = spot.x + 'px';
      div.style.top = spot.y + 'px';
      arena.appendChild(div);
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
    const lockedDoorWalls = doors.filter((d) => d.state.locked).map((d) => d.state.rect);
    return lockedDoorWalls.length ? currentLayoutWalls.concat(lockedDoorWalls) : currentLayoutWalls;
  }

  function nearestDoor(pos, maxDist){
    let best = null, bestDist = Infinity;
    doors.forEach((d) => {
      const dist = Math.hypot(pos.x - d.center.x, pos.y - d.center.y);
      if (dist <= maxDist && dist < bestDist){ best = d; bestDist = dist; }
    });
    return best;
  }

  function nearestHideoutSpot(pos, maxDist){
    let best = null, bestDist = Infinity;
    MAP.hideoutSpots.forEach((spot) => {
      const dist = Math.hypot(pos.x - spot.x, pos.y - spot.y);
      if (dist <= maxDist && dist < bestDist){ best = spot; bestDist = dist; }
    });
    return best;
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

  // Habilidade "Trancar porta": tranca instantaneamente a porta mais perto
  // (sem canalizar, ao contrário da mecânica base de trancar parado) por
  // `duration` segundos, ou até o Assassino arrombar antes disso — o que
  // vier primeiro. Retorna o índice da porta trancada (pra sincronizar
  // pela rede) ou -1 se não achou nenhuma porta perto o bastante.
  function instantLockNearestDoor(pos){
    const cfg = Game.CONFIG.abilities.survivor.barricade;
    const index = doors.findIndex((d) => d === nearestDoor(pos, cfg.radius));
    if (index < 0) return -1;
    lockDoorByIndex(index);
    return index;
  }

  function lockDoorByIndex(index){
    const door = doors[index];
    if (!door) return;
    door.setLocked(true);
    setTimeout(() => {
      if (door.state.locked) door.setLocked(false);
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

  // rastro de poeira ao correr — puramente decorativo, some sozinho
  function spawnDust(x, y){
    const div = document.createElement('div');
    div.className = 'dust';
    div.style.left = x + 'px';
    div.style.top = y + 'px';
    arena.appendChild(div);
    setTimeout(() => div.remove(), 550);
  }

  // bússola de direção do Assassino — complemento visual ao áudio 3D, só
  // pro Sobrevivente e só dentro do alcance do batimento cardíaco
  const killerCompassEl = document.getElementById('killer-compass');
  const killerCompassArrowEl = document.getElementById('killer-compass-arrow');
  function updateKillerCompass(localPos, killerPos, maxDistance){
    if (!killerPos){ killerCompassEl.classList.remove('active'); return; }
    const dx = killerPos.x - localPos.x, dy = killerPos.y - localPos.y;
    if (Math.hypot(dx, dy) > maxDistance){ killerCompassEl.classList.remove('active'); return; }
    killerCompassEl.classList.add('active');
    const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
    killerCompassArrowEl.style.transform = `rotate(${angleDeg + 90}deg)`;
  }

  // vinheta vermelha nas bordas — reforço visual de tensão junto com o
  // batimento cardíaco, mesma proximidade, só que sempre visível mesmo
  // sem fone/som ligado
  function updateDangerVignette(localPos, killerPos, maxDistance){
    if (!killerPos){ dangerVignetteEl.style.setProperty('--danger', 0); return; }
    const dist = Math.hypot(killerPos.x - localPos.x, killerPos.y - localPos.y);
    const proximity = Math.max(0, 1 - dist / maxDistance);
    dangerVignetteEl.style.setProperty('--danger', (proximity * proximity).toFixed(2));
  }

  // ---------- câmera ----------
  // Em vez de encolher o mapa inteiro pra caber na tela (ficava minúsculo
  // no celular), a câmera segue o personagem local com um zoom fixo — o
  // mapa é maior que a tela de propósito, só uma janela ao redor do
  // personagem fica visível (dá pra sobrar um "spotlight" de #lighting
  // por cima, ver updateCamera).
  const CAMERA_ZOOM_DESKTOP = 1.3;
  const CAMERA_ZOOM_MOBILE = 1.7;

  function currentZoom(){
    return Game.Input.isTouchDevice ? CAMERA_ZOOM_MOBILE : CAMERA_ZOOM_DESKTOP;
  }

  function updateCamera(followPos){
    const zoom = currentZoom();
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const halfW = viewW / zoom / 2;
    const halfH = viewH / zoom / 2;

    const camX = MAP.width > halfW * 2
      ? Math.max(halfW, Math.min(MAP.width - halfW, followPos.x))
      : MAP.width / 2;
    const camY = MAP.height > halfH * 2
      ? Math.max(halfH, Math.min(MAP.height - halfH, followPos.y))
      : MAP.height / 2;

    const offsetX = viewW / 2 - camX * zoom;
    const offsetY = viewH / 2 - camY * zoom;
    arena.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`;

    const screenX = offsetX + followPos.x * zoom;
    const screenY = offsetY + followPos.y * zoom;
    drawLighting(followPos, screenX, screenY, offsetX, offsetY, zoom);
  }

  // ---------- iluminação por linha de visão (paredes bloqueiam a luz) ----------
  // Polígono de visibilidade calculado por raycasting em espaço de tela:
  // um raio pra cada canto de parede (± uma fração de grau, pra pegar a
  // sombra "colada" na quina) mais um leque de raios uniformes pra manter a
  // borda arredondada onde não tem parede nenhuma por perto. Cada raio para
  // na primeira parede que encontrar (ou no raio máximo de visão).
  function wallSegmentsScreen(walls, offsetX, offsetY, zoom){
    const segs = [];
    walls.forEach((w) => {
      const x1 = offsetX + w.x * zoom, y1 = offsetY + w.y * zoom;
      const x2 = offsetX + (w.x + w.w) * zoom, y2 = offsetY + (w.y + w.h) * zoom;
      segs.push({ x1, y1, x2, y2: y1 });
      segs.push({ x1: x2, y1, x2, y2 });
      segs.push({ x1: x2, y1: y2, x2: x1, y2 });
      segs.push({ x1, y1: y2, x2: x1, y2: y1 });
    });
    return segs;
  }

  function raySegmentT(ox, oy, dx, dy, seg){
    const sx = seg.x2 - seg.x1, sy = seg.y2 - seg.y1;
    const denom = dx * sy - dy * sx;
    if (Math.abs(denom) < 1e-10) return null;
    const t = ((seg.x1 - ox) * sy - (seg.y1 - oy) * sx) / denom;
    const u = ((seg.x1 - ox) * dy - (seg.y1 - oy) * dx) / denom;
    if (t >= 0 && u >= 0 && u <= 1) return t;
    return null;
  }

  function visibilityPolygon(originX, originY, segments, maxRadius){
    const EPS = 0.00005;
    const angles = new Set();
    const RAYS = 60;
    for (let i = 0; i < RAYS; i++) angles.add((i / RAYS) * Math.PI * 2);
    segments.forEach((seg) => {
      [[seg.x1, seg.y1], [seg.x2, seg.y2]].forEach(([px, py]) => {
        const a = Math.atan2(py - originY, px - originX);
        angles.add(a - EPS); angles.add(a); angles.add(a + EPS);
      });
    });

    const points = [...angles].map((angle) => {
      const dx = Math.cos(angle), dy = Math.sin(angle);
      let minT = maxRadius;
      segments.forEach((seg) => {
        const t = raySegmentT(originX, originY, dx, dy, seg);
        if (t !== null && t < minT) minT = t;
      });
      return { x: originX + dx * minT, y: originY + dy * minT, angle };
    });
    points.sort((a, b) => a.angle - b.angle);
    return points;
  }

  let lightingCanvasW = 0, lightingCanvasH = 0;
  const lightingCtx = lightingEl.getContext ? lightingEl.getContext('2d') : null;

  function drawLighting(followWorldPos, followScreenX, followScreenY, offsetX, offsetY, zoom){
    if (!lightingCtx) return; // navegador sem canvas: fica sem o efeito, sem quebrar o jogo
    const w = window.innerWidth, h = window.innerHeight;
    if (w !== lightingCanvasW || h !== lightingCanvasH){
      lightingEl.width = w; lightingEl.height = h;
      lightingCanvasW = w; lightingCanvasH = h;
    }
    const ctx = lightingCtx;
    const zoomPx = Game.CONFIG.visionRadius * zoom;
    const maxRadius = zoomPx + 220;

    // otimização: só considera paredes que realmente podem tocar o raio
    // máximo de visão — evita gastar tempo com paredes do outro lado do
    // mapa (importante com mapas grandes/muitas salas) e deixa a
    // iluminação mais leve em celulares fracos
    const maxRadiusWorld = maxRadius / zoom;
    const nearbyWalls = allWalls().filter((wl) => {
      const cx = Math.max(wl.x, Math.min(followWorldPos.x, wl.x + wl.w));
      const cy = Math.max(wl.y, Math.min(followWorldPos.y, wl.y + wl.h));
      return Math.hypot(followWorldPos.x - cx, followWorldPos.y - cy) <= maxRadiusWorld;
    });

    const segs = wallSegmentsScreen(nearbyWalls, offsetX, offsetY, zoom);
    const poly = visibilityPolygon(followScreenX, followScreenY, segs, maxRadius);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(4,3,6,0.98)';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.beginPath();
    poly.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    ctx.closePath();
    ctx.clip();

    ctx.globalCompositeOperation = 'destination-out';
    const grad = ctx.createRadialGradient(followScreenX, followScreenY, 0, followScreenX, followScreenY, zoomPx + 60);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(Math.min(1, zoomPx / (zoomPx + 60)), 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function beginMatchUi(){
    stage.style.display = 'flex';
    Game.Input.init();
    Game.Audio.init();
    Game.Audio.startAmbient();
    if (Game.Input.isTouchDevice) document.getElementById('hint').style.display = 'none';
  }

  function hideMatchUi(){
    stage.style.display = 'none';
    Game.Audio.stopHeartbeat();
    Game.Audio.stopAmbient();
    killerCompassEl.classList.remove('active');
    dangerVignetteEl.style.setProperty('--danger', 0);
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
    const hideout = Game.createHideout();
    let lastKnownPlayerPos = { x: MAP.player.x, y: MAP.player.y };

    const abilityCfg = Game.CONFIG.abilities.survivor[abilityKey] || Game.CONFIG.abilities.survivor.sprint;
    const survivorAbility = Game.createAbility(abilityCfg);
    const killerDash = Game.createAbility(Game.CONFIG.abilities.killerDash);

    player.state.pos.x = MAP.player.x; player.state.pos.y = MAP.player.y;
    killer.state.pos.x = MAP.killer.x; killer.state.pos.y = MAP.killer.y;
    player.applyVisuals();
    killer.applyVisuals();
    playerEl.querySelector('.label').textContent = name || 'Sobrevivente';
    killer.render();

    beginMatchUi();
    Game.Input.setAbilityButtonsVisible(true, false);

    let distraction = null; // { x, y, until } — pra onde a IA vai correr em vez do jogador
    const matchStartAt = performance.now();
    let lastStepAt = 0;

    let matchOver = false;
    function endMatch(won, detail){
      if (matchOver) return;
      matchOver = true;
      Game.Audio.stopHeartbeat();
      const elapsed = Math.round((performance.now() - matchStartAt) / 1000);
      const doneCount = updateObjectivesStatus();
      const fullDetail = `${detail} · Tempo: ${elapsed}s · Objetivos: ${doneCount}/${objectives.length}`;
      Game.Menu.showResult(won, fullDetail, () => startSolo(name, abilityKey));
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

    // desvio de obstáculo simples: quando a IA fica "colada" numa parede (mal
    // se move na direção do alvo), desvia perpendicular por um tempo antes
    // de voltar a mirar direto no alvo — sem pathfinding de verdade, só o
    // suficiente pra não ficar travada burra numa quina
    let aiStuckTimer = 0;
    let aiLastPos = null;
    let aiNudgeUntil = 0;
    let aiNudgeDir = 1;

    function updateKillerAI(delta){
      if (capture.state.captured || killer.state.isAttacking){ killer.render(); return; }
      if (!hideout.state.hidden) lastKnownPlayerPos = { x: player.state.pos.x, y: player.state.pos.y };
      const cfg = killer.characterConfig();
      // escondido = "invisível": a IA mira no último lugar visto em vez de
      // seguir através do esconderijo, igual à Camuflagem faria se a IA
      // usasse visão restrita
      const targetingPlayer = !(distraction && performance.now() < distraction.until) && !hideout.state.hidden;
      const target = (distraction && performance.now() < distraction.until) ? distraction
        : (hideout.state.hidden ? lastKnownPlayerPos : player.state.pos);
      const dx = target.x - killer.state.pos.x;
      const dy = target.y - killer.state.pos.y;
      const dist = Math.hypot(dx, dy);

      // porta trancada no caminho: arromba em vez de desviar (não faz
      // sentido "evitar" uma parede que ele consegue derrubar)
      let nearLockedDoor = false;
      doors.forEach((d, index) => {
        if (!d.state.locked) return;
        const near = Math.hypot(killer.state.pos.x - d.center.x, killer.state.pos.y - d.center.y) <= Game.CONFIG.door.radius;
        if (near) nearLockedDoor = true;
        d.progressBreak(delta, near);
      });

      if (killerDash.ready() && dist > 220) killerDash.trigger();
      const speed = killerDash.state.activeLeft > 0
        ? cfg.speed * Game.CONFIG.abilities.killerDash.speedMultiplier
        : cfg.speed;

      if (targetingPlayer && dist <= cfg.attackRange){
        Game.Audio.playAttackSwing();
        killer.tryAttack(attemptKillerHit);
        killer.setMoving(false);
        aiStuckTimer = 0;
      } else {
        let moveDx = dx, moveDy = dy;
        const now = performance.now();
        if (now < aiNudgeUntil && !nearLockedDoor){
          const len = dist || 1;
          moveDx = dx + (-dy / len) * aiNudgeDir * len;
          moveDy = dy + (dx / len) * aiNudgeDir * len;
        }
        const moved = moveTowards(killer.state, cfg, { x: moveDx, y: moveDy }, delta, speed);
        killer.setFacing(killer.state.facingRight);
        killer.setMoving(moved);

        if (aiLastPos && now >= aiNudgeUntil && !nearLockedDoor){
          const movedDist = Math.hypot(killer.state.pos.x - aiLastPos.x, killer.state.pos.y - aiLastPos.y);
          if (movedDist < speed * delta * 0.3 && dist > cfg.attackRange){
            aiStuckTimer += delta;
            if (aiStuckTimer > 0.3){
              aiNudgeDir = Math.random() < 0.5 ? -1 : 1;
              aiNudgeUntil = now + 650;
              aiStuckTimer = 0;
            }
          } else {
            aiStuckTimer = 0;
          }
        }
      }
      aiLastPos = { x: killer.state.pos.x, y: killer.state.pos.y };
      killer.render();
    }

    function triggerSurvivorAbility(){
      if (!survivorAbility.ready()) return;
      if (abilityKey === 'barricade'){
        if (instantLockNearestDoor(player.state.pos) < 0) return; // não tem porta perto o bastante
        survivorAbility.trigger();
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
      updateKillerCompass(player.state.pos, killer.state.pos, Game.CONFIG.heartbeatRange);
      updateDangerVignette(player.state.pos, killer.state.pos, Game.CONFIG.heartbeatRange);

      const ability1Requested = Game.Input.consumeAbility1Request();
      const attackPressed = Game.Input.consumeAttackRequest();

      if (capture.state.captured){
        if (attackPressed) capture.pulse();
      } else if (!capture.state.eliminated && hideout.state.hidden){
        if (attackPressed) hideout.exit(); // sai antes da hora, por vontade própria
        hideout.update(delta);
      } else if (!capture.state.eliminated){
        if (ability1Requested) triggerSurvivorAbility();

        const nearHideout = nearestHideoutSpot(player.state.pos, Game.CONFIG.hideout.radius);
        if (attackPressed && nearHideout){
          hideout.enter();
        } else {
          objectives.forEach((obj) => {
            const wasDone = obj.state.done;
            const hadSkillCheck = !!obj.state.skillCheck;
            const result = obj.update(delta, player.state.pos, hadSkillCheck && attackPressed);
            if (obj.state.done && !wasDone){
              const done = updateObjectivesStatus();
              if (done >= objectives.length) endMatch(true, 'Você completou todos os objetivos e escapou!');
            }
            // igual ao original: errar o skill check faz barulho alto e
            // entrega a posição — a IA vai investigar por um tempinho
            if (result.justFailed){
              Game.Audio.playError();
              distraction = { x: obj.state.pos.x, y: obj.state.pos.y, until: performance.now() + 3000 };
            }
          });
        }

        doors.forEach((d) => {
          const near = Math.hypot(player.state.pos.x - d.center.x, player.state.pos.y - d.center.y) <= Game.CONFIG.door.radius;
          d.progressLock(delta, near);
        });

        if (!player.state.isAttacking){
          const dir = Game.Input.readMovement();
          const sprintActive = abilityKey === 'sprint' && survivorAbility.state.activeLeft > 0;
          const speed = sprintActive
            ? player.characterConfig().speed * Game.CONFIG.abilities.survivor.sprint.speedMultiplier
            : undefined;
          const moved = moveTowards(player.state, player.characterConfig(), dir, delta, speed);
          player.setFacing(player.state.facingRight);
          player.setMoving(moved);
          if (moved && now - lastStepAt > 300){
            lastStepAt = now;
            Game.Audio.playFootstep();
            spawnDust(player.state.pos.x, player.state.pos.y + 14);
          }
        }
      }

      playerEl.classList.toggle('hidden-in-spot', hideout.state.hidden);
      updateKillerAI(delta);
      player.render();
      updateCamera(player.state.pos);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    setupPanel(player);
  }

  // =====================================================================
  // MODO ONLINE — N jogadores reais conectados via LAN ou P2P
  // =====================================================================
  function startOnline(net, localId, roster, mapLayoutIndex, resumeData){
    panel.style.display = 'none';
    const survivors = roster.filter((p) => p.role === 'survivor');
    buildWorld(survivors.length + 1, mapLayoutIndex || 0);

    const entries = new Map(); // id -> { info, char, el, capture?, eliminated, camouflaged }
    let survivorIndex = 0;

    roster.forEach((info) => {
      const el = charDom();
      const char = Game.createCharacter(info.role, el);
      char.applyVisuals();
      el.querySelector('.label').textContent = info.name + (info.id === localId ? ' (você)' : '');

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
      if (info.role === 'survivor'){
        entry.capture = Game.createCapture(el);
        entry.hideout = Game.createHideout();
      }
      entries.set(info.id, entry);
    });

    // reconexão no meio da partida: reaplica objetivos já feitos e quem já
    // tinha sido eliminado antes da queda, pra não voltar tudo do zero
    if (resumeData){
      (resumeData.doneObjectives || []).forEach((index) => {
        const obj = objectives[index];
        if (obj){ obj.state.done = true; obj.state.progress = 1; }
      });
      (resumeData.eliminatedIds || []).forEach((id) => {
        const entry = entries.get(id);
        if (entry){ entry.eliminated = true; entry.el.classList.add('eliminated'); }
      });
    }

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
    const matchStartAt = performance.now();
    let lastStepAt = 0;

    let matchOver = false;
    function endMatch(won, detail, announce){
      if (matchOver) return;
      matchOver = true;
      Game.Audio.stopHeartbeat();
      if (announce) net.sendEvent({ kind: 'matchEnd', result: won ? 'survivors' : 'killer' });
      const localWon = localEntry.info.role === 'killer' ? !won : won;
      const elapsed = Math.round((performance.now() - matchStartAt) / 1000);
      const doneCount = updateObjectivesStatus();
      const aliveCount = activeSurvivors().length;
      const fullDetail = `${detail} · Tempo: ${elapsed}s · Objetivos: ${doneCount}/${objectives.length} · Sobreviventes vivos: ${aliveCount}/${survivors.length}`;
      Game.Menu.showResult(localWon, fullDetail, null); // "jogar de novo" online volta pro lobby (ver menu.js)
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

      if (data.kind === 'doorForceLock'){
        lockDoorByIndex(data.index);
        return;
      }

      if (data.kind === 'doorLocked'){
        if (doors[data.index]) doors[data.index].setLocked(true);
        return;
      }

      if (data.kind === 'doorBroken'){
        if (doors[data.index]) doors[data.index].setLocked(false);
        return;
      }

      if (data.kind === 'distractPing'){
        spawnPingMarker(data.x, data.y, Game.CONFIG.abilities.survivor.distract.duration);
        return;
      }

      if (data.kind === 'objectiveFailed'){
        spawnPingMarker(data.x, data.y, 2.5);
        if (!isSurvivor) Game.Audio.playError(); // o Assassino ouve o barulho alto de verdade
        return;
      }

      if (data.kind === 'objectiveStarted'){
        if (!isSurvivor) Game.Audio.playObjectiveStart(); // aviso discreto, sem posição
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
        const index = instantLockNearestDoor(localEntry.char.state.pos);
        if (index < 0) return;
        localAbility1.trigger();
        net.sendEvent({ kind: 'doorForceLock', index });
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
        updateKillerCompass(localEntry.char.state.pos, killerPos, Game.CONFIG.heartbeatRange);
        updateDangerVignette(localEntry.char.state.pos, killerPos, Game.CONFIG.heartbeatRange);
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
      } else if (!eliminated && isSurvivor && localEntry.hideout.state.hidden){
        if (attackRequested) localEntry.hideout.exit(); // sai antes da hora, por vontade própria
        localEntry.hideout.update(delta);
      } else if (!eliminated){
        if (isSurvivor){
          if (ability1Requested) triggerLocalSurvivorAbility();

          const nearHideout = nearestHideoutSpot(localEntry.char.state.pos, Game.CONFIG.hideout.radius);
          if (attackRequested && nearHideout){
            localEntry.hideout.enter();
          } else {
            objectives.forEach((obj, index) => {
              const wasDone = obj.state.done;
              const hadSkillCheck = !!obj.state.skillCheck;
              // cooperação: cada Sobrevivente extra perto do mesmo objetivo
              // (além de quem está preenchendo) acelera 50% o preenchimento
              const helpers = activeSurvivors().filter((e) => e !== localEntry &&
                Math.hypot(e.char.state.pos.x - obj.state.pos.x, e.char.state.pos.y - obj.state.pos.y) <= Game.CONFIG.objective.radius).length;
              const result = obj.update(delta, localEntry.char.state.pos, hadSkillCheck && attackRequested, 1 + helpers * 0.5);
              if (obj.state.done && !wasDone){
                net.sendEvent({ kind: 'objectiveDone', index });
                checkWinFromObjectives();
              }
              // igual ao original: errar o skill check faz barulho alto e
              // entrega a posição pro Assassino (e marca o ponto pra
              // todo mundo, mesma técnica do ping de Distrair)
              if (result.justFailed){
                spawnPingMarker(obj.state.pos.x, obj.state.pos.y, 2.5);
                net.sendEvent({ kind: 'objectiveFailed', x: obj.state.pos.x, y: obj.state.pos.y });
              }
              // aviso discreto sem posição — só avisa que "algo está
              // acontecendo em algum gerador", pedido do usuário
              if (result.justStarted) net.sendEvent({ kind: 'objectiveStarted' });
            });
          }

          doors.forEach((d, index) => {
            const near = Math.hypot(localEntry.char.state.pos.x - d.center.x, localEntry.char.state.pos.y - d.center.y) <= Game.CONFIG.door.radius;
            if (d.progressLock(delta, near)) net.sendEvent({ kind: 'doorLocked', index });
          });
        } else {
          if (ability1Requested) localAbility1.trigger();
          if (ability2Requested) localAbility2.trigger();
          if (attackRequested){
            Game.Audio.playAttackSwing();
            localEntry.char.tryAttack(attemptKillerHit);
          }
          doors.forEach((d, index) => {
            const near = Math.hypot(localEntry.char.state.pos.x - d.center.x, localEntry.char.state.pos.y - d.center.y) <= Game.CONFIG.door.radius;
            if (d.progressBreak(delta, near)) net.sendEvent({ kind: 'doorBroken', index });
          });
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
          if (moved && now - lastStepAt > 300){
            lastStepAt = now;
            Game.Audio.playFootstep();
            spawnDust(localEntry.char.state.pos.x, localEntry.char.state.pos.y + 14);
          }
        }
      }

      if (isSurvivor) localEntry.el.classList.toggle('hidden-in-spot', localEntry.hideout.state.hidden);
      localEntry.char.render();
      updateCamera(localEntry.char.state.pos);

      if (now - lastStateSent > 70){
        lastStateSent = now;
        net.sendState({
          x: localEntry.char.state.pos.x,
          y: localEntry.char.state.pos.y,
          facingRight: localEntry.char.state.facingRight,
          moving: localEntry.el.classList.contains('running'),
          camouflaged: isSurvivor && ((localAbilityKey === 'camouflage' && localAbility1.state.activeLeft > 0) || localEntry.hideout.state.hidden),
        });
      }

      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  // reconexão: servidor manda o roster + progresso atual da partida em
  // andamento (matchResume) em vez de matchStart — retoma de onde parou
  // em vez de reconstruir a partida do zero.
  function resumeOnline(net, localId, roster, mapLayoutIndex, doneObjectives, eliminatedIds){
    startOnline(net, localId, roster, mapLayoutIndex, { doneObjectives, eliminatedIds });
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
  Game.resumeOnline = resumeOnline;
  Game.hideMatchUi = hideMatchUi;
})();
