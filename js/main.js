window.Game = window.Game || {};

(function(){
  "use strict";

  const stage = document.getElementById('stage');
  const arena = document.getElementById('arena');
  const lightingEl = document.getElementById('lighting');
  const dangerVignetteEl = document.getElementById('danger-vignette');
  const rotateDismissBtn = document.getElementById('rotate-dismiss');
  if (localStorage.getItem('dbd_rotate_dismissed') === '1') document.body.classList.add('rotate-dismissed');
  rotateDismissBtn.addEventListener('click', () => {
    document.body.classList.add('rotate-dismissed');
    localStorage.setItem('dbd_rotate_dismissed', '1');
  });
  // rede de segurança: some sozinho depois de alguns segundos, mesmo que o
  // toque no botão não funcione por algum motivo (navegador estranho, dedo
  // errou o botão, etc.) — nunca pode ficar preso bloqueando o jogo
  let rotateAutoHideTimer = null;
  const objectivesStatus = document.getElementById('objectives-status');
  const abilityHudEl = document.getElementById('ability-hud');
  const panel = document.getElementById('panel');
  const MAP = Game.MAP;

  let objectives = [];
  let doors = [];
  let pallets = [];
  let windows = [];
  let gates = [];
  let hooks = [];
  let currentLayoutWalls = [];
  let currentKillerSpawn = MAP.killer; // atualizado em buildWorld() — varia por layout (ver map.js)

  // incrementado a cada startOnline/resumeOnline — cada loop guarda o valor
  // que estava vigente quando ele nasceu e para sozinho se um mais novo
  // assumir (ver `loop()` dentro de startOnline). Existe pra reconexão
  // automática (menu.js): quando a rede cai e reconecta sozinha no meio de
  // uma partida, o servidor manda matchResume de novo, chamando startOnline
  // uma 2ª vez — sem isso, o loop antigo (cego pra rede caída, mas não
  // travado) continuava rodando em paralelo, consumindo input junto com o
  // novo.
  let onlineSessionId = 0;

  // ---------- mundo (mapa + objetivos + portas + esconderijos + portões + ganchos), compartilhado entre solo e online ----------
  function buildWorld(objectiveCount, layoutIndex){
    arena.querySelectorAll('.wall, .objective, .char, .ping-marker, .trap-marker, .door, .pallet, .window, .hideout-spot, .gate, .hook').forEach((n) => n.remove());
    arena.style.width = MAP.width + 'px';
    arena.style.height = MAP.height + 'px';

    const layout = MAP.layouts[layoutIndex % MAP.layouts.length];
    currentLayoutWalls = layout.walls;
    currentKillerSpawn = layout.killerSpawn || MAP.killer;
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

    pallets = layout.pallets.map((rect) => {
      const div = document.createElement('div');
      div.className = 'pallet';
      div.style.left = rect.x + 'px';
      div.style.top = rect.y + 'px';
      div.style.width = rect.w + 'px';
      div.style.height = rect.h + 'px';
      arena.appendChild(div);
      return Game.createPallet(rect, div);
    });

    windows = layout.windows.map((rect) => {
      const div = document.createElement('div');
      div.className = 'window';
      div.style.left = rect.x + 'px';
      div.style.top = rect.y + 'px';
      div.style.width = rect.w + 'px';
      div.style.height = rect.h + 'px';
      arena.appendChild(div);
      return Game.createWindow(rect, div);
    });

    MAP.hideoutSpots.forEach((spot) => {
      const div = document.createElement('div');
      div.className = 'hideout-spot';
      div.style.left = spot.x + 'px';
      div.style.top = spot.y + 'px';
      arena.appendChild(div);
    });

    gates = MAP.gateSpots.map((spot) => {
      const div = document.createElement('div');
      div.className = 'gate';
      div.style.left = spot.x + 'px';
      div.style.top = spot.y + 'px';
      div.innerHTML = '<div class="gate-progress"></div>';
      arena.appendChild(div);
      return Game.createGate(spot, div);
    });

    hooks = MAP.hookSpots.map((spot) => {
      const div = document.createElement('div');
      div.className = 'hook';
      div.style.left = spot.x + 'px';
      div.style.top = spot.y + 'px';
      arena.appendChild(div);
      return { pos: spot, el: div, occupiedBy: null };
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
    // pallet em pé não bloqueia nada; derrubado vira parede de verdade —
    // papel invertido do de porta (trancada = parede), mesma técnica
    const droppedPalletWalls = pallets.filter((p) => p.state.dropped).map((p) => p.state.rect);
    const extra = lockedDoorWalls.concat(droppedPalletWalls);
    return extra.length ? currentLayoutWalls.concat(extra) : currentLayoutWalls;
  }

  // só pra colisão (allWalls acima) o pallet derrubado bloqueia igual
  // parede — pra ILUMINAÇÃO ele NÃO deveria (é baixo, dá pra ver por cima,
  // igual o pallet de verdade do jogo original). Incluí-lo no raycasting
  // de luz criava uma sombra desproporcional bem perto da câmera (o
  // pallet cai a poucos px do jogador) — um objeto pequeno "tampando"
  // metade da tela, parecendo bug de iluminação. Portas trancadas
  // continuam bloqueando visão normalmente (são paredes de verdade).
  function visionBlockingWalls(){
    const lockedDoorWalls = doors.filter((d) => d.state.locked).map((d) => d.state.rect);
    return lockedDoorWalls.length ? currentLayoutWalls.concat(lockedDoorWalls) : currentLayoutWalls;
  }

  // helper genérico pro padrão repetido "o item mais próximo de pos, dentro
  // de um raio máximo (padrão infinito), que passa num filtro opcional" —
  // usado por toda a família nearestX abaixo (porta, pallet, esconderijo,
  // gancho, gerador, portão). getPos extrai a posição de cada item porque
  // cada lista guarda isso num lugar diferente (d.center, o.state.pos, etc).
  function nearestBy(list, pos, getPos, { maxDist = Infinity, filter } = {}){
    let best = null, bestDist = Infinity;
    list.forEach((item) => {
      if (filter && !filter(item)) return;
      const p = getPos(item);
      const dist = Math.hypot(pos.x - p.x, pos.y - p.y);
      if (dist <= maxDist && dist < bestDist){ best = item; bestDist = dist; }
    });
    return best;
  }

  function nearestDoor(pos, maxDist){
    return nearestBy(doors, pos, (d) => d.center, { maxDist });
  }

  // pallet mais perto ainda "em pé" (só esses contam pra derrubar — um já
  // caído ou quebrado não é candidato de novo)
  function nearestPallet(pos, maxDist){
    return nearestBy(pallets, pos, (p) => p.center, { maxDist, filter: (p) => !p.state.dropped && !p.state.broken });
  }

  // gerador mais perto que ainda pode ser engajado (não terminado, fora do
  // alcance não conta) — usado pelo botão de ação pra entrar no modo de
  // reparo (engage()), última prioridade da cadeia de ações do Sobrevivente.
  function nearestEngageableObjective(pos){
    return nearestBy(objectives, pos, (o) => o.state.pos, { filter: (o) => o.canEngage(pos) });
  }

  // janela: nunca bloqueia ninguém, só muda a velocidade de quem está perto
  // do vão — Sobrevivente quase não perde, Assassino perde bastante. Isso é
  // o que cria o loop de perseguição (ver js/window.js).
  function windowSpeedMultiplier(pos, isKiller){
    const cfg = Game.CONFIG.window;
    const inside = windows.some((w) => Math.hypot(pos.x - w.center.x, pos.y - w.center.y) <= cfg.radius);
    if (!inside) return 1;
    return isKiller ? cfg.killerSpeedMultiplier : cfg.survivorSpeedMultiplier;
  }

  function nearestHideoutSpot(pos, maxDist){
    return nearestBy(MAP.hideoutSpots, pos, (spot) => spot, { maxDist });
  }

  // true se pos está perto o bastante de um portão JÁ ABERTO pra escapar
  // por ele (raio menor que o de canalizar — precisa realmente chegar lá)
  function nearOpenGate(pos){
    return gates.some((g) => g.state.open && Math.hypot(pos.x - g.state.pos.x, pos.y - g.state.pos.y) <= Game.CONFIG.gate.radius * 0.5);
  }

  // gancho livre mais perto, dentro do alcance — um gancho já ocupado não
  // conta (só 1 corpo por gancho de cada vez)
  function nearestFreeHook(pos, maxDist){
    return nearestBy(hooks, pos, (h) => h.pos, { maxDist, filter: (h) => !h.occupiedBy });
  }

  function setHookOccupied(hook, entryOrId){
    hook.occupiedBy = entryOrId || null;
    hook.el.classList.toggle('occupied', !!hook.occupiedBy);
  }

  // Sobrevivente derrubou um pallet: se o Assassino estava perto o bastante
  // NESSE instante, é atordoado — a recompensa por deixar ele chegar perto
  // demais antes de derrubar (checagem de proximidade feita por fora, igual
  // o resto do jogo — capture.js/door.js não sabem de posição sozinhos)
  function attemptPalletStun(pallet, killerPos, onStun){
    const dist = Math.hypot(killerPos.x - pallet.center.x, killerPos.y - pallet.center.y);
    if (dist <= Game.CONFIG.pallet.stunRadius) onStun();
  }

  // ponto de onde o golpe do Assassino realmente sai — um pouco à frente
  // do centro dele, espelhado pro lado que está virado (facingRight),
  // em vez de sempre do centro do corpo pra qualquer direção
  function attackOrigin(killerState, killerCfg){
    const offset = killerCfg.attackForwardOffset || 0;
    return {
      x: killerState.pos.x + (killerState.facingRight ? offset : -offset),
      y: killerState.pos.y,
    };
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

  // SFX ambiente (porta/pallet quebrando etc.) só toca se quem vai ouvir
  // estiver perto o bastante da fonte — ver Game.CONFIG.sfxRadius
  function withinSfxRadius(listenerPos, sourcePos){
    return Math.hypot(listenerPos.x - sourcePos.x, listenerPos.y - sourcePos.y) <= Game.CONFIG.sfxRadius;
  }

  function spawnPingMarker(x, y, durationSec){
    const div = document.createElement('div');
    div.className = 'ping-marker';
    div.style.left = x + 'px';
    div.style.top = y + 'px';
    arena.appendChild(div);
    setTimeout(() => div.remove(), durationSec * 1000);
  }

  // Armadilha do Assassino (habilidade killerTrap) — diferente do ping (que
  // some sozinho depois de `durationSec`), o marcador da armadilha precisa
  // ser removido manualmente no exato instante em que ela dispara (por isso
  // retorna o elemento em vez de agendar o próprio remove()).
  function spawnTrapMarker(x, y){
    const div = document.createElement('div');
    div.className = 'trap-marker';
    div.style.left = x + 'px';
    div.style.top = y + 'px';
    arena.appendChild(div);
    return div;
  }

  // Ruído (modo online) — substitui o que antes eram 3 kinds de evento
  // quase idênticos (distractPing/objectiveFailed/hideoutNoise), sempre o
  // mesmo padrão "marcador visual + evento de rede + só o Assassino reage".
  // Unificados num só kind:'noise' com raio de audição de verdade — antes
  // o Assassino ouvia não importa a distância, agora só se estiver dentro
  // de `radius` (ver o handler em startOnline). ping=0 não desenha marcador
  // (usado pelo aviso discreto de gerador, que não revela posição).
  function emitNoiseOnline(net, x, y, { radius = Infinity, ping = 2.5, sound = 'error' } = {}){
    if (ping > 0) spawnPingMarker(x, y, ping);
    net.sendEvent({ kind: 'noise', x, y, radius, ping, sound });
  }

  // Ruído (modos solo) — mesma ideia, mas sem rede: só reage se quem
  // escuta (a IA Assassina em startSolo, ou o jogador-Assassino em
  // startSoloAsKiller) estiver dentro do raio. `onHeard` decide o que fazer
  // (setar `distraction` pra IA, ou tocar som pro jogador).
  function emitNoiseSolo(sourcePos, listenerPos, radius, onHeard){
    if (Math.hypot(sourcePos.x - listenerPos.x, sourcePos.y - listenerPos.y) > radius) return;
    onHeard();
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

  // ---------- câmera + iluminação ----------
  // Extraído para js/lighting.js (Game.createLighting) — não tem nenhuma
  // dependência de qual modo de jogo está rodando, só do personagem local e
  // das paredes que bloqueiam visão naquele instante (visionBlockingWalls()
  // abaixo, que É específico do mundo desta partida e continua aqui).
  const lighting = Game.createLighting(arena, lightingEl);

  function beginMatchUi(){
    stage.style.display = 'flex';
    document.body.classList.add('in-match'); // liga o aviso de girar o celular (só existe durante a partida, não no menu)
    if (localStorage.getItem('dbd_rotate_dismissed') !== '1'){
      rotateAutoHideTimer = setTimeout(() => document.body.classList.add('rotate-dismissed'), 6000);
    }
    Game.Input.init();
    Game.Audio.init();
    Game.Audio.startAmbient();
    if (Game.Input.isTouchDevice) document.getElementById('hint').style.display = 'none';
  }

  function hideMatchUi(){
    stage.style.display = 'none';
    document.body.classList.remove('in-match');
    if (rotateAutoHideTimer){ clearTimeout(rotateAutoHideTimer); rotateAutoHideTimer = null; }
    // some sozinho só nessa partida (a menos que tenha sido dispensado de
    // vez pelo botão) — próxima partida mostra o aviso de novo brevemente
    if (localStorage.getItem('dbd_rotate_dismissed') !== '1') document.body.classList.remove('rotate-dismissed');
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
      '<div class="body"><div class="torso"></div></div>' +
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
  function startSolo(name, abilityKey, abilityKey2){
    panel.style.display = '';
    buildWorld(Game.CONFIG.generatorCount, randomLayoutIndex());

    const playerEl = charDom();
    const killerEl = charDom();
    const player = Game.createCharacter('survivor', playerEl);
    const killer = Game.createCharacter('killer', killerEl);
    const capture = Game.createCapture(playerEl);
    const hideout = Game.createHideout();
    const health = Game.createHealth(playerEl);
    let lastKnownPlayerPos = { x: MAP.player.x, y: MAP.player.y };
    let gatesActive = false; // vira true quando os 5 geradores terminam

    const abilityCfg = Game.CONFIG.abilities.survivor[abilityKey] || Game.CONFIG.abilities.survivor.sprint;
    const abilityCfg2 = Game.CONFIG.abilities.survivor[abilityKey2] || Game.CONFIG.abilities.survivor.camouflage;
    const survivorAbility = Game.createAbility(abilityCfg);
    const survivorAbility2 = Game.createAbility(abilityCfg2);
    const killerDash = Game.createAbility(Game.CONFIG.abilities.killerDash);

    player.state.pos.x = MAP.player.x; player.state.pos.y = MAP.player.y;
    killer.state.pos.x = currentKillerSpawn.x; killer.state.pos.y = currentKillerSpawn.y;
    player.applyVisuals();
    killer.applyVisuals();
    playerEl.querySelector('.label').textContent = name || 'Sobrevivente';
    killer.render();

    beginMatchUi();
    Game.Input.setAbilityButtonsVisible(true, false, null, true);

    let distraction = null; // { x, y, until } — pra onde a IA vai correr em vez do jogador
    const matchStartAt = performance.now();
    let lastStepAt = 0;
    let heldHook = null; // gancho ocupado agora (pra liberar quando soltar/resgatar/sacrificar)

    let matchOver = false;
    function endMatch(won, detail){
      if (matchOver) return;
      matchOver = true;
      Game.Audio.stopHeartbeat();
      const elapsed = Math.round((performance.now() - matchStartAt) / 1000);
      const doneCount = updateObjectivesStatus();
      const fullDetail = `${detail} · Tempo: ${elapsed}s · Objetivos: ${doneCount}/${objectives.length}`;
      Game.Menu.showResult(won, fullDetail, () => startSolo(name, abilityKey, abilityKey2), 'survivor');
    }

    function attemptKillerHit(){
      const origin = attackOrigin(killer.state, killer.characterConfig());
      const dx = player.state.pos.x - origin.x;
      const dy = player.state.pos.y - origin.y;
      if (Math.hypot(dx, dy) > killer.characterConfig().attackRange) return;
      if (capture.state.captured || capture.state.eliminated) return; // já caído, o golpe não faz mais nada

      // 1º golpe machuca (fica ferido, mais lento, dá pra curar sozinho);
      // só o 2º derruba de vez (aí sim entra a struggle bar de sempre) —
      // igual ao jogo original em vez de cair capturado de primeira
      if (!health.state.injured){
        Game.Audio.playAttackSwing();
        health.hit();
        Game.Input.vibrate(120);
        player.playHit();
        playerEl.classList.add('hit-flash');
        setTimeout(() => playerEl.classList.remove('hit-flash'), 200);
        return;
      }

      Game.Audio.playCaptureHit();
      capture.down((result) => {
        if (result === 'eliminated') endMatch(false, 'Você foi sacrificado no gancho.');
      });
    }

    // desvio de obstáculo simples: quando a IA fica "colada" numa parede (mal
    // se move na direção do alvo), desvia perpendicular por um tempo antes
    // de voltar a mirar direto no alvo — sem pathfinding de verdade, só o
    // suficiente pra não ficar travada burra numa quina
    let aiStuckTimer = 0;
    let aiLastPos = null;
    let aiNudgeUntil = 0;
    let aiNudgeDir = 1;

    // depois de derrubar: a IA precisa ir até o Sobrevivente caído, pegar,
    // carregar até um gancho livre e pendurar — só aí a luta de verdade
    // acontece (capture.js cuida do struggle em si; aqui só é o "andar até
    // lá" de cada sub-fase). Sem esconderijo/distração nessas fases —
    // encontrar o alvo é trivial (já está literalmente derrubado no lugar).
    function updateKillerAfterDown(delta){
      const cfg = killer.characterConfig();
      const cCfg = Game.CONFIG.capture;

      if (capture.state.downed){
        const dx = player.state.pos.x - killer.state.pos.x;
        const dy = player.state.pos.y - killer.state.pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= cCfg.pickUpRange){
          capture.pickUp();
          killer.setMoving(false);
        } else {
          const moved = moveTowards(killer.state, cfg, { x: dx, y: dy }, delta, cfg.speed);
          killer.setFacing(killer.state.facingRight);
          killer.setMoving(moved);
        }
        killer.render();
        return true;
      }

      if (capture.state.carried){
        // segue preso nas costas do Assassino a cada frame
        player.state.pos.x = killer.state.pos.x;
        player.state.pos.y = killer.state.pos.y;
        const hook = nearestFreeHook(killer.state.pos, Infinity);
        if (hook){
          const dx = hook.pos.x - killer.state.pos.x;
          const dy = hook.pos.y - killer.state.pos.y;
          const dist = Math.hypot(dx, dy);
          const speed = cfg.speed * cCfg.carrySpeedMultiplier;
          if (dist <= cCfg.hookRange){
            capture.hook(hook.pos);
            Game.Input.vibrate(250);
            player.state.pos.x = hook.pos.x;
            player.state.pos.y = hook.pos.y - 10; // um pouco acima do poste, parece pendurado nele
            setHookOccupied(hook, 'ai-survivor');
            heldHook = hook;
            killer.setMoving(false);
          } else {
            const moved = moveTowards(killer.state, cfg, { x: dx, y: dy }, delta, speed);
            killer.setFacing(killer.state.facingRight);
            killer.setMoving(moved);
          }
        }
        killer.render();
        return true;
      }

      if (capture.state.hooked){
        // já pendurou — fica de guarda perto do gancho (sem re-perseguir
        // ninguém, é o único Sobrevivente da partida)
        killer.setMoving(false);
        killer.render();
        return true;
      }

      return false;
    }

    function updateKillerAI(delta){
      if (killer.state.isAttacking){ killer.render(); return; }
      if (updateKillerAfterDown(delta)) return;
      // atordoado por pallet: parado, sem atacar, até o tempo passar —
      // nem checa porta/pallet/alvo enquanto isso
      if (performance.now() < killer.state.stunnedUntil){ killer.setMoving(false); killer.render(); return; }
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
        if (d.progressBreak(delta, near) && withinSfxRadius(player.state.pos, d.center)) Game.Audio.playDoorBreak();
      });

      // pallet já derrubado no caminho: quebra de vez em vez de desviar
      pallets.forEach((p) => {
        if (!p.state.dropped) return;
        const near = Math.hypot(killer.state.pos.x - p.center.x, killer.state.pos.y - p.center.y) <= Game.CONFIG.pallet.radius;
        if (near) nearLockedDoor = true; // reaproveita o mesmo "não desvia, resolve" da porta
        if (p.progressBreak(delta, near) && withinSfxRadius(player.state.pos, p.center)) Game.Audio.playPalletBreak();
      });

      if (killerDash.ready() && dist > 220) killerDash.trigger();
      let speed = killerDash.state.activeLeft > 0
        ? cfg.speed * Game.CONFIG.abilities.killerDash.speedMultiplier
        : cfg.speed;
      speed *= windowSpeedMultiplier(killer.state.pos, true);

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

    // genérico pros 2 slots de habilidade do Sobrevivente — o efeito extra
    // ao ativar (barricade tranca porta, distract solta um ping falso)
    // depende só de qual habilidade é, não de qual slot ela ocupa
    function triggerSurvivorAbilitySlot(key, cfg, ability){
      if (!ability.ready()) return;
      if (key === 'barricade'){
        if (instantLockNearestDoor(player.state.pos) < 0) return; // não tem porta perto o bastante
        ability.trigger();
        Game.Audio.playDoorLock();
        return;
      }
      ability.trigger();
      if (key === 'distract'){
        spawnPingMarker(player.state.pos.x, player.state.pos.y, cfg.duration);
        distraction = { x: player.state.pos.x, y: player.state.pos.y, until: performance.now() + cfg.duration * 1000 };
      }
    }
    function triggerSurvivorAbility(){ triggerSurvivorAbilitySlot(abilityKey, abilityCfg, survivorAbility); }
    function triggerSurvivorAbility2(){ triggerSurvivorAbilitySlot(abilityKey2, abilityCfg2, survivorAbility2); }

    let lastTime = performance.now();
    function loop(now){
      if (matchOver) return;
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      Game.Input.update();
      capture.update(delta);
      survivorAbility.update(delta);
      survivorAbility2.update(delta);
      killerDash.update(delta);
      updateAbilityHud([
        { label: abilityCfg.label, ability: survivorAbility },
        { label: abilityCfg2.label, ability: survivorAbility2 },
      ]);
      Game.Audio.updateHeartbeat(player.state.pos, killer.state.pos, Game.CONFIG.heartbeatRange);
      updateKillerCompass(player.state.pos, killer.state.pos, Game.CONFIG.heartbeatRange);
      updateDangerVignette(player.state.pos, killer.state.pos, Game.CONFIG.heartbeatRange);
      // saiu do gancho (fugiu, foi resgatado ou foi sacrificado) — libera pra outro corpo usar
      if (heldHook && !capture.state.hooked){ setHookOccupied(heldHook, null); heldHook = null; }

      const ability1Requested = Game.Input.consumeAbility1Request();
      const ability3Requested = Game.Input.consumeAbility3Request();
      const attackPressed = Game.Input.consumeAttackRequest();
      let engagedObjective = null; // gerador engajado pra reparar, se houver

      // segurança: se o Assassino derrubou o jogador ENQUANTO ele estava
      // engajado num gerador, o bloco de baixo nunca roda (captured entra
      // no branch de cima) e o gerador ficava com engaged:true travado pra
      // sempre — ao ser resgatado, o jogador reengajava sozinho nesse
      // mesmo gerador (agora longe dele), travado nele de novo sem
      // conseguir sair a não ser pelo botão X. Desengaja aqui, sempre que
      // captured, antes de mais nada.
      if (capture.state.captured){
        const staleEngaged = objectives.find((o) => o.state.engaged);
        if (staleEngaged) staleEngaged.disengage();
      }

      if (capture.state.captured){
        if (attackPressed) capture.pulse();
      } else if (!capture.state.eliminated && hideout.state.hidden){
        if (attackPressed) hideout.exit(); // sai antes da hora, por vontade própria
        const hideoutResult = hideout.update(delta);
        // ficou escondido tempo demais: entrega a posição igual a um
        // skill check errado (mesmo mecanismo já usado pra distração da IA)
        // — o som toca sempre (feedback pro jogador), mas a IA só reage se
        // estiver dentro do raio de audição (antes reagia não importa a distância)
        if (hideoutResult.madeNoise){
          Game.Audio.playError();
          emitNoiseSolo(player.state.pos, killer.state.pos, Game.CONFIG.noise.hideoutRadius, () => {
            distraction = { x: player.state.pos.x, y: player.state.pos.y, until: performance.now() + 3000 };
          });
        }
      } else if (!capture.state.eliminated){
        if (ability1Requested) triggerSurvivorAbility();
        if (ability3Requested) triggerSurvivorAbility2();
        const ability2Requested = Game.Input.consumeAbility2Request();

        // engajado num gerador: precisa ter apertado o botão de ação perto
        // dele antes (ver abaixo) — só chegar perto não progride mais nada.
        // Apertar o X (ability2) sai do modo de reparo a qualquer momento.
        engagedObjective = objectives.find((o) => o.state.engaged);
        if (engagedObjective){
          // botão X sempre funciona, mas não pode ser o ÚNICO jeito de
          // sair — qualquer intenção de andar (WASD/joystick/gamepad)
          // também desengaja na hora. Sem isso, engajar virava uma
          // armadilha de ponto único de falha: se o X por qualquer motivo
          // não registrasse (touch target, foco perdido, etc.), o jogador
          // ficava preso ali pro resto da partida, sem nenhum jeito de sair.
          const moveDir = Game.Input.readMovement();
          const movementIntent = Math.hypot(moveDir.x, moveDir.y) > 0.05;
          if (ability2Requested || movementIntent) engagedObjective.disengage();
          const wasDone = engagedObjective.state.done;
          const hadSkillCheck = !!engagedObjective.state.skillCheck;
          const result = engagedObjective.update(delta, player.state.pos, hadSkillCheck && attackPressed);
          if (engagedObjective.state.done && !wasDone){
            const done = updateObjectivesStatus();
            if (done >= objectives.length && !gatesActive){
              gatesActive = true;
              objectivesStatus.textContent = 'Geradores prontos! Ache um portão pra escapar.';
            }
          }
          if (result.great) Game.Audio.playSkillCheckGreat();
          // igual ao original: errar o skill check faz barulho alto e
          // entrega a posição — a IA vai investigar por um tempinho, se
          // estiver perto o bastante pra ouvir
          if (result.justFailed){
            Game.Audio.playError();
            Game.Input.vibrate([40, 40, 40]);
            emitNoiseSolo(engagedObjective.state.pos, killer.state.pos, Game.CONFIG.noise.skillCheckFailRadius, () => {
              distraction = { x: engagedObjective.state.pos.x, y: engagedObjective.state.pos.y, until: performance.now() + 3000 };
            });
          }
        } else {
          const nearHideout = nearestHideoutSpot(player.state.pos, Game.CONFIG.hideout.radius);
          const droppablePallet = nearestPallet(player.state.pos, Game.CONFIG.pallet.radius);
          const engageTarget = nearestEngageableObjective(player.state.pos);
          if (attackPressed && nearHideout){
            hideout.enter();
          } else if (attackPressed && droppablePallet && droppablePallet.drop()){
            Game.Audio.playPalletDrop();
            emitNoiseSolo(droppablePallet.center, killer.state.pos, Game.CONFIG.noise.palletDropRadius, () => {
              distraction = { x: droppablePallet.center.x, y: droppablePallet.center.y, until: performance.now() + 1200 };
            });
            attemptPalletStun(droppablePallet, killer.state.pos, () => {
              killer.state.stunnedUntil = performance.now() + Game.CONFIG.pallet.stunDuration * 1000;
            });
          } else if (attackPressed && engageTarget){
            engageTarget.engage();
            // gerador começou a ser mexido: aviso bem mais fraco que um
            // erro de skill check (não é um erro do jogador, só "a IA meio
            // que notou algo") — duração curta pra não virar um alerta
            // grátis toda vez que alguém liga num gerador
            distraction = { x: engageTarget.state.pos.x, y: engageTarget.state.pos.y, until: performance.now() + 1500 };
          }
        }

        gates.forEach((g) => {
          const near = Math.hypot(player.state.pos.x - g.state.pos.x, player.state.pos.y - g.state.pos.y) <= Game.CONFIG.gate.radius;
          if (g.progressOpen(delta, near, gatesActive)) Game.Audio.playGateOpen();
        });
        if (gatesActive && nearOpenGate(player.state.pos)){
          Game.Audio.playSurvivorEscape();
          endMatch(true, 'Você escapou pelo portão!');
        }

        doors.forEach((d) => {
          const near = Math.hypot(player.state.pos.x - d.center.x, player.state.pos.y - d.center.y) <= Game.CONFIG.door.radius;
          if (d.progressLock(delta, near)) Game.Audio.playDoorLock();
        });

        if (!player.state.isAttacking){
          if (engagedObjective){
            // travado reparando: sem movimento até sair do modo (X ou
            // terminar o gerador)
            health.update(delta, true);
            player.setMoving(false);
            player.setSprinting(false);
          } else {
            const dir = Game.Input.readMovement();
            const standingStill = Math.hypot(dir.x, dir.y) <= 0.05;
            health.update(delta, standingStill);

            const sprintActive = (abilityKey === 'sprint' && survivorAbility.state.activeLeft > 0) ||
              (abilityKey2 === 'sprint' && survivorAbility2.state.activeLeft > 0);
            let speed = player.characterConfig().speed;
            if (health.state.injured) speed *= Game.CONFIG.health.injuredSpeedMultiplier;
            if (sprintActive) speed *= Game.CONFIG.abilities.survivor.sprint.speedMultiplier;
            speed *= windowSpeedMultiplier(player.state.pos, false);
            const moved = moveTowards(player.state, player.characterConfig(), dir, delta, speed);
            player.setFacing(player.state.facingRight);
            player.setMoving(moved);
            player.setSprinting(sprintActive);
            if (moved && now - lastStepAt > (sprintActive ? 180 : 300)){
              lastStepAt = now;
              Game.Audio.playFootstep(sprintActive);
              spawnDust(player.state.pos.x, player.state.pos.y + 14);
              // sprint é mais rápido, mas arrisca ser ouvido de perto — sem
              // isso, sprint seria só velocidade de graça
              if (sprintActive){
                emitNoiseSolo(player.state.pos, killer.state.pos, Game.CONFIG.noise.sprintRadius, () => {
                  distraction = { x: player.state.pos.x, y: player.state.pos.y, until: performance.now() + 800 };
                });
              }
            }
          }
        }
      }

      playerEl.classList.toggle('hidden-in-spot', hideout.state.hidden);
      // X (ability2/Q) só aparece enquanto engajado num gerador, pra sair
      // do modo de reparo; R (ability3) é a 2ª habilidade de verdade, fica
      // sempre visível igual a E
      Game.Input.setAbilityButtonsVisible(true, !!engagedObjective, 'X', true);
      updateKillerAI(delta);
      player.render();
      lighting.update(player.state.pos, false, visionBlockingWalls());
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    setupPanel(player);
  }

  // =====================================================================
  // MODO SOLO COMO ASSASSINO — o jogador persegue, a IA foge e repara
  // sozinha. Espelha startSolo() (lá o jogador é o Sobrevivente e a IA
  // persegue); aqui é o oposto. Função separada em vez de generalizar
  // startSolo() com um parâmetro de papel — mantém a lógica já testada de
  // cada lado isolada, sem arriscar os dois caminhos numa refatoração só.
  // =====================================================================
  function startSoloAsKiller(name, killerAbilityKey){
    panel.style.display = 'none';
    buildWorld(Game.CONFIG.generatorCount, randomLayoutIndex());

    const killerEl = charDom();
    const survivorEl = charDom();
    const killer = Game.createCharacter('killer', killerEl);
    const survivor = Game.createCharacter('survivor', survivorEl);
    const aiCapture = Game.createCapture(survivorEl);
    const aiHealth = Game.createHealth(survivorEl);
    let gatesActive = false;

    // 3ª habilidade: escolha 1-de-2 (Armadilha ou Invisibilidade). A IA
    // Sobrevivente não usa bússola/batimento (tem informação perfeita por
    // outros meios), então Invisibilidade não muda o comportamento dela
    // aqui — mesma limitação já documentada da Camuflagem no solo, só que
    // do lado do Assassino. Fica disponível mesmo assim por consistência
    // com o menu (e pro jogador treinar o timing da Armadilha).
    const killerAbility3Key = killerAbilityKey === 'invisibility' ? 'invisibility' : 'trap';
    const killerAbility3Cfg = killerAbility3Key === 'invisibility' ? Game.CONFIG.abilities.killerInvisibility : Game.CONFIG.abilities.killerTrap;

    const killerDash = Game.createAbility(Game.CONFIG.abilities.killerDash);
    const killerAbility3 = Game.createAbility(killerAbility3Cfg);
    let activeTrap = null; // { x, y, el } — só usado quando killerAbility3Key === 'trap'

    killer.state.pos.x = currentKillerSpawn.x; killer.state.pos.y = currentKillerSpawn.y;
    survivor.state.pos.x = MAP.player.x; survivor.state.pos.y = MAP.player.y;
    killer.applyVisuals();
    survivor.applyVisuals();
    killerEl.querySelector('.label').textContent = name || 'Assassino';
    survivorEl.querySelector('.label').textContent = 'Sobrevivente (IA)';
    survivor.render();

    beginMatchUi();
    // só Investida (Q) e Armadilha (R) — Sentido não faz sentido sem
    // sistema de camuflagem pra IA
    Game.Input.setAbilityButtonsVisible(false, true, null, true);

    const matchStartAt = performance.now();
    let lastStepAt = 0;
    let aiLastStepAt = 0;
    let aiStruggleTimer = Game.CONFIG.survivorAI.struggleInterval;
    let heldHook = null; // gancho ocupado agora (pra liberar quando soltar/sacrificar)

    let matchOver = false;
    function endMatch(won, detail){
      if (matchOver) return;
      matchOver = true;
      const elapsed = Math.round((performance.now() - matchStartAt) / 1000);
      const doneCount = updateObjectivesStatus();
      const fullDetail = `${detail} · Tempo: ${elapsed}s · Objetivos: ${doneCount}/${objectives.length}`;
      Game.Menu.showResult(won, fullDetail, () => startSoloAsKiller(name, killerAbilityKey), 'killer');
    }

    function attemptKillerHit(){
      const origin = attackOrigin(killer.state, killer.characterConfig());
      const dx = survivor.state.pos.x - origin.x;
      const dy = survivor.state.pos.y - origin.y;
      if (Math.hypot(dx, dy) > killer.characterConfig().attackRange) return;
      if (aiCapture.state.captured || aiCapture.state.eliminated) return;

      if (!aiHealth.state.injured){
        Game.Audio.playAttackSwing();
        aiHealth.hit();
        survivor.playHit();
        survivorEl.classList.add('hit-flash');
        setTimeout(() => survivorEl.classList.remove('hit-flash'), 200);
        return;
      }

      Game.Audio.playCaptureHit();
      aiCapture.down((result) => {
        if (result === 'eliminated') endMatch(true, 'Você sacrificou o Sobrevivente!');
      });
    }

    // mesmo truque de desvio de obstáculo do updateKillerAI (startSolo) —
    // sem pathfinding de verdade, só o suficiente pra não ficar travada
    // burra numa quina
    let aiStuckTimer = 0;
    let aiLastPos = null;
    let aiNudgeUntil = 0;
    let aiNudgeDir = 1;

    function nearestIncompleteObjective(pos){
      return nearestBy(objectives, pos, (o) => o.state.pos, { filter: (o) => !o.state.done });
    }

    function nearestGate(pos){
      return nearestBy(gates, pos, (g) => g.state.pos);
    }

    function updateSurvivorAI(delta){
      if (aiCapture.state.eliminated){ survivor.render(); return; }

      if (aiCapture.state.captured){
        // carregada: segue preso nas costas do Assassino a cada frame,
        // igual o modo solo normal faz pro lado contrário
        if (aiCapture.state.carried){
          survivor.state.pos.x = killer.state.pos.x;
          survivor.state.pos.y = killer.state.pos.y;
        }
        // tenta se soltar (carregada) ou se debater no gancho (pendurada)
        // sozinha de vez em quando — capture.pulse() já sabe pra qual das
        // duas despachar; parada (downed, ainda não pega) não faz nada
        aiStruggleTimer -= delta;
        if (aiStruggleTimer <= 0){
          aiCapture.pulse();
          aiStruggleTimer = Game.CONFIG.survivorAI.struggleInterval;
        }
        survivor.render();
        return;
      }

      // Armadilha do Assassino: a IA não "vê" a armadilha antes de pisar
      // nela (sem essa antecipação, senão a habilidade nunca pegaria
      // ninguém no modo solo) — só checa proximidade igual um jogador faria
      if (activeTrap && performance.now() >= survivor.state.snaredUntil){
        const distToTrap = Math.hypot(survivor.state.pos.x - activeTrap.x, survivor.state.pos.y - activeTrap.y);
        if (distToTrap <= Game.CONFIG.abilities.killerTrap.triggerRadius){
          survivor.state.snaredUntil = performance.now() + Game.CONFIG.abilities.killerTrap.snareDuration * 1000;
          activeTrap.el.remove();
          activeTrap = null;
          killerAbility3.state.activeLeft = 0;
          killerAbility3.state.cooldownLeft = Game.CONFIG.abilities.killerTrap.cooldown;
        }
      }

      const aiCfg = Game.CONFIG.survivorAI;
      const cfg = survivor.characterConfig();
      const dxKiller = survivor.state.pos.x - killer.state.pos.x;
      const dyKiller = survivor.state.pos.y - killer.state.pos.y;
      const distToKiller = Math.hypot(dxKiller, dyKiller);
      const fleeing = distToKiller <= aiCfg.fleeRange;

      let target;
      if (fleeing){
        // corre na direção oposta ao Assassino, um bom pedaço à frente —
        // não é pathfinding, só "pra longe dele"
        const len = distToKiller || 1;
        target = { x: survivor.state.pos.x + (dxKiller / len) * 400, y: survivor.state.pos.y + (dyKiller / len) * 400 };

        // se tiver um pallet em pé bem perto enquanto foge, derruba —
        // mesma ação que o Sobrevivente humano faria (nearestPallet +
        // drop()), incluindo atordoar o Assassino se ele estava perto o
        // bastante no instante da queda. Sem isso a IA nunca usava os
        // pallets pra se defender, um dos loops de perseguição do jogo
        // ficava incompleto quando o Assassino é o jogador humano.
        const droppablePallet = nearestPallet(survivor.state.pos, Game.CONFIG.pallet.radius);
        if (droppablePallet && droppablePallet.drop()){
          if (withinSfxRadius(killer.state.pos, droppablePallet.center)) Game.Audio.playPalletDrop();
          attemptPalletStun(droppablePallet, killer.state.pos, () => {
            killer.state.stunnedUntil = performance.now() + Game.CONFIG.pallet.stunDuration * 1000;
          });
        }
      } else if (gatesActive){
        const g = nearestGate(survivor.state.pos);
        target = g ? g.state.pos : survivor.state.pos;
      } else {
        const obj = nearestIncompleteObjective(survivor.state.pos);
        target = obj ? obj.state.pos : survivor.state.pos;
      }

      const dx = target.x - survivor.state.pos.x;
      const dy = target.y - survivor.state.pos.y;
      const dist = Math.hypot(dx, dy);
      // já perto o bastante do alvo (objetivo/portão) pra "trabalhar" em
      // vez de continuar tentando andar até o centro exato dele
      const workingRadius = fleeing ? 0 : (gatesActive ? Game.CONFIG.gate.radius * 0.6 : Game.CONFIG.objective.radius * 0.6);
      const shouldMove = dist > workingRadius;

      let moved = false;
      if (shouldMove){
        let moveDx = dx, moveDy = dy;
        const now = performance.now();
        if (now < aiNudgeUntil){
          const len = dist || 1;
          moveDx = dx + (-dy / len) * aiNudgeDir * len;
          moveDy = dy + (dx / len) * aiNudgeDir * len;
        }
        let speed = cfg.speed * aiCfg.speedMultiplier;
        if (aiHealth.state.injured) speed *= Game.CONFIG.health.injuredSpeedMultiplier;
        if (performance.now() < survivor.state.snaredUntil) speed *= Game.CONFIG.abilities.killerTrap.snareSpeedMultiplier;
        speed *= windowSpeedMultiplier(survivor.state.pos, false);
        moved = moveTowards(survivor.state, cfg, { x: moveDx, y: moveDy }, delta, speed);
        survivor.setFacing(survivor.state.facingRight);

        if (aiLastPos && now >= aiNudgeUntil){
          const movedDist = Math.hypot(survivor.state.pos.x - aiLastPos.x, survivor.state.pos.y - aiLastPos.y);
          if (movedDist < speed * delta * 0.3){
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
        if (moved && performance.now() - aiLastStepAt > 300){
          aiLastStepAt = performance.now();
          spawnDust(survivor.state.pos.x, survivor.state.pos.y + 14);
        }
      }
      survivor.setMoving(moved);
      aiLastPos = { x: survivor.state.pos.x, y: survivor.state.pos.y };
      aiHealth.update(delta, !moved);

      if (!fleeing){
        const obj = nearestIncompleteObjective(survivor.state.pos);
        if (obj && Math.hypot(survivor.state.pos.x - obj.state.pos.x, survivor.state.pos.y - obj.state.pos.y) <= Game.CONFIG.objective.radius){
          // a IA não tem conceito de "apertar botão" — engaja sozinha assim
          // que chega perto (o jogador humano precisa apertar; a IA não)
          if (!obj.state.engaged){
            obj.engage();
            // mesmo aviso discreto que o modo online já dá pro Assassino
            // (js/main.js, startOnline) — aqui é local, sem precisar de rede
            Game.Audio.playObjectiveStart();
          }
          const hadSkillCheck = !!obj.state.skillCheck;
          const attempt = hadSkillCheck && Math.random() < aiCfg.reactionChancePerSecond * delta;
          const wasDone = obj.state.done;
          obj.update(delta, survivor.state.pos, attempt, 1);
          if (obj.state.done && !wasDone){
            const done = updateObjectivesStatus();
            if (done >= objectives.length && !gatesActive){
              gatesActive = true;
              objectivesStatus.textContent = 'Geradores prontos! O Sobrevivente vai tentar escapar.';
            }
          }
        }
        if (gatesActive){
          const g = nearestGate(survivor.state.pos);
          if (g){
            const near = Math.hypot(survivor.state.pos.x - g.state.pos.x, survivor.state.pos.y - g.state.pos.y) <= Game.CONFIG.gate.radius;
            if (g.progressOpen(delta, near, gatesActive)) Game.Audio.playGateOpen();
          }
          if (nearOpenGate(survivor.state.pos)){
            Game.Audio.playSurvivorEscape();
            endMatch(false, 'O Sobrevivente escapou pelo portão.');
          }
        }
      }

      survivor.render();
    }

    let lastTime = performance.now();
    function loop(now){
      if (matchOver) return;
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      Game.Input.update();
      aiCapture.update(delta);
      killerDash.update(delta);
      killerAbility3.update(delta);
      if (killerAbility3Key === 'trap' && activeTrap && killerAbility3.state.activeLeft <= 0 && killerAbility3.state.cooldownLeft > 0){
        activeTrap.el.remove();
        activeTrap = null;
      }
      updateAbilityHud([
        { label: Game.CONFIG.abilities.killerDash.label, ability: killerDash },
        { label: killerAbility3Cfg.label, ability: killerAbility3 },
      ]);
      // saiu do gancho (fugiu, foi sacrificado) — libera pra outro corpo usar
      if (heldHook && !aiCapture.state.hooked){ setHookOccupied(heldHook, null); heldHook = null; }

      const attackPressed = Game.Input.consumeAttackRequest();
      const ability2Requested = Game.Input.consumeAbility2Request();
      const ability3Requested = Game.Input.consumeAbility3Request();
      const stunned = performance.now() < killer.state.stunnedUntil; // atordoado por pallet
      if (ability2Requested && !stunned) killerDash.trigger();
      if (ability3Requested && !stunned && killerAbility3.ready()){
        killerAbility3.trigger();
        if (killerAbility3Key === 'trap'){
          if (activeTrap) activeTrap.el.remove();
          activeTrap = { x: killer.state.pos.x, y: killer.state.pos.y, el: spawnTrapMarker(killer.state.pos.x, killer.state.pos.y) };
        }
      }

      if (attackPressed && !stunned){
        const cCfg = Game.CONFIG.capture;
        if (aiCapture.state.downed){
          const dx = survivor.state.pos.x - killer.state.pos.x;
          const dy = survivor.state.pos.y - killer.state.pos.y;
          if (Math.hypot(dx, dy) <= cCfg.pickUpRange) aiCapture.pickUp();
        } else if (aiCapture.state.carried){
          const hook = nearestFreeHook(killer.state.pos, cCfg.hookRange);
          if (hook){
            aiCapture.hook(hook.pos);
            survivor.state.pos.x = hook.pos.x;
            survivor.state.pos.y = hook.pos.y - 10;
            setHookOccupied(hook, 'ai-survivor');
            heldHook = hook;
          }
        } else {
          Game.Audio.playAttackSwing();
          killer.tryAttack(attemptKillerHit);
        }
      }

      doors.forEach((d) => {
        const near = Math.hypot(killer.state.pos.x - d.center.x, killer.state.pos.y - d.center.y) <= Game.CONFIG.door.radius;
        if (d.progressBreak(delta, near)) Game.Audio.playDoorBreak();
      });

      pallets.forEach((p) => {
        const near = Math.hypot(killer.state.pos.x - p.center.x, killer.state.pos.y - p.center.y) <= Game.CONFIG.pallet.radius;
        if (p.progressBreak(delta, near)) Game.Audio.playPalletBreak();
      });

      if (stunned){
        killer.setMoving(false);
      } else if (!killer.state.isAttacking){
        const dir = Game.Input.readMovement();
        let speed = killer.characterConfig().speed;
        if (killerDash.state.activeLeft > 0) speed *= Game.CONFIG.abilities.killerDash.speedMultiplier;
        speed *= windowSpeedMultiplier(killer.state.pos, true);
        const moved = moveTowards(killer.state, killer.characterConfig(), dir, delta, speed);
        killer.setFacing(killer.state.facingRight);
        killer.setMoving(moved);
        if (moved && now - lastStepAt > 300){
          lastStepAt = now;
          Game.Audio.playFootstep();
          spawnDust(killer.state.pos.x, killer.state.pos.y + 14);
        }
      }

      updateSurvivorAI(delta);
      killer.render();
      lighting.update(killer.state.pos, false, visionBlockingWalls());
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  // =====================================================================
  // MODO ONLINE — N jogadores reais conectados via LAN ou P2P
  // =====================================================================
  function startOnline(net, localId, roster, mapLayoutIndex, resumeData){
    const sessionId = ++onlineSessionId;
    panel.style.display = 'none';
    const survivors = roster.filter((p) => p.role === 'survivor');
    buildWorld(Game.CONFIG.generatorCount, mapLayoutIndex || 0);

    const entries = new Map(); // id -> { info, char, el, capture?, eliminated, camouflaged }
    let survivorIndex = 0;

    roster.forEach((info) => {
      const el = charDom();
      const char = Game.createCharacter(info.role, el);
      char.applyVisuals();
      el.querySelector('.label').textContent = info.name + (info.id === localId ? ' (você)' : '');

      if (info.role === 'killer'){
        char.state.pos.x = currentKillerSpawn.x;
        char.state.pos.y = currentKillerSpawn.y;
      } else {
        const spawn = MAP.survivorSpawns[survivorIndex % MAP.survivorSpawns.length];
        char.setColorOverride(Game.CONFIG.survivorHues[survivorIndex % Game.CONFIG.survivorHues.length]);
        // número além da cor — hue-rotate sozinho é difícil de distinguir
        // pra jogador daltônico (não muda o brilho/contraste, só o matiz)
        const badge = document.createElement('div');
        badge.className = 'survivor-badge';
        badge.textContent = String(survivorIndex + 1);
        el.appendChild(badge);
        survivorIndex++;
        char.state.pos.x = spawn.x;
        char.state.pos.y = spawn.y;
      }
      char.render();

      const entry = { info, char, el, eliminated: false, escaped: false, camouflaged: false, invisible: false };
      if (info.role === 'survivor'){
        entry.capture = Game.createCapture(el);
        entry.hideout = Game.createHideout();
        entry.health = Game.createHealth(el);
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
    const localAbilityCfg2 = isSurvivor
      ? (Game.CONFIG.abilities.survivor[localEntry.info.ability2] || Game.CONFIG.abilities.survivor.camouflage)
      : null;
    // 3ª habilidade do Assassino: escolha 1-de-2 (Armadilha ou
    // Invisibilidade) — reaproveita o mesmo campo `ability` que o
    // Sobrevivente usa pra 1ª habilidade dele (o Assassino nunca usava esse
    // campo antes, então não colide). 'trap' é o padrão se não escolheu.
    const killerAbility3Key = !isSurvivor && localEntry.info.ability === 'invisibility' ? 'invisibility' : 'trap';
    const killerAbility3Cfg = killerAbility3Key === 'invisibility' ? Game.CONFIG.abilities.killerInvisibility : Game.CONFIG.abilities.killerTrap;

    const localAbility1 = isSurvivor ? Game.createAbility(localAbilityCfg) : Game.createAbility(Game.CONFIG.abilities.killerSense);
    const localAbility2 = isSurvivor ? null : Game.createAbility(Game.CONFIG.abilities.killerDash);
    const localAbility3 = isSurvivor ? Game.createAbility(localAbilityCfg2) : Game.createAbility(killerAbility3Cfg);
    const localAbilityKey = isSurvivor ? localEntry.info.ability : null;
    const localAbilityKey2 = isSurvivor ? localEntry.info.ability2 : null;

    beginMatchUi();
    Game.Input.setAbilityButtonsVisible(true, !isSurvivor, null, true);
    const matchStartAt = performance.now();
    let lastStepAt = 0;
    let gatesActive = false; // vira true quando os 5 geradores terminam (todo mundo calcula igual, é só olhar objectives.state.done, já sincronizado)
    let carryingEntry = null; // só o Assassino usa: quem ele está carregando agora (null = ninguém)
    let activeTrap = null; // { x, y, el } — só usado quando killerAbility3Key === 'trap', null = nenhuma armada agora

    // enquanto alguém está "carried" (js/capture.js), a posição dele segue
    // a do Assassino em todo cliente — o Assassino já transmite a própria
    // posição normalmente, então todo mundo (inclusive o próprio
    // carregado) só precisa espelhar isso, sem mensagem de rede extra
    function mirrorCarriedEntries(){
      if (!killerEntry) return;
      entries.forEach((entry) => {
        if (entry.capture && entry.capture.state.carried){
          entry.char.state.pos.x = killerEntry.char.state.pos.x;
          entry.char.state.pos.y = killerEntry.char.state.pos.y;
          entry.char.render();
        }
      });
    }

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
      const fullDetail = `${detail} · Tempo: ${elapsed}s · Objetivos: ${doneCount}/${objectives.length} · Sobreviventes restantes: ${aliveCount}/${survivors.length}`;
      Game.Menu.showResult(localWon, fullDetail, null, localEntry.info.role); // "jogar de novo" online volta pro lobby (ver menu.js)
    }

    // "ativos" = ainda em jogo (não eliminados nem já escaparam) — só esses
    // continuam sendo perseguidos/capturáveis
    function activeSurvivors(){
      return [...entries.values()].filter((e) => e.info.role === 'survivor' && !e.eliminated && !e.escaped);
    }

    // Sobrevivente já eliminado/escapado: em vez da câmera dele travar
    // olhando pro próprio cadáver pelo resto da partida (o que acontecia
    // antes — o loop continuava rodando, só sem mais input dele), passa a
    // seguir quem ainda está em jogo, tipo o "modo fantasma" do jogo
    // original. null quando quem está vendo ainda está ativo (câmera normal).
    function spectatorFollowEntry(){
      if (!isSurvivor || !(localEntry.eliminated || localEntry.escaped)) return null;
      const alive = activeSurvivors().find((e) => e !== localEntry);
      if (alive) return alive;
      if (killerEntry && !killerEntry.eliminated) return killerEntry;
      return null;
    }

    function checkWinFromObjectives(){
      const done = updateObjectivesStatus();
      if (done >= objectives.length && !gatesActive){
        gatesActive = true;
        if (isSurvivor) objectivesStatus.textContent = 'Geradores prontos! Ache um portão pra escapar.';
      }
    }

    // partida resolve quando não sobra ninguém "ativo" — ou todo mundo foi
    // capturado (Assassino vence) ou o resto escapou (Sobreviventes vencem,
    // mesmo que nem todos tenham conseguido)
    function checkMatchResolution(){
      if (survivors.length === 0 || activeSurvivors().length > 0) return;
      const escapedCount = [...entries.values()].filter((e) => e.info.role === 'survivor' && e.escaped).length;
      if (escapedCount > 0){
        endMatch(true, `Os Sobreviventes escaparam! (${escapedCount}/${survivors.length})`, true);
      } else {
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
      entry.char.setSprinting(!!data.sprinting);
      entry.char.render();
      entry.camouflaged = !!data.camouflaged;
      entry.invisible = !!data.invisible; // só o Assassino manda isso (habilidade Invisibilidade)
      entry.el.classList.toggle('injured', !!data.injured);
      entry.el.classList.toggle('snared', !!data.snared);
    };

    Game.onlinePlayerLeftHandler = function(id){
      const entry = entries.get(id);
      if (!entry) return;
      entry.eliminated = true;
      entry.el.classList.add('eliminated');
      if (entry.info.role === 'survivor') checkMatchResolution();
      if (entry.info.role === 'killer'){
        endMatch(true, 'O Assassino saiu da partida — Sobreviventes vencem por desistência.', true);
      }
    };

    Game.onlineEventHandler = function(fromId, data){
      if (!data) return;

      // 1º golpe machuca (fica ferido, mais lento, dá pra curar sozinho);
      // só o 2º derruba de vez — decidido no cliente de quem foi atingido,
      // já que só ele sabe seu próprio estado de vida sem atraso de rede.
      // Derrubar não é mais o fim — o Assassino ainda precisa carregar até
      // um gancho (eventos pickedUp/hooked abaixo) antes da luta de
      // verdade (struggleResult) começar.
      if (data.kind === 'captureStart' && data.targetId === localId && localEntry.capture){
        if (localEntry.health && !localEntry.health.state.injured){
          Game.Audio.playAttackSwing();
          localEntry.health.hit();
          Game.Input.vibrate(120);
          localEntry.char.playHit();
          localEntry.el.classList.add('hit-flash');
          setTimeout(() => localEntry.el.classList.remove('hit-flash'), 200);
          return;
        }
        Game.Audio.playCaptureHit();
        localEntry.capture.down((result) => {
          net.sendEvent({ kind: 'struggleResult', playerId: localId, result });
          // libera o gancho no PRÓPRIO cliente também — sendEvent não volta
          // pro remetente, então sem isso só os outros clientes soltavam
          const usedHook = hooks.find((h) => h.occupiedBy === localId);
          if (usedHook) setHookOccupied(usedHook, null);
          if (result === 'eliminated'){
            localEntry.eliminated = true;
            checkMatchResolution();
          }
        });
        net.sendEvent({ kind: 'downed', targetId: localId });
        return;
      }

      // visual pros outros clientes — quem realmente controla o desfecho é
      // sempre o dono da entry (down()/hook()/rescue() reais só rodam no
      // cliente de quem caiu; os outros só espelham estado pra desenhar certo)
      if (data.kind === 'downed'){
        const entry = entries.get(data.targetId);
        if (entry && entry.capture && entry !== localEntry){
          entry.capture.state.captured = true;
          entry.capture.state.downed = true;
          entry.capture.render();
        }
        return;
      }

      if (data.kind === 'pickedUp'){
        const entry = entries.get(data.targetId);
        // só aplica se ainda estiver mesmo "downed" — sem essa checagem,
        // uma corrida rara com 'revived' (aliado reanimando no exato
        // mesmo instante em que o Assassino pega) podia deixar alguém já
        // reanimado e livre sendo marcado como "carried" por engano, se
        // os 2 eventos chegassem fora de ordem
        if (entry && entry.capture && entry.capture.state.downed){
          entry.capture.state.downed = false;
          entry.capture.state.carried = true;
          entry.capture.render();
        }
        return;
      }

      // soltou do carrego antes de chegar no gancho (apertou rápido o
      // bastante) — o Assassino (quem estava carregando) precisa saber que
      // não está mais carregando ninguém
      if (data.kind === 'droppedFree'){
        const entry = entries.get(data.targetId);
        if (entry && entry.capture && entry !== localEntry){
          entry.capture.state.carried = false;
          entry.capture.state.downed = true;
          entry.capture.render();
        }
        if (carryingEntry && carryingEntry.info.id === data.targetId) carryingEntry = null;
        return;
      }

      if (data.kind === 'hooked'){
        const entry = entries.get(data.targetId);
        const hook = hooks[data.hookIndex];
        if (!entry || !entry.capture || !hook) return;
        if (entry === localEntry){
          // sou eu que fui pendurado — a partir daqui EU sou dono do
          // desfecho (hookPulse/timeout), igual downed/captureStart
          entry.capture.hook(hook.pos);
          Game.Input.vibrate(250);
        } else {
          entry.capture.state.carried = false;
          entry.capture.state.hooked = true;
          entry.capture.state.hookPos = hook.pos;
          entry.capture.render();
        }
        entry.char.state.pos.x = hook.pos.x;
        entry.char.state.pos.y = hook.pos.y - 10;
        entry.char.render();
        setHookOccupied(hook, data.targetId);
        if (carryingEntry && carryingEntry.info.id === data.targetId) carryingEntry = null;
        return;
      }

      // outro Sobrevivente resgatou quem tá pendurado — só quem tá
      // pendurado de verdade age (é o dono do desfecho); os outros só vão
      // ver o resultado chegar via struggleResult daqui a pouco
      if (data.kind === 'rescued'){
        if (data.targetId === localId && localEntry.capture) localEntry.capture.rescue();
        return;
      }

      // reanimar aliado caído (downed) sem precisar de gancho — mesma
      // ideia do rescued acima, só que pra fase anterior (antes do
      // Assassino pegar). revive() por dentro chama resolve('revived'),
      // que já dispara o mesmo struggleResult que escaped/rescued usam —
      // os outros clientes (nem alvo, nem quem reanimou) já sabem
      // espelhar isso sem handler extra (ver 'struggleResult' abaixo)
      if (data.kind === 'revived'){
        if (data.targetId === localId && localEntry.capture) localEntry.capture.revive();
        return;
      }

      if (data.kind === 'struggleResult'){
        const entry = entries.get(data.playerId);
        if (!entry) return;
        if (entry !== localEntry && entry.capture){
          entry.capture.state.captured = false;
          entry.capture.state.downed = false;
          entry.capture.state.carried = false;
          entry.capture.state.hooked = false;
          entry.capture.render();
        }
        const usedHook = hooks.find((h) => h.occupiedBy === data.playerId);
        if (usedHook) setHookOccupied(usedHook, null);
        if (data.result === 'eliminated'){
          entry.eliminated = true;
          entry.el.classList.add('eliminated');
          checkMatchResolution();
        }
        return;
      }

      if (data.kind === 'gateOpened'){
        if (gates[data.index]) gates[data.index].setOpen(true);
        Game.Audio.playGateOpen(); // grande momento da partida, toca pra todo mundo sem checar distância
        return;
      }

      if (data.kind === 'survivorEscaped'){
        const entry = entries.get(data.playerId);
        if (!entry || entry.escaped) return;
        entry.escaped = true;
        entry.el.classList.add('escaped');
        Game.Audio.playSurvivorEscape();
        checkMatchResolution();
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
        if (doors[data.index] && withinSfxRadius(localEntry.char.state.pos, doors[data.index].center)) Game.Audio.playDoorLock();
        return;
      }

      if (data.kind === 'doorLocked'){
        if (doors[data.index]){
          doors[data.index].setLocked(true);
          if (withinSfxRadius(localEntry.char.state.pos, doors[data.index].center)) Game.Audio.playDoorLock();
        }
        return;
      }

      if (data.kind === 'doorBroken'){
        if (doors[data.index]){
          doors[data.index].setLocked(false);
          if (withinSfxRadius(localEntry.char.state.pos, doors[data.index].center)) Game.Audio.playDoorBreak();
        }
        return;
      }

      if (data.kind === 'palletDropped'){
        if (pallets[data.index]){
          pallets[data.index].setDropped(true);
          // o Assassino já tem feedback próprio disso via emitNoiseOnline
          // (sound:'palletDrop', ver 'noise' acima) — aqui é só pros outros
          // Sobreviventes por perto, que a mecânica de ruído não cobre
          if (isSurvivor && withinSfxRadius(localEntry.char.state.pos, pallets[data.index].center)) Game.Audio.playPalletDrop();
        }
        return;
      }

      if (data.kind === 'palletBroken'){
        if (pallets[data.index]){
          pallets[data.index].setBroken(true);
          if (isSurvivor && withinSfxRadius(localEntry.char.state.pos, pallets[data.index].center)) Game.Audio.playPalletBreak();
        }
        return;
      }

      if (data.kind === 'palletStun'){
        if (data.targetId === localId && localEntry.char.state){
          localEntry.char.state.stunnedUntil = performance.now() + Game.CONFIG.pallet.stunDuration * 1000;
        }
        return;
      }

      // Armadilha do Assassino (killerTrap) — plantada por evento (o
      // Assassino decide onde/quando, todo mundo só espelha o marcador);
      // quem dispara é sempre decidido pelo cliente do próprio Sobrevivente
      // que passou perto (mesmo padrão client-authoritative de sempre),
      // que manda 'trapSprung' de volta.
      if (data.kind === 'trapPlaced'){
        if (activeTrap) activeTrap.el.remove();
        activeTrap = { x: data.x, y: data.y, el: spawnTrapMarker(data.x, data.y) };
        return;
      }

      if (data.kind === 'trapSprung'){
        if (activeTrap){ activeTrap.el.remove(); activeTrap = null; }
        // o Assassino (se for ele lendo este evento) também precisa saber
        // que a armadilha acabou — força o cooldown local dela, senão a
        // habilidade ficaria "armada pra sempre" do ponto de vista do
        // próprio Assassino (só ele tem a instância do createAbility)
        if (!isSurvivor && killerAbility3Key === 'trap'){
          localAbility3.state.activeLeft = 0;
          localAbility3.state.cooldownLeft = Game.CONFIG.abilities.killerTrap.cooldown;
        }
        if (data.targetId === localId && localEntry.char.state){
          localEntry.char.state.snaredUntil = performance.now() + Game.CONFIG.abilities.killerTrap.snareDuration * 1000;
        }
        return;
      }

      // ruído genérico — substitui distractPing/objectiveFailed/
      // hideoutNoise/objectiveStarted, que eram o mesmo padrão copiado 4x
      // (ver emitNoiseOnline). O marcador aparece pra todo mundo (mesmo
      // comportamento de antes); o som só toca pro cliente Assassino, e só
      // se ele estiver dentro do raio de audição do ruído — isso é novo,
      // antes o Assassino ouvia não importa a distância.
      if (data.kind === 'noise'){
        if (data.ping > 0) spawnPingMarker(data.x, data.y, data.ping);
        if (!isSurvivor){
          const dist = Math.hypot(data.x - localEntry.char.state.pos.x, data.y - localEntry.char.state.pos.y);
          if (dist <= (data.radius ?? Infinity)){
            if (data.sound === 'objectiveStart') Game.Audio.playObjectiveStart();
            else if (data.sound === 'palletDrop') Game.Audio.playPalletDrop();
            else if (data.sound === 'palletBreak') Game.Audio.playPalletBreak();
            else Game.Audio.playError();
          }
        }
        return;
      }

      if (data.kind === 'matchEnd' && !matchOver){
        endMatch(data.result === 'survivors', data.result === 'survivors'
          ? 'Os Sobreviventes escaparam!'
          : 'O Assassino capturou todos os Sobreviventes.', false);
      }
    };

    function attemptKillerHit(){
      const cfg = localEntry.char.characterConfig();
      const origin = attackOrigin(localEntry.char.state, cfg);
      activeSurvivors().forEach((entry) => {
        if (entry.info.id === localId) return;
        const dx = entry.char.state.pos.x - origin.x;
        const dy = entry.char.state.pos.y - origin.y;
        if (Math.hypot(dx, dy) <= cfg.attackRange){
          net.sendEvent({ kind: 'captureStart', targetId: entry.info.id });
        }
      });
    }

    // genérico pros 2 slots de habilidade do Sobrevivente — mesma ideia do
    // startSolo, ver comentário lá
    function triggerLocalSurvivorAbilitySlot(key, cfg, ability){
      if (!ability.ready()) return;
      if (key === 'barricade'){
        const index = instantLockNearestDoor(localEntry.char.state.pos);
        if (index < 0) return;
        ability.trigger();
        net.sendEvent({ kind: 'doorForceLock', index });
        Game.Audio.playDoorLock(); // feedback local — sendEvent não volta pro próprio remetente
        return;
      }
      ability.trigger();
      if (key === 'distract'){
        emitNoiseOnline(net, localEntry.char.state.pos.x, localEntry.char.state.pos.y, { radius: Game.CONFIG.noise.distractRadius, ping: cfg.duration });
      }
    }
    function triggerLocalSurvivorAbility(){ triggerLocalSurvivorAbilitySlot(localAbilityKey, localAbilityCfg, localAbility1); }
    function triggerLocalSurvivorAbility2(){ triggerLocalSurvivorAbilitySlot(localAbilityKey2, localAbilityCfg2, localAbility3); }

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
      // uma sessão mais nova assumiu (reconexão automática no meio da
      // partida chamou startOnline de novo) — essa aqui para sozinha, sem
      // precisar de nenhum sinal explícito de "desliga"
      if (sessionId !== onlineSessionId) return;
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      Game.Input.update();
      if (isSurvivor) localEntry.capture.update(delta);
      localAbility1.update(delta);
      if (localAbility2) localAbility2.update(delta);
      localAbility3.update(delta);
      // armadilha expirou sozinha (ninguém pisou nela) — remove o marcador;
      // se ela disparou antes disso, o evento 'trapSprung' já cuidou (ver
      // onlineEventHandler acima). Só se aplica quando a 3ª habilidade
      // escolhida é a Armadilha — Invisibilidade não usa marcador nenhum.
      if (!isSurvivor && killerAbility3Key === 'trap' && activeTrap && localAbility3.state.activeLeft <= 0 && localAbility3.state.cooldownLeft > 0){
        activeTrap.el.remove();
        activeTrap = null;
      }
      mirrorCarriedEntries();

      if (isSurvivor){
        updateAbilityHud([
          { label: localAbilityCfg.label, ability: localAbility1 },
          { label: localAbilityCfg2.label, ability: localAbility3 },
        ]);
        // Invisibilidade (killerAbility3Key do Assassino, espelhada aqui via
        // killerEntry.invisible) esconde ele da bússola/batimento/vinheta —
        // mesmo tratamento que "eliminado"/"fora de alcance" já recebiam
        const killerVisible = killerEntry && !killerEntry.eliminated && !killerEntry.invisible;
        const killerPos = killerVisible ? killerEntry.char.state.pos : null;
        Game.Audio.updateHeartbeat(localEntry.char.state.pos, killerPos, Game.CONFIG.heartbeatRange);
        updateKillerCompass(localEntry.char.state.pos, killerPos, Game.CONFIG.heartbeatRange);
        updateDangerVignette(localEntry.char.state.pos, killerPos, Game.CONFIG.heartbeatRange);
      } else {
        updateAbilityHud([
          { label: Game.CONFIG.abilities.killerSense.label, ability: localAbility1 },
          { label: Game.CONFIG.abilities.killerDash.label, ability: localAbility2 },
          { label: killerAbility3Cfg.label, ability: localAbility3 },
        ]);
        updateKillerVision();
      }

      const attackRequested = Game.Input.consumeAttackRequest();
      const ability1Requested = Game.Input.consumeAbility1Request();
      // Sobrevivente reaproveita esse botão como "X" pra sair do modo de
      // reparo engajado; Assassino usa pro dash — nunca os dois ao mesmo
      // tempo, então dá pra consumir sempre e rotear pelo papel abaixo.
      const ability2Requested = Game.Input.consumeAbility2Request();
      const ability3Requested = Game.Input.consumeAbility3Request();

      const captured = isSurvivor && localEntry.capture.state.captured;
      const eliminated = isSurvivor && (localEntry.capture.state.eliminated || localEntry.escaped);
      let engagedObjective = null; // gerador que o Sobrevivente engajou pra reparar, se houver

      // segurança: se o Assassino derrubou o jogador ENQUANTO ele estava
      // engajado num gerador, o bloco de baixo nunca roda (captured entra
      // no branch de cima) e o gerador ficava com engaged:true travado pra
      // sempre — ao ser resgatado, o jogador reengajava sozinho nesse
      // mesmo gerador (agora longe dele), travado nele de novo sem
      // conseguir sair a não ser pelo botão X. Desengaja aqui, sempre que
      // captured, antes de mais nada.
      if (captured){
        const staleEngaged = objectives.find((o) => o.state.engaged);
        if (staleEngaged) staleEngaged.disengage();
      }

      if (captured){
        if (attackRequested){
          const wasCarried = localEntry.capture.state.carried;
          localEntry.capture.pulse();
          // se soltou do carrego antes de chegar no gancho, o Assassino
          // que estava carregando precisa saber (senão continua achando
          // que ainda tá com alguém nas costas)
          if (wasCarried && !localEntry.capture.state.carried){
            net.sendEvent({ kind: 'droppedFree', targetId: localId });
          }
        }
      } else if (!eliminated && isSurvivor && localEntry.hideout.state.hidden){
        if (attackRequested) localEntry.hideout.exit(); // sai antes da hora, por vontade própria
        const hideoutResult = localEntry.hideout.update(delta);
        // ficou escondido tempo demais: entrega a posição igual a um
        // skill check errado, mesma técnica de ping usada em objectiveFailed
        if (hideoutResult.madeNoise){
          emitNoiseOnline(net, localEntry.char.state.pos.x, localEntry.char.state.pos.y, { radius: Game.CONFIG.noise.hideoutRadius, ping: 2.5 });
        }
      } else if (!eliminated){
        const stunned = !isSurvivor && performance.now() < localEntry.char.state.stunnedUntil; // atordoado por pallet
        if (isSurvivor){
          if (ability1Requested) triggerLocalSurvivorAbility();
          if (ability3Requested) triggerLocalSurvivorAbility2();

          // Armadilha do Assassino: cada Sobrevivente decide por si mesmo
          // se pisou perto o bastante (client-authoritative, igual a
          // resgate/pallet/objetivo) e avisa todo mundo (inclusive o
          // Assassino, que precisa saber pra tirar a habilidade do "armada")
          if (activeTrap && performance.now() >= localEntry.char.state.snaredUntil){
            const distToTrap = Math.hypot(localEntry.char.state.pos.x - activeTrap.x, localEntry.char.state.pos.y - activeTrap.y);
            if (distToTrap <= Game.CONFIG.abilities.killerTrap.triggerRadius){
              localEntry.char.state.snaredUntil = performance.now() + Game.CONFIG.abilities.killerTrap.snareDuration * 1000;
              activeTrap.el.remove();
              activeTrap = null;
              Game.Input.vibrate([40, 40, 40]);
              net.sendEvent({ kind: 'trapSprung', targetId: localId, x: localEntry.char.state.pos.x, y: localEntry.char.state.pos.y });
            }
          }

          // engajado num gerador: só chegar perto não progride mais nada —
          // precisou apertar o botão de ação antes (ver abaixo). O X
          // (ability2) sai do modo de reparo a qualquer momento.
          engagedObjective = objectives.find((o) => o.state.engaged);
          if (engagedObjective){
            // botão X sempre funciona, mas não pode ser o ÚNICO jeito de
            // sair — qualquer intenção de andar também desengaja na hora
            // (ver mesma lógica/comentário em startSolo)
            const moveDir = Game.Input.readMovement();
            const movementIntent = Math.hypot(moveDir.x, moveDir.y) > 0.05;
            if (ability2Requested || movementIntent) engagedObjective.disengage();
            const wasDone = engagedObjective.state.done;
            const hadSkillCheck = !!engagedObjective.state.skillCheck;
            const index = objectives.indexOf(engagedObjective);
            // cooperação: cada Sobrevivente extra perto do mesmo objetivo
            // (além de quem está preenchendo) acelera 50% o preenchimento
            const helpers = activeSurvivors().filter((e) => e !== localEntry &&
              Math.hypot(e.char.state.pos.x - engagedObjective.state.pos.x, e.char.state.pos.y - engagedObjective.state.pos.y) <= Game.CONFIG.objective.radius).length;
            const result = engagedObjective.update(delta, localEntry.char.state.pos, hadSkillCheck && attackRequested, 1 + helpers * Game.CONFIG.objective.cooperationBonusPerHelper);
            if (engagedObjective.state.done && !wasDone){
              net.sendEvent({ kind: 'objectiveDone', index });
              checkWinFromObjectives();
            }
            if (result.great) Game.Audio.playSkillCheckGreat();
            // igual ao original: errar o skill check faz barulho alto e
            // entrega a posição pro Assassino (e marca o ponto pra
            // todo mundo, mesma técnica do ping de Distrair)
            if (result.justFailed){
              Game.Input.vibrate([40, 40, 40]);
              emitNoiseOnline(net, engagedObjective.state.pos.x, engagedObjective.state.pos.y, { radius: Game.CONFIG.noise.skillCheckFailRadius, ping: 2.5 });
            }
          } else {
            const nearHideout = nearestHideoutSpot(localEntry.char.state.pos, Game.CONFIG.hideout.radius);
            const hookedAlly = activeSurvivors().find((e) => e !== localEntry && e.capture && e.capture.state.hooked &&
              Math.hypot(e.char.state.pos.x - localEntry.char.state.pos.x, e.char.state.pos.y - localEntry.char.state.pos.y) <= Game.CONFIG.capture.rescueRange);
            // aliado caído (downed, ainda não pego pelo Assassino) — dá
            // pra reanimar direto, sem esperar ele ser pendurado. Só entra
            // aqui se não tiver ninguém pendurado por perto (prioridade
            // pro resgate do gancho, sempre mais urgente)
            const downedAlly = !hookedAlly && activeSurvivors().find((e) => e !== localEntry && e.capture && e.capture.state.downed &&
              Math.hypot(e.char.state.pos.x - localEntry.char.state.pos.x, e.char.state.pos.y - localEntry.char.state.pos.y) <= Game.CONFIG.capture.reviveRange);
            const droppablePallet = nearestPallet(localEntry.char.state.pos, Game.CONFIG.pallet.radius);
            const engageTarget = nearestEngageableObjective(localEntry.char.state.pos);
            if (attackRequested && hookedAlly){
              net.sendEvent({ kind: 'rescued', targetId: hookedAlly.info.id });
            } else if (attackRequested && downedAlly){
              net.sendEvent({ kind: 'revived', targetId: downedAlly.info.id });
            } else if (attackRequested && nearHideout){
              localEntry.hideout.enter();
            } else if (attackRequested && droppablePallet && droppablePallet.drop()){
              const index = pallets.indexOf(droppablePallet);
              net.sendEvent({ kind: 'palletDropped', index });
              Game.Audio.playPalletDrop(); // feedback local — sendEvent não volta pro próprio remetente
              emitNoiseOnline(net, droppablePallet.center.x, droppablePallet.center.y, { radius: Game.CONFIG.noise.palletDropRadius, ping: 1.2, sound: 'palletDrop' });
              if (killerEntry && !killerEntry.eliminated){
                attemptPalletStun(droppablePallet, killerEntry.char.state.pos, () => {
                  net.sendEvent({ kind: 'palletStun', targetId: killerEntry.info.id });
                });
              }
            } else if (attackRequested && engageTarget){
              engageTarget.engage();
              // aviso discreto sem posição — só avisa que "algo está
              // acontecendo em algum gerador", pedido do usuário
              emitNoiseOnline(net, engageTarget.state.pos.x, engageTarget.state.pos.y, { radius: Infinity, ping: 0, sound: 'objectiveStart' });
            }
          }

          doors.forEach((d, index) => {
            const near = Math.hypot(localEntry.char.state.pos.x - d.center.x, localEntry.char.state.pos.y - d.center.y) <= Game.CONFIG.door.radius;
            if (d.progressLock(delta, near)){
              net.sendEvent({ kind: 'doorLocked', index });
              Game.Audio.playDoorLock();
            }
          });

          gates.forEach((g, index) => {
            const near = Math.hypot(localEntry.char.state.pos.x - g.state.pos.x, localEntry.char.state.pos.y - g.state.pos.y) <= Game.CONFIG.gate.radius;
            if (g.progressOpen(delta, near, gatesActive)){
              net.sendEvent({ kind: 'gateOpened', index });
              Game.Audio.playGateOpen();
            }
          });
          if (gatesActive && nearOpenGate(localEntry.char.state.pos)){
            localEntry.escaped = true;
            localEntry.el.classList.add('escaped');
            net.sendEvent({ kind: 'survivorEscaped', playerId: localId });
            Game.Audio.playSurvivorEscape();
            checkMatchResolution();
          }
        } else if (!stunned){
          if (ability1Requested) localAbility1.trigger();
          if (ability2Requested) localAbility2.trigger();
          if (ability3Requested && localAbility3.ready()){
            localAbility3.trigger();
            if (killerAbility3Key === 'trap'){
              if (activeTrap) activeTrap.el.remove();
              const pos = { x: localEntry.char.state.pos.x, y: localEntry.char.state.pos.y };
              activeTrap = { x: pos.x, y: pos.y, el: spawnTrapMarker(pos.x, pos.y) };
              net.sendEvent({ kind: 'trapPlaced', x: pos.x, y: pos.y });
            }
            // Invisibilidade não precisa de evento próprio — o estado
            // "ativa" já viaja no sendState de sempre (campo `invisible`)
          }
          if (attackRequested){
            const cCfg = Game.CONFIG.capture;
            if (carryingEntry){
              // já carregando alguém: só resta pendurar (se tiver um
              // gancho livre por perto) — não ataca nem pega outro
              const hookIndex = hooks.findIndex((h) => !h.occupiedBy &&
                Math.hypot(h.pos.x - localEntry.char.state.pos.x, h.pos.y - localEntry.char.state.pos.y) <= cCfg.hookRange);
              if (hookIndex >= 0){
                const targetId = carryingEntry.info.id;
                net.sendEvent({ kind: 'hooked', targetId, hookIndex });
                const hook = hooks[hookIndex];
                carryingEntry.capture.state.carried = false;
                carryingEntry.capture.state.hooked = true;
                carryingEntry.capture.state.hookPos = hook.pos;
                carryingEntry.capture.render();
                carryingEntry.char.state.pos.x = hook.pos.x;
                carryingEntry.char.state.pos.y = hook.pos.y - 10;
                carryingEntry.char.render();
                setHookOccupied(hook, targetId);
                carryingEntry = null;
              }
            } else {
              const downedNearby = activeSurvivors().find((e) => e.capture && e.capture.state.downed &&
                Math.hypot(e.char.state.pos.x - localEntry.char.state.pos.x, e.char.state.pos.y - localEntry.char.state.pos.y) <= cCfg.pickUpRange);
              if (downedNearby){
                net.sendEvent({ kind: 'pickedUp', targetId: downedNearby.info.id });
                downedNearby.capture.state.downed = false;
                downedNearby.capture.state.carried = true;
                downedNearby.capture.render();
                carryingEntry = downedNearby;
              } else {
                Game.Audio.playAttackSwing();
                localEntry.char.tryAttack(attemptKillerHit);
              }
            }
          }
          doors.forEach((d, index) => {
            const near = Math.hypot(localEntry.char.state.pos.x - d.center.x, localEntry.char.state.pos.y - d.center.y) <= Game.CONFIG.door.radius;
            if (d.progressBreak(delta, near)){
              net.sendEvent({ kind: 'doorBroken', index });
              Game.Audio.playDoorBreak();
            }
          });
          pallets.forEach((p, index) => {
            const near = Math.hypot(localEntry.char.state.pos.x - p.center.x, localEntry.char.state.pos.y - p.center.y) <= Game.CONFIG.pallet.radius;
            if (p.progressBreak(delta, near)){
              net.sendEvent({ kind: 'palletBroken', index });
              Game.Audio.playPalletBreak(); // feedback local — sendEvent/noise não voltam pro próprio remetente
              emitNoiseOnline(net, p.center.x, p.center.y, { radius: Game.CONFIG.noise.palletBreakRadius, ping: 1.5, sound: 'palletBreak' });
            }
          });
        }

        if (stunned || engagedObjective){
          localEntry.char.setMoving(false);
          if (isSurvivor){
            localEntry.health.update(delta, true);
            localEntry.char.setSprinting(false);
          }
        } else if (!localEntry.char.state.isAttacking){
          const dir = Game.Input.readMovement();
          const cfg = localEntry.char.characterConfig();
          if (isSurvivor) localEntry.health.update(delta, Math.hypot(dir.x, dir.y) <= 0.05);
          let speed = cfg.speed;
          const sprintActive = isSurvivor && (
            (localAbilityKey === 'sprint' && localAbility1.state.activeLeft > 0) ||
            (localAbilityKey2 === 'sprint' && localAbility3.state.activeLeft > 0)
          );
          if (isSurvivor && localEntry.health.state.injured) speed *= Game.CONFIG.health.injuredSpeedMultiplier;
          const snared = isSurvivor && performance.now() < localEntry.char.state.snaredUntil;
          if (snared) speed *= Game.CONFIG.abilities.killerTrap.snareSpeedMultiplier;
          if (sprintActive){
            speed *= Game.CONFIG.abilities.survivor.sprint.speedMultiplier;
          } else if (!isSurvivor && localAbility2.state.activeLeft > 0){
            speed *= Game.CONFIG.abilities.killerDash.speedMultiplier;
          }
          speed *= windowSpeedMultiplier(localEntry.char.state.pos, !isSurvivor);
          const moved = moveTowards(localEntry.char.state, cfg, dir, delta, speed);
          localEntry.char.setFacing(localEntry.char.state.facingRight);
          localEntry.char.setMoving(moved);
          if (isSurvivor) localEntry.char.setSprinting(sprintActive);
          if (moved && now - lastStepAt > (sprintActive ? 180 : 300)){
            lastStepAt = now;
            Game.Audio.playFootstep(sprintActive);
            spawnDust(localEntry.char.state.pos.x, localEntry.char.state.pos.y + 14);
            // sprint é mais rápido, mas arrisca ser ouvido de perto
            if (sprintActive){
              emitNoiseOnline(net, localEntry.char.state.pos.x, localEntry.char.state.pos.y, { radius: Game.CONFIG.noise.sprintRadius, ping: 0 });
            }
          }
        }
      }

      if (isSurvivor) localEntry.el.classList.toggle('hidden-in-spot', localEntry.hideout.state.hidden);
      // botão 2 (ability2/Q): pro Assassino é sempre a Investida; pro
      // Sobrevivente vira o "X" de sair do reparo, só aparece enquanto
      // engajado num gerador. Botão 3 (ability3/R): 2ª habilidade de
      // verdade do Sobrevivente, sempre visível igual ao botão 1
      Game.Input.setAbilityButtonsVisible(true, isSurvivor ? !!engagedObjective : true, isSurvivor ? 'X' : 'Q', isSurvivor);
      localEntry.char.render();
      const senseActive = !isSurvivor && localAbility1.state.activeLeft > 0;
      const spectating = spectatorFollowEntry();
      lighting.update(spectating ? spectating.char.state.pos : localEntry.char.state.pos, senseActive, visionBlockingWalls());

      if (now - lastStateSent > 70){
        lastStateSent = now;
        net.sendState({
          x: localEntry.char.state.pos.x,
          y: localEntry.char.state.pos.y,
          facingRight: localEntry.char.state.facingRight,
          moving: localEntry.el.classList.contains('running'),
          sprinting: isSurvivor && localEntry.char.state.sprinting,
          camouflaged: isSurvivor && (
            (localAbilityKey === 'camouflage' && localAbility1.state.activeLeft > 0) ||
            (localAbilityKey2 === 'camouflage' && localAbility3.state.activeLeft > 0) ||
            localEntry.hideout.state.hidden
          ),
          injured: isSurvivor && localEntry.health.state.injured,
          snared: isSurvivor && performance.now() < localEntry.char.state.snaredUntil,
          invisible: !isSurvivor && killerAbility3Key === 'invisibility' && localAbility3.state.activeLeft > 0,
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
  Game.startSoloAsKiller = startSoloAsKiller;
  Game.startOnline = startOnline;
  Game.resumeOnline = resumeOnline;
  Game.hideMatchUi = hideMatchUi;
})();
