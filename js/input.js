window.Game = window.Game || {};

(function(){
  "use strict";

  // ---------- teclado ----------
  const keys = {};
  let spaceRequested = false;
  let ability1Requested = false;
  let ability2Requested = false; // Investida do Assassino; pro Sobrevivente só faz algo enquanto engajado num gerador
  let ability3Requested = false; // 2ª habilidade do Sobrevivente / 3ª do Assassino
  let pingRequested = false; // marcador de comunicação, só Sobrevivente online

  // remapeamento de tecla (acessibilidade — ver Configurações no menu):
  // só as 4 ações de "botão" abaixo são remapeáveis, WASD/setas (movimento)
  // e Space (ataque/interação) continuam fixos de propósito — são usados
  // em todo teclado/idioma sem ambiguidade, e liberar remapeá-los abriria
  // espaço pra travar o próprio movimento sem querer.
  const DEFAULT_KEYBINDS = { ability1: 'KeyE', ability2: 'KeyQ', ability3: 'KeyR', ping: 'KeyV' };
  const RESERVED_CODES = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space']);
  let keybinds = { ...DEFAULT_KEYBINDS };
  (function loadKeybinds(){
    try {
      const saved = JSON.parse(localStorage.getItem('dbd_keybinds') || '{}');
      // só aceita valores que ainda são ações válidas E não colidem com
      // reservado/duplicado — protege contra localStorage editado à mão
      // ou uma versão futura que remova uma ação
      const next = { ...DEFAULT_KEYBINDS };
      const used = new Set();
      Object.keys(DEFAULT_KEYBINDS).forEach((action) => {
        const code = saved[action];
        if (typeof code === 'string' && !RESERVED_CODES.has(code) && !used.has(code)){
          next[action] = code;
          used.add(code);
        }
      });
      keybinds = next;
    } catch { keybinds = { ...DEFAULT_KEYBINDS }; }
  })();

  function setKeybind(action, code){
    if (!(action in keybinds)) return { ok: false, reason: 'ação desconhecida' };
    if (RESERVED_CODES.has(code)) return { ok: false, reason: 'essa tecla é reservada pro movimento/ataque' };
    const conflict = Object.keys(keybinds).find((a) => a !== action && keybinds[a] === code);
    if (conflict) return { ok: false, reason: 'essa tecla já está em uso por outra ação' };
    keybinds[action] = code;
    localStorage.setItem('dbd_keybinds', JSON.stringify(keybinds));
    return { ok: true };
  }
  function resetKeybinds(){
    keybinds = { ...DEFAULT_KEYBINDS };
    localStorage.setItem('dbd_keybinds', JSON.stringify(keybinds));
  }
  function getKeybinds(){ return { ...keybinds }; }

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space'){
      e.preventDefault();
      spaceRequested = true;
    }
    if (e.code === keybinds.ability1) ability1Requested = true;
    if (e.code === keybinds.ability2) ability2Requested = true;
    if (e.code === keybinds.ability3) ability3Requested = true;
    if (e.code === keybinds.ping) pingRequested = true;
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  function isDown(...codes){ return codes.some(c => keys[c]); }

  // feedback tátil nos momentos de impacto (golpe recebido, skill check
  // errado, pendurado no gancho) — navigator.vibrate só existe em Android
  // (iOS Safari nunca implementou); a checagem evita erro nos outros
  // navegadores, simplesmente não faz nada lá
  function vibrate(pattern){
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  // ---------- touch (joystick virtual + botões) ----------
  const isTouchDevice = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const touchDir = { x: 0, y: 0 };
  let touchAttackRequested = false;
  let touchAbility1Requested = false;
  let touchAbility2Requested = false;
  let touchAbility3Requested = false;
  let touchPingRequested = false;
  // sensibilidade do joystick virtual (1 = padrão) — configurável no menu
  // de opções; maior = alcança velocidade máxima com um arrasto menor
  let joystickSensitivity = 1;
  function setJoystickSensitivity(v){ joystickSensitivity = Math.max(0.5, Math.min(2, v)); }

  // BUG-010 (BUGS.md): Game.Input.init() (= setupTouchControls) é chamado
  // de novo toda vez que uma partida começa (beginMatchUi() em main.js) —
  // sem essa guarda, cada partida registrava outro conjunto inteiro de
  // listeners de toque em cima dos anteriores (o "#touch-controls" nunca é
  // recriado, é sempre o mesmo elemento do DOM), acumulando pra sempre.
  // Depois de sair e entrar 10x, cada toque disparava 10 handlers.
  let touchControlsInitialized = false;
  function setupTouchControls(){
    if (!isTouchDevice) return;
    if (touchControlsInitialized) return;
    touchControlsInitialized = true;

    const controls = document.getElementById('touch-controls');
    const joystickBase = document.getElementById('touch-joystick');
    const joystickStick = document.getElementById('touch-joystick-stick');
    const attackBtn = document.getElementById('touch-attack');
    const ability1Btn = document.getElementById('touch-ability1');
    const ability2Btn = document.getElementById('touch-ability2');
    const ability3Btn = document.getElementById('touch-ability3');
    const pingBtn = document.getElementById('touch-ping');
    if (!controls || !joystickBase || !attackBtn) return;

    controls.style.display = 'flex';

    const maxRadius = 40;
    let activePointerId = null;
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
      activePointerId = null;
      baseRect = null;
      touchDir.x = 0; touchDir.y = 0;
      joystickStick.style.transform = 'translate(0,0)';
    }

    // Pointer Events em vez de Touch Events, com setPointerCapture: a
    // tentativa anterior (rede de segurança ouvindo touchend/touchcancel
    // em QUALQUER lugar da página) só se recuperava se algum outro evento
    // de toque acontecesse depois — se o sistema roubasse o gesto (troca
    // de app, gesto de navegação, notificação) sem NENHUM toque
    // subsequente em lugar nenhum da página, a rede de segurança nunca era
    // acionada e o joystick ficava preso do mesmo jeito. `setPointerCapture`
    // resolve isso de verdade: garante que `lostpointercapture` dispara
    // nesse elemento sempre que a captura é perdida por qualquer motivo,
    // mesmo sem outro toque acontecer — é a garantia que faltava.
    joystickBase.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return; // mouse não usa o joystick virtual
      e.preventDefault();
      activePointerId = e.pointerId;
      joystickBase.setPointerCapture(e.pointerId);
      baseRect = joystickBase.getBoundingClientRect();
      updateDrag(e.clientX, e.clientY);
    }, { passive: false });

    joystickBase.addEventListener('pointermove', (e) => {
      if (e.pointerId !== activePointerId) return;
      e.preventDefault();
      updateDrag(e.clientX, e.clientY);
    }, { passive: false });

    joystickBase.addEventListener('pointerup', (e) => {
      if (e.pointerId === activePointerId) endDrag();
    });
    joystickBase.addEventListener('pointercancel', (e) => {
      if (e.pointerId === activePointerId) endDrag();
    });
    joystickBase.addEventListener('lostpointercapture', (e) => {
      if (e.pointerId === activePointerId) endDrag();
    });

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
    if (ability3Btn){
      ability3Btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        touchAbility3Requested = true;
      }, { passive: false });
    }
    if (pingBtn){
      pingBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        touchPingRequested = true;
      }, { passive: false });
    }
  }

  // label2/label3: texto dos botões de habilidade 2/3 — "Q" pro dash do
  // Assassino, "X" quando o Sobrevivente reaproveita o botão 2 pra sair do
  // modo de reparo do gerador. Omitir mantém o texto atual.
  function setAbilityButtonsVisible(show1, show2, label2, show3, label3){
    const ability1Btn = document.getElementById('touch-ability1');
    const ability2Btn = document.getElementById('touch-ability2');
    const ability3Btn = document.getElementById('touch-ability3');
    if (ability1Btn) ability1Btn.style.display = show1 ? '' : 'none';
    if (ability2Btn){
      ability2Btn.style.display = show2 ? '' : 'none';
      if (label2) ability2Btn.textContent = label2;
    }
    if (ability3Btn){
      ability3Btn.style.display = show3 ? '' : 'none';
      if (label3) ability3Btn.textContent = label3;
    }
  }

  // marcador de comunicação (só Sobrevivente, só online) — botão dedicado
  // fora do grupo de habilidades, então tem visibilidade própria em vez de
  // reaproveitar setAbilityButtonsVisible.
  function setPingButtonVisible(show){
    const btn = document.getElementById('touch-ping');
    if (btn) btn.style.display = show ? '' : 'none';
  }

  // ---------- gamepad ----------
  let gamepadState = { x: 0, y: 0, attack: false, ability1: false, ability2: false, ability3: false, ping: false };
  let gamepadConnected = false;

  // nomes dos botões variam por fabricante — Xbox chama de A/X/Y/B, PlayStation
  // de X/Quadrado/Triângulo/Círculo. `pad.id` geralmente entrega uma pista
  // (padrão do navegador: "<nome> (Vendor: 054c ...)" pra Sony, "Xbox" no
  // nome pra Microsoft) — heurística simples só pra deixar a dica mais clara.
  function buttonLabelsFor(pad){
    const id = (pad && pad.id || '').toLowerCase();
    if (id.includes('054c') || id.includes('playstation') || id.includes('dualshock') || id.includes('dualsense')){
      return { attack: 'X', ability1: 'Quadrado', ability2: 'Triângulo', ability3: 'Círculo' };
    }
    return { attack: 'A', ability1: 'X', ability2: 'Y', ability3: 'B' };
  }

  function showGamepadToast(text, holdMs){
    const toast = document.getElementById('gamepad-toast');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('active');
    clearTimeout(showGamepadToast._t);
    showGamepadToast._t = setTimeout(() => toast.classList.remove('active'), holdMs || 3200);
  }

  window.addEventListener('gamepadconnected', (e) => {
    gamepadConnected = true;
    const labels = buttonLabelsFor(e.gamepad);
    showGamepadToast(`🎮 Controle conectado — ${labels.attack} interage/ataca · ${labels.ability1} habilidade 1 · ${labels.ability2} habilidade 2 · ${labels.ability3} habilidade 3`, 4500);
  });
  window.addEventListener('gamepaddisconnected', () => {
    gamepadConnected = false;
    showGamepadToast('🎮 Controle desconectado', 2000);
  });

  function pollGamepad(){
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads){
      if (!pad) continue;
      const dx = pad.axes[0] || 0;
      const dy = pad.axes[1] || 0;
      const attack = !!(pad.buttons[0] && pad.buttons[0].pressed);
      const ability1 = !!(pad.buttons[1] && pad.buttons[1].pressed);
      const ability2 = !!(pad.buttons[2] && pad.buttons[2].pressed);
      const ability3 = !!(pad.buttons[3] && pad.buttons[3].pressed);
      const ping = !!(pad.buttons[4] && pad.buttons[4].pressed); // L1/LB
      if (Math.abs(dx) > 0.15 || Math.abs(dy) > 0.15 || attack || ability1 || ability2 || ability3 || ping){
        gamepadState = { x: dx, y: dy, attack, ability1, ability2, ability3, ping };
        return;
      }
    }
    gamepadState = { x: 0, y: 0, attack: false, ability1: false, ability2: false, ability3: false, ping: false };
  }

  // ---------- API pública ----------
  // Achado numa auditoria (não era bug relatado, achado revisando o
  // próprio código do menu de pausa, BUG-010): abrir o menu de pausa só
  // mostrava um overlay por cima — não impedia teclado/gamepad de
  // continuar sendo lido pelo loop por baixo (touch já ficava bloqueado
  // de graça, o overlay cobre a tela toda com pointer-events:auto). Quem
  // jogava de teclado podia continuar andando/atacando "às cegas" com o
  // menu aberto por cima, sem ver nada. `setPaused(true)` zera e passa a
  // ignorar tudo (inclusive limpando os requests de toque/gamepad
  // pendentes, pra nada "vazar" pro primeiro frame depois de despausar).
  let paused = false;
  function setPaused(v){ paused = v; }

  // Chamar uma vez por frame antes de ler movimento/ataque/habilidades.
  function update(){
    pollGamepad();
  }

  function readMovement(){
    if (paused) return { x: 0, y: 0 };
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
    return paused ? false : requested;
  }

  function consumeAbility1Request(){
    let requested = false;
    if (ability1Requested){ requested = true; ability1Requested = false; }
    if (touchAbility1Requested){ requested = true; touchAbility1Requested = false; }
    if (gamepadState.ability1) requested = true;
    return paused ? false : requested;
  }

  function consumeAbility2Request(){
    let requested = false;
    if (ability2Requested){ requested = true; ability2Requested = false; }
    if (touchAbility2Requested){ requested = true; touchAbility2Requested = false; }
    if (gamepadState.ability2) requested = true;
    return paused ? false : requested;
  }

  function consumeAbility3Request(){
    let requested = false;
    if (ability3Requested){ requested = true; ability3Requested = false; }
    if (touchAbility3Requested){ requested = true; touchAbility3Requested = false; }
    if (gamepadState.ability3) requested = true;
    return paused ? false : requested;
  }

  function consumePingRequest(){
    let requested = false;
    if (pingRequested){ requested = true; pingRequested = false; }
    if (touchPingRequested){ requested = true; touchPingRequested = false; }
    if (gamepadState.ping) requested = true;
    return paused ? false : requested;
  }

  Game.Input = {
    init: setupTouchControls,
    update,
    setPaused,
    readMovement,
    consumeAttackRequest,
    consumeAbility1Request,
    consumeAbility2Request,
    consumeAbility3Request,
    consumePingRequest,
    setAbilityButtonsVisible,
    setPingButtonVisible,
    setKeybind,
    resetKeybinds,
    getKeybinds,
    setJoystickSensitivity,
    isTouchDevice,
    vibrate,
    get gamepadConnected(){ return gamepadConnected; },
  };
})();
