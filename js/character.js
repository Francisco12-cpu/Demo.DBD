window.Game = window.Game || {};

(function(){
  "use strict";

  // Fábrica de personagem único parametrizado por tipo (survivor/killer).
  // Nenhuma lógica de movimento/ataque deve ser duplicada por tipo — tudo
  // que muda entre Sobrevivente e Assassino vive em Game.CONFIG.characters
  // (números) e Game.CONFIG.sprites (arte). Desenha via CSS
  // background-image + background-position sobre a spritesheet real
  // (assets/killer-sheet.png, assets/survivor-sheet.png) — cada instância
  // guarda só qual animação está tocando e desde quando, `render()`
  // calcula o frame certo a cada chamada (a cada frame do jogo).
  function createCharacter(type, el){
    const torso = el.querySelector('.torso');
    const label = el.querySelector('.label');

    const state = {
      type,
      pos: { x: 0, y: 0 },
      facingRight: true,
      isAttacking: false,
      canAttack: true,
      sprinting: false, // só Sobrevivente: usa a animação "sprint" (mais rápida) enquanto a habilidade Sprint está ativa
      stunnedUntil: 0,  // performance.now() — só Assassino: atordoado por um pallet derrubado perto dele
    };

    let currentAnimName = null;
    let animStartedAt = 0;

    function characterConfig(){
      return Game.CONFIG.characters[state.type];
    }

    function spriteConfig(){
      return Game.CONFIG.sprites[state.type];
    }

    function setType(newType){
      state.type = newType;
      applyVisuals();
    }

    function applyVisuals(){
      const cfg = characterConfig();
      const sprite = spriteConfig();
      label.textContent = cfg.label;
      const scaled = sprite.frameSize * sprite.scale;
      torso.style.backgroundImage = `url('${sprite.sheet}')`;
      torso.style.width = scaled + 'px';
      torso.style.height = scaled + 'px';
      torso.style.backgroundSize = (sprite.cols * scaled) + 'px ' + (sprite.rows * scaled) + 'px';
      currentAnimName = null; // força recalcular no próximo render (mudou de tipo)
    }

    // Sobrescreve só a cor (usado pra diferenciar vários Sobreviventes na
    // mesma partida — não muda tipo/config, só o visual). hueDeg: graus de
    // hue-rotate (0 = cor original da arte).
    function setColorOverride(hueDeg){
      torso.style.filter = hueDeg ? `hue-rotate(${hueDeg}deg)` : '';
    }

    function setFacing(right){
      state.facingRight = right;
      el.classList.toggle('facing-left', !right);
    }

    function setMoving(moving){
      el.classList.toggle('running', moving);
    }

    // só o Sobrevivente usa — liga a animação "sprint" (mais rápida)
    // enquanto a habilidade Sprint está com efeito ativo
    function setSprinting(active){
      state.sprinting = active;
    }

    // onHit(cfg) é chamado assim que o golpe é disparado — quem chama decide
    // se acertou um alvo (checagem de distância/direção fica fora daqui,
    // já que isso depende do mundo/alvos, não do personagem em si).
    function tryAttack(onHit){
      if (!state.canAttack || state.isAttacking) return;
      const cfg = characterConfig();

      state.isAttacking = true;
      state.canAttack = false;
      el.classList.add('attacking');

      if (onHit) onHit(cfg);

      setTimeout(() => {
        state.isAttacking = false;
        el.classList.remove('attacking');
      }, cfg.attackDuration);

      setTimeout(() => { state.canAttack = true; }, cfg.attackCooldown);
    }

    // qual animação deveria estar tocando agora, dado o estado atual —
    // downed/carried (js/capture.js) tem prioridade (imóvel, esperando
    // gancho ou resgate), depois ataque, depois corrida (sprint se ativo),
    // por último parado
    function pickAnimationName(sprite){
      const incapacitated = el.classList.contains('downed') || el.classList.contains('carried') || el.classList.contains('hooked');
      if (incapacitated && sprite.animations.downed){
        return 'downed';
      }
      if (state.isAttacking && sprite.animations.attack) return 'attack';
      if (el.classList.contains('running')){
        if (state.sprinting && sprite.animations.sprint) return 'sprint';
        if (sprite.animations.run) return 'run';
      }
      return sprite.animations.idle ? 'idle' : 'run';
    }

    function updateAnimationFrame(now){
      const sprite = spriteConfig();
      if (!sprite) return;
      const name = pickAnimationName(sprite);
      if (name !== currentAnimName){
        currentAnimName = name;
        animStartedAt = now;
      }
      const anim = sprite.animations[name];
      const scaled = sprite.frameSize * sprite.scale;
      const elapsedSec = (now - animStartedAt) / 1000;
      let frame = Math.floor(elapsedSec * anim.fps);
      frame = anim.loop ? frame % anim.frames : Math.min(frame, anim.frames - 1);
      torso.style.backgroundPosition = `-${frame * scaled}px -${anim.row * scaled}px`;
    }

    function render(){
      el.style.left = state.pos.x + 'px';
      el.style.top = state.pos.y + 'px';
      el.classList.toggle('stunned', performance.now() < state.stunnedUntil);
      updateAnimationFrame(performance.now());
    }

    return {
      state, characterConfig, setType, applyVisuals, setColorOverride,
      setFacing, setMoving, setSprinting, tryAttack, render,
    };
  }

  Game.createCharacter = createCharacter;
})();
