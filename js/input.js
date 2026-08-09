window.Game = window.Game || {};

(function(){
  "use strict";

  // ---------- teclado ----------
  const keys = {};
  let spaceRequested = false;
  let ability1Requested = false; // KeyE
  let ability2Requested = false; // KeyQ (só o Assassino usa as duas)

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space'){
      e.preventDefault();
      spaceRequested = true;
    }
    if (e.code === 'KeyE') ability1Requested = true;
    if (e.code === 'KeyQ') ability2Requested = true;
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  function isDown(...codes){ return codes.some(c => keys[c]); }

  // ---------- touch (joystick virtual + botões) ----------
  const isTouchDevice = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const touchDir = { x: 0, y: 0 };
  let touchAttackRequested = false;
  let touchAbility1Requested = false;
  let touchAbility2Requested = false;
  // sensibilidade do joystick virtual (1 = padrão) — configurável no menu
  // de opções; maior = alcança velocidade máxima com um arrasto menor
  let joystickSensitivity = 1;
  function setJoystickSensitivity(v){ joystickSensitivity = Math.max(0.5, Math.min(2, v)); }

  function setupTouchControls(){
    if (!isTouchDevice) return;

    const controls = document.getElementById('touch-controls');
    const joystickBase = document.getElementById('touch-joystick');
    const joystickStick = document.getElementById('touch-joystick-stick');
    const attackBtn = document.getElementById('touch-attack');
    const ability1Btn = document.getElementById('touch-ability1');
    const ability2Btn = document.getElementById('touch-ability2');
    if (!controls || !joystickBase || !attackBtn) return;

    controls.style.display = 'flex';

    const maxRadius = 40;
    let activeTouchId = null;
    let baseRect = null;

    function updateDrag(clientX, clientY){
      if (!baseRect) return;
      const cx = baseRect.left + baseRect.width / 2;
      const cy = baseRect.top + baseRect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxRadius){ dx = (dx / dist) * maxRadius; dy = (dy / dist) * maxRadius; }
      joystickStick.style.transform = `translate(${dx}px, ${dy}px)`;
      touchDir.x = Math.max(-1, Math.min(1, (dx / maxRadius) * joystickSensitivity));
      touchDir.y = Math.max(-1, Math.min(1, (dy / maxRadius) * joystickSensitivity));
    }

    function endDrag(){
      activeTouchId = null;
      baseRect = null;
      touchDir.x = 0; touchDir.y = 0;
      joystickStick.style.transform = 'translate(0,0)';
    }

    joystickBase.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      activeTouchId = t.identifier;
      baseRect = joystickBase.getBoundingClientRect();
      updateDrag(t.clientX, t.clientY);
    }, { passive: false });

    joystickBase.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches){
        if (t.identifier === activeTouchId) updateDrag(t.clientX, t.clientY);
      }
    }, { passive: false });

    joystickBase.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches){
        if (t.identifier === activeTouchId) endDrag();
      }
    });
    joystickBase.addEventListener('touchcancel', endDrag);

    attackBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      touchAttackRequested = true;
    }, { passive: false });

    if (ability1Btn){
      ability1Btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        touchAbility1Requested = true;
      }, { passive: false });
    }
    if (ability2Btn){
      ability2Btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        touchAbility2Requested = true;
      }, { passive: false });
    }
  }

  function setAbilityButtonsVisible(show1, show2){
    const ability1Btn = document.getElementById('touch-ability1');
    const ability2Btn = document.getElementById('touch-ability2');
    if (ability1Btn) ability1Btn.style.display = show1 ? '' : 'none';
    if (ability2Btn) ability2Btn.style.display = show2 ? '' : 'none';
  }

  // ---------- gamepad ----------
  let gamepadState = { x: 0, y: 0, attack: false, ability1: false, ability2: false };

  function pollGamepad(){
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads){
      if (!pad) continue;
      const dx = pad.axes[0] || 0;
      const dy = pad.axes[1] || 0;
      const attack = !!(pad.buttons[0] && pad.buttons[0].pressed);
      const ability1 = !!(pad.buttons[1] && pad.buttons[1].pressed);
      const ability2 = !!(pad.buttons[2] && pad.buttons[2].pressed);
      if (Math.abs(dx) > 0.15 || Math.abs(dy) > 0.15 || attack || ability1 || ability2){
        gamepadState = { x: dx, y: dy, attack, ability1, ability2 };
        return;
      }
    }
    gamepadState = { x: 0, y: 0, attack: false, ability1: false, ability2: false };
  }

  // ---------- API pública ----------
  // Chamar uma vez por frame antes de ler movimento/ataque/habilidades.
  function update(){
    pollGamepad();
  }

  function readMovement(){
    let dx = 0, dy = 0;
    if (isDown('KeyA','ArrowLeft')) dx -= 1;
    if (isDown('KeyD','ArrowRight')) dx += 1;
    if (isDown('KeyW','ArrowUp')) dy -= 1;
    if (isDown('KeyS','ArrowDown')) dy += 1;
    if (dx !== 0 || dy !== 0) return { x: dx, y: dy };

    if (Math.abs(touchDir.x) > 0.1 || Math.abs(touchDir.y) > 0.1){
      return { x: touchDir.x, y: touchDir.y };
    }

    if (Math.abs(gamepadState.x) > 0.15 || Math.abs(gamepadState.y) > 0.15){
      return { x: gamepadState.x, y: gamepadState.y };
    }

    return { x: 0, y: 0 };
  }

  function consumeAttackRequest(){
    let requested = false;
    if (spaceRequested){ requested = true; spaceRequested = false; }
    if (touchAttackRequested){ requested = true; touchAttackRequested = false; }
    if (gamepadState.attack) requested = true;
    return requested;
  }

  function consumeAbility1Request(){
    let requested = false;
    if (ability1Requested){ requested = true; ability1Requested = false; }
    if (touchAbility1Requested){ requested = true; touchAbility1Requested = false; }
    if (gamepadState.ability1) requested = true;
    return requested;
  }

  function consumeAbility2Request(){
    let requested = false;
    if (ability2Requested){ requested = true; ability2Requested = false; }
    if (touchAbility2Requested){ requested = true; touchAbility2Requested = false; }
    if (gamepadState.ability2) requested = true;
    return requested;
  }

  Game.Input = {
    init: setupTouchControls,
    update,
    readMovement,
    consumeAttackRequest,
    consumeAbility1Request,
    consumeAbility2Request,
    setAbilityButtonsVisible,
    setJoystickSensitivity,
    isTouchDevice,
  };
})();
