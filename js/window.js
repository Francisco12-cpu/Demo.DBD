window.Game = window.Game || {};

(function(){
  "use strict";

  // Janela: vão numa parede de sala que NUNCA bloqueia ninguém (ver
  // js/map.js — nunca entra em `allWalls()`, ao contrário de porta/pallet).
  // Sem estado — a única coisa que muda é a velocidade de quem passa perto
  // (ver windowSpeedMultiplier em js/main.js), calculada direto pela
  // posição já sincronizada, sem evento de rede novo. Mantém o padrão do
  // projeto de toda peça do mapa nascer de uma fábrica Game.createX, mesmo
  // sem `state` de verdade pra guardar.
  function createWindow(rect, el){
    const center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
    return { rect, center };
  }

  Game.createWindow = createWindow;
})();
