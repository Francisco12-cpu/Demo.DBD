window.Game = window.Game || {};

(function(){
  "use strict";

  // Fábrica de personagem único parametrizado por tipo (survivor/killer).
  // Nenhuma lógica de movimento/ataque deve ser duplicada por tipo — tudo
  // que muda entre Sobrevivente e Assassino vive em Game.CONFIG.characters.
  function createCharacter(type, el){
    const torso = el.querySelector('.torso');
    const label = el.querySelector('.label');

    const state = {
      type,
      pos: { x: 0, y: 0 },
      facingRight: true,
      isAttacking: false,
      canAttack: true,
    };

    function characterConfig(){
      return Game.CONFIG.characters[state.type];
    }

    function setType(newType){
      state.type = newType;
      applyVisuals();
    }

    function applyVisuals(){
      const cfg = characterConfig();
      torso.style.background = getComputedStyle(document.documentElement)
        .getPropertyValue(cfg.color).trim();
      label.textContent = cfg.label;
    }

    function setFacing(right){
      state.facingRight = right;
      el.classList.toggle('facing-left', !right);
    }

    function setMoving(moving){
      el.classList.toggle('running', moving);
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

    function render(){
      el.style.left = state.pos.x + 'px';
      el.style.top = state.pos.y + 'px';
    }

    return { state, characterConfig, setType, applyVisuals, setFacing, setMoving, tryAttack, render };
  }

  Game.createCharacter = createCharacter;
})();
