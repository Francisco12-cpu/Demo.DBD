window.Game = window.Game || {};

(function(){
  "use strict";

  // Estado de "capturado" de um Sobrevivente, em 3 fases — igual ao jogo
  // original em vez do golpe já travar direto numa luta:
  //   1. derrubado (downed): o 2º golpe derruba, mas não trava a luta
  //      ainda — o Sobrevivente fica imóvel esperando o Assassino chegar
  //      (ou um aliado reanimar, se o jogo tiver essa ação — hoje não tem).
  //   2. carregado (carried): o Assassino pega o derrubado (fica preso na
  //      posição dele, quem chama cuida de espelhar a posição a cada
  //      frame) e anda mais devagar carregando. O Sobrevivente pode tentar
  //      se soltar apertando repetido (`wiggleGoal` apertos) antes de
  //      chegar num gancho.
  //   3. pendurado (hooked): o Assassino pendura num `MAP.hookSpots`. AÍ
  //      sim começa a luta de verdade (struggle bar, apertando repetido
  //      antes do tempo acabar) — encher a tempo ou um aliado resgatar =
  //      volta ferido (não capturado de novo por um tempo); não encher =
  //      sacrificado (eliminado da partida).
  // `captured` continua true a fase inteira (downed/carried/hooked) — é o
  // flag que main.js já usa em todo lugar pra saber "esse Sobrevivente não
  // pode agir livremente agora", então não precisou mudar em todo canto.
  function createCapture(el){
    const bar = document.createElement('div');
    bar.className = 'struggle-bar';
    bar.innerHTML = '<div class="struggle-fill"></div>';
    el.appendChild(bar);
    const fill = bar.querySelector('.struggle-fill');

    /**
     * @typedef {Object} CaptureState
     * @property {boolean} captured - true durante as 3 fases (downed/carried/hooked)
     * @property {boolean} downed
     * @property {boolean} carried
     * @property {boolean} hooked
     * @property {boolean} eliminated
     * @property {number} wiggleProgress - 0..1, progresso de soltar-se enquanto carried
     * @property {number} hookProgress - 0..1, progresso da struggle bar enquanto hooked
     * @property {{x:number,y:number}|null} hookPos
     * @property {number} timeLeft - segundos até o sacrifício, enquanto hooked
     * @property {number} immunity - segundos de imunidade após escapar/ser resgatado
     */
    /** @type {CaptureState} */
    const state = {
      captured: false, downed: false, carried: false, hooked: false, eliminated: false,
      wiggleProgress: 0, hookProgress: 0, hookPos: null, timeLeft: 0, immunity: 0,
    };
    let onResolve = null; // (result: 'escaped'|'rescued'|'eliminated') => void

    function render(){
      el.classList.toggle('captured', state.captured);
      el.classList.toggle('downed', state.downed);
      el.classList.toggle('carried', state.carried);
      el.classList.toggle('hooked', state.hooked);
      const showBar = state.carried || state.hooked;
      bar.style.display = showBar ? 'block' : 'none';
      if (state.carried) fill.style.width = (state.wiggleProgress * 100) + '%';
      else if (state.hooked) fill.style.width = (state.hookProgress * 100) + '%';
    }

    // 2º golpe do Assassino: derruba (não é mais eliminação instantânea de
    // struggle) — onResolveCb só é chamado no desfecho final, lá na frente
    // (fugiu do gancho, foi resgatado ou foi sacrificado).
    function down(onResolveCb){
      if (state.eliminated || state.captured || state.immunity > 0) return;
      state.captured = true;
      state.downed = true;
      state.wiggleProgress = 0;
      state.hookProgress = 0;
      onResolve = onResolveCb;
      render();
    }

    // Assassino pega quem caiu (precisa estar perto — checagem de
    // distância é de quem chama, em js/main.js)
    function pickUp(){
      if (!state.downed) return false;
      state.downed = false;
      state.carried = true;
      state.wiggleProgress = 0;
      render();
      return true;
    }

    // enquanto carregado, apertar repetido tenta soltar antes de chegar
    // num gancho — retorna true no frame em que consegue se soltar
    function wigglePulse(){
      if (!state.carried) return false;
      const cfg = Game.CONFIG.capture;
      state.wiggleProgress += 1 / cfg.wiggleGoal;
      if (state.wiggleProgress >= 1){
        dropFree();
        return true;
      }
      render();
      return false;
    }

    // se soltou do carrego antes do gancho: cai derrubado de novo, no
    // lugar onde estava sendo carregado (quem chama já deixou a posição
    // certa, capture.js não mexe em posição)
    function dropFree(){
      state.carried = false;
      state.downed = true;
      state.wiggleProgress = 0;
      render();
    }

    // Assassino pendura no gancho (precisa estar carregando e perto de um
    // MAP.hookSpots — checagem de distância é de quem chama)
    function hook(hookPos){
      if (!state.carried) return false;
      const cfg = Game.CONFIG.capture;
      state.carried = false;
      state.hooked = true;
      state.hookPos = hookPos;
      state.hookProgress = 0;
      state.timeLeft = cfg.duration;
      render();
      return true;
    }

    // luta de verdade, igual sempre foi — só que agora acontece no gancho
    function hookPulse(){
      if (!state.hooked) return;
      const cfg = Game.CONFIG.capture;
      state.hookProgress = Math.min(1, state.hookProgress + cfg.pulseGain);
      render();
      if (state.hookProgress >= 1) resolve('escaped');
    }

    // outro Sobrevivente ativo chegou perto e resgatou quem tá pendurado
    // (checagem de distância/quem pode resgatar é de quem chama)
    function rescue(){
      if (!state.hooked) return;
      resolve('rescued');
    }

    // compatível com o botão de ação genérico que várias telas já usam —
    // decide sozinho se é wiggle (carregado) ou struggle (pendurado)
    function pulse(){
      if (state.carried) wigglePulse();
      else if (state.hooked) hookPulse();
    }

    function resolve(result){
      state.captured = false;
      state.downed = false;
      state.carried = false;
      state.hooked = false;
      state.hookPos = null;
      if (result === 'eliminated'){
        state.eliminated = true;
        el.classList.add('eliminated');
      } else {
        state.immunity = Game.CONFIG.capture.immunityAfterEscape;
      }
      render();
      const cb = onResolve;
      onResolve = null;
      if (cb) cb(result);
    }

    function update(delta){
      if (state.immunity > 0) state.immunity = Math.max(0, state.immunity - delta);
      if (!state.hooked) return;
      state.timeLeft -= delta;
      // decai um pouco com o tempo, então só apertar de vez em quando não basta
      state.hookProgress = Math.max(0, state.hookProgress - Game.CONFIG.capture.decayPerSec * delta);
      render();
      if (state.timeLeft <= 0) resolve('eliminated');
    }

    return { state, down, pickUp, wigglePulse, dropFree, hook, hookPulse, rescue, pulse, update, render };
  }

  Game.createCapture = createCapture;
})();
