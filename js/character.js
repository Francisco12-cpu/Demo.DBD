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
      hitUntil: 0,      // performance.now() — só Sobrevivente: tocando a animação de dano (sprite.animations.hit)
      snaredUntil: 0,   // performance.now() — só Sobrevivente: pisou na Armadilha do Assassino, mais lento por um tempo
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
    //
    // BUG-005 (BUGS.md): isso costumava ser `torso.style.filter = ...`
    // direto — filtro inline SEMPRE vence qualquer `filter` definido por
    // classe no CSS (.char.injured/.hooked/.hit-flash .torso etc.), então
    // só o Sobrevivente 1 (hueDeg=0, filter inline vira '') mostrava
    // qualquer feedback visual de ferido/pendurado/dano no online — os
    // Sobreviventes 2-4 (hue != 0) tinham o inline sempre vencendo e
    // NUNCA mostravam esses estados. Agora é uma custom property
    // (--survivor-hue), que style.css lê via hue-rotate(var(--survivor-hue,
    // 0deg)) dentro do PRÓPRIO filter de cada estado — os dois hue-rotate
    // somam matematicamente (CSS já faz isso sozinho), então a cor do
    // jogador e a cor do estado convivem em vez de uma apagar a outra.
    function setColorOverride(hueDeg){
      el.style.setProperty('--survivor-hue', (hueDeg || 0) + 'deg');
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

    // toca a animação de dano (sprite.animations.hit) pela duração real dela
    // — chamado no exato frame em que o Assassino acerta o 1º golpe (ver
    // health.hit() em js/main.js), separado do flash de brilho em CSS
    // (.hit-flash), que continua existindo como reforço visual imediato
    function playHit(){
      const sprite = spriteConfig();
      const anim = sprite.animations.hit;
      if (!anim) return;
      state.hitUntil = performance.now() + (anim.frames / anim.fps) * 1000;
    }

    // qual animação deveria estar tocando agora, dado o estado atual —
    // downed/carried (js/capture.js) tem prioridade (imóvel, esperando
    // gancho ou resgate), depois dano recém-tomado, depois ataque, depois
    // corrida (sprint se ativo), por último parado
    function pickAnimationName(sprite){
      const incapacitated = el.classList.contains('downed') || el.classList.contains('carried') || el.classList.contains('hooked');
      if (incapacitated && sprite.animations.downed){
        return 'downed';
      }
      if (performance.now() < state.hitUntil && sprite.animations.hit) return 'hit';
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
      // BUG-001 (BUGS.md): #arena empilhava só por ordem do DOM, então quem
      // nasceu depois desenhava por cima de quem nasceu antes, não importa
      // a posição — a sombra em si já era estática e correta (1º filho do
      // .char), o problema era a falta disso aqui. Ordenar por Y (mais
      // embaixo na tela = na frente) é o empilhamento 2.5D padrão.
      el.style.zIndex = Math.round(state.pos.y);
      el.classList.toggle('stunned', performance.now() < state.stunnedUntil);
      el.classList.toggle('snared', performance.now() < state.snaredUntil);
      updateAnimationFrame(performance.now());
    }

    return {
      state, characterConfig, setType, applyVisuals, setColorOverride,
      setFacing, setMoving, setSprinting, tryAttack, playHit, render,
    };
  }

  Game.createCharacter = createCharacter;
})();
