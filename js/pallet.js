window.Game = window.Game || {};

(function(){
  "use strict";

  // Pallet: obstáculo solto no mapa (ver js/map.js). Começa "em pé", sem
  // bloquear nada. O Sobrevivente derruba na hora (ação instantânea de
  // botão, diferente de porta que é canalizada) ficando perto — isso vira
  // uma parede de verdade (ver allWalls() em js/main.js) e atordoa o
  // Assassino se ele estava perto o bastante no exato instante da queda
  // (checagem de quem chama, main.js). O Assassino consegue quebrar de vez
  // canalizando perto, igual arrombar porta, só que mais devagar de
  // propósito — o loop só vale a pena se custar tempo real de perseguição.
  function createPallet(rect, el){
    const center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
    /**
     * @typedef {Object} PalletState
     * @property {{x:number,y:number,w:number,h:number}} rect
     * @property {boolean} dropped - derrubado vira parede de verdade (ver allWalls() em main.js)
     * @property {boolean} broken - quebrado não bloqueia mais nada, só entulho visual
     * @property {number} breakProgress - 0..1, canalização do Assassino
     */
    /** @type {PalletState} */
    const state = { rect, dropped: false, broken: false, breakProgress: 0 };

    function render(){
      el.classList.toggle('dropped', state.dropped);
      el.classList.toggle('broken', state.broken);
      el.classList.toggle('channeling', state.breakProgress > 0.02);
      el.style.setProperty('--pallet-progress', Math.round(state.breakProgress * 100) + '%');
    }

    // ação local do Sobrevivente — quem chama já garante que está dentro do
    // raio. Retorna true só se realmente derrubou agora (pra sincronizar
    // pela rede e pra checar o stun do Assassino).
    function drop(){
      if (state.dropped || state.broken) return false;
      state.dropped = true;
      render();
      return true;
    }

    // canalização do Assassino perto de um pallet já derrubado — mesmo
    // formato de progressBreak de porta, retorna true no frame que finaliza
    function progressBreak(delta, killerNear){
      if (!state.dropped || state.broken) return false;
      const cfg = Game.CONFIG.pallet;
      if (killerNear){
        state.breakProgress += delta / cfg.breakDuration;
        if (state.breakProgress >= 1){
          state.broken = true;
          state.dropped = false; // deixa de bloquear colisão — só entulho visual
          state.breakProgress = 0;
          render();
          return true;
        }
      } else if (state.breakProgress > 0){
        state.breakProgress = Math.max(0, state.breakProgress - delta * 0.6);
      }
      render();
      return false;
    }

    // aplica estado vindo de rede (outros clientes espelham, não recalculam)
    function setDropped(dropped){
      state.dropped = dropped;
      state.breakProgress = 0;
      render();
    }

    function setBroken(broken){
      state.broken = broken;
      state.dropped = false;
      state.breakProgress = 0;
      render();
    }

    render();
    return { state, center, drop, progressBreak, setDropped, setBroken, render };
  }

  Game.createPallet = createPallet;
})();
