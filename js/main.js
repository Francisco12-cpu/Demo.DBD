window.Game = window.Game || {};

(function(){
  "use strict";

  const arena = document.getElementById('arena');
  const playerEl = document.getElementById('player');
  const dummy = document.getElementById('dummy');
  const hpFill = document.getElementById('hp-fill');

  const MAP = Game.MAP;
  const player = Game.createCharacter('survivor', playerEl);

  let dummyHp = 100;
  const dummyMaxHp = 100;
  let dummyWall = null; // AABB do dummy, tratado como obstáculo sólido

  function buildMap(){
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

    dummy.style.left = MAP.dummy.x + 'px';
    dummy.style.top = MAP.dummy.y + 'px';
    dummy.style.transform = 'translate(-50%,-50%)';

    const dw = 15, dh = 19; // metade da largura/altura do dummy (30x38)
    dummyWall = { x: MAP.dummy.x - dw, y: MAP.dummy.y - dh, w: dw * 2, h: dh * 2 };

    player.state.pos.x = MAP.player.x;
    player.state.pos.y = MAP.player.y;
  }

  function allWalls(){
    return dummyWall ? MAP.walls.concat([dummyWall]) : MAP.walls;
  }

  // Mapa tem resolução lógica fixa (MAP.width x MAP.height); escala a
  // arena inteira via CSS transform pra caber na tela em vez de recalcular
  // posições — assim o mapa/colisão nunca precisam saber do viewport.
  function fitToViewport(){
    const margin = 40;
    // Em telas touch reserva espaço pro joystick/botão de ataque fixos no
    // rodapé; no desktop reserva só o espaço da caixa de instruções.
    const bottomSpace = Game.Input.isTouchDevice ? 170 : 90;
    const scale = Math.min(
      1,
      (window.innerWidth - margin) / MAP.width,
      (window.innerHeight - bottomSpace) / MAP.height
    );
    arena.style.transform = `scale(${scale})`;
  }

  function attemptHit(cfg){
    const dx = MAP.dummy.x - player.state.pos.x;
    const dy = MAP.dummy.y - player.state.pos.y;
    const dist = Math.hypot(dx, dy);
    const facingMatches = (player.state.facingRight && dx > -10) || (!player.state.facingRight && dx < 10);

    if (dist <= cfg.attackRange && facingMatches){
      dummyHp = Math.max(0, dummyHp - cfg.attackDamage);
      hpFill.style.width = (dummyHp / dummyMaxHp * 100) + '%';
      dummy.style.filter = 'brightness(2)';
      setTimeout(() => { dummy.style.filter = ''; }, 100);
      if (dummyHp === 0){
        setTimeout(() => {
          dummyHp = dummyMaxHp;
          hpFill.style.width = '100%';
        }, 400);
      }
    }
  }

  // ---------- LOOP PRINCIPAL ----------
  let lastTime = performance.now();

  function loop(now){
    const delta = (now - lastTime) / 1000;
    lastTime = now;

    Game.Input.update();

    if (Game.Input.consumeAttackRequest()){
      player.tryAttack(attemptHit);
    }

    if (!player.state.isAttacking){
      const dir = Game.Input.readMovement();
      const len = Math.hypot(dir.x, dir.y);
      const moving = len > 0.05;

      if (moving){
        const nx = dir.x / len, ny = dir.y / len;
        const cfg = player.characterConfig();
        const radius = Game.CONFIG.playerRadius;

        let x = player.state.pos.x + nx * cfg.speed * delta;
        let y = player.state.pos.y + ny * cfg.speed * delta;
        x = Math.max(radius, Math.min(MAP.width - radius, x));
        y = Math.max(radius, Math.min(MAP.height - radius, y));

        const resolved = Game.mapCollision.resolvePosition({ x, y }, radius, allWalls());
        player.state.pos.x = resolved.x;
        player.state.pos.y = resolved.y;

        if (nx > 0.01) player.setFacing(true);
        if (nx < -0.01) player.setFacing(false);
      }

      player.setMoving(moving);
    }

    player.render();
    requestAnimationFrame(loop);
  }

  // ---------- PAINEL DE CONFIGURAÇÃO ----------
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

  btnSurvivor.addEventListener('click', () => {
    player.setType('survivor');
    btnSurvivor.classList.add('active');
    btnKiller.classList.remove('active');
    syncPanel();
  });

  btnKiller.addEventListener('click', () => {
    player.setType('killer');
    btnKiller.classList.add('active');
    btnSurvivor.classList.remove('active');
    syncPanel();
  });

  speedSlider.addEventListener('input', () => {
    const v = parseInt(speedSlider.value, 10);
    speedVal.textContent = v;
    player.characterConfig().speed = v;
  });

  damageSlider.addEventListener('input', () => {
    const v = parseInt(damageSlider.value, 10);
    damageVal.textContent = v;
    player.characterConfig().attackDamage = v;
  });

  // ---------- INIT ----------
  buildMap();
  player.applyVisuals();
  syncPanel();
  Game.Input.init();
  if (Game.Input.isTouchDevice){
    // controles touch já mostram o que fazer; o texto é só ruído na tela pequena
    document.getElementById('hint').style.display = 'none';
  }
  window.addEventListener('resize', fitToViewport);
  fitToViewport();
  requestAnimationFrame(loop);
})();
