window.Game = window.Game || {};

(function(){
  "use strict";

  // Mapa fixo V1. Puramente dados + colisão — sem referência a personagem
  // nem ao DOM, pra não travar uma futura migração pra mapas em tileset/
  // gerados (V2). x/y de walls é o canto superior-esquerdo (AABB).
  const MAP = {
    width: 900,
    height: 560,
    player: { x: 130, y: 280 },
    dummy: { x: 760, y: 280 },
    killer: { x: 820, y: 480 },
    // pontos de spawn pra até 4 sobreviventes no modo online (índice = ordem de entrada)
    survivorSpawns: [
      { x: 130, y: 280 },
      { x: 130, y: 460 },
      { x: 130, y: 100 },
      { x: 300, y: 100 },
    ],
    walls: [
      { x: 440, y: 30, w: 20, h: 190 },   // parede central, segmento de cima
      { x: 440, y: 340, w: 20, h: 190 },  // parede central, segmento de baixo (deixa uma "porta" no meio)
      { x: 150, y: 420, w: 110, h: 24 },  // obstáculo solto
      { x: 640, y: 70, w: 26, h: 130 },   // obstáculo solto
    ],
    // vão entre os dois segmentos da parede central — onde a habilidade
    // "Barricar porta" spawna uma parede temporária
    door: { x: 440, y: 220, w: 20, h: 120 },
    // pontos onde objetivos podem nascer; main.js usa os N primeiros,
    // N = Game.CONFIG.survivorCount + 1
    objectiveSpots: [
      { x: 150, y: 150 },
      { x: 650, y: 460 },
      { x: 300, y: 480 },
      { x: 780, y: 130 },
      { x: 80, y: 480 },
    ],
  };

  function closestPointOnRect(px, py, rect){
    const cx = Math.max(rect.x, Math.min(px, rect.x + rect.w));
    const cy = Math.max(rect.y, Math.min(py, rect.y + rect.h));
    return { x: cx, y: cy };
  }

  function resolveCircleRect(pos, radius, rect){
    const closest = closestPointOnRect(pos.x, pos.y, rect);
    const dx = pos.x - closest.x;
    const dy = pos.y - closest.y;
    const distSq = dx * dx + dy * dy;
    if (distSq >= radius * radius) return pos;

    const dist = Math.sqrt(distSq);
    if (dist === 0){
      // centro caiu exatamente dentro do retângulo: empurra pro lado mais próximo
      const overlaps = [
        { d: pos.x - rect.x, x: rect.x - radius, y: pos.y },
        { d: (rect.x + rect.w) - pos.x, x: rect.x + rect.w + radius, y: pos.y },
        { d: pos.y - rect.y, x: pos.x, y: rect.y - radius },
        { d: (rect.y + rect.h) - pos.y, x: pos.x, y: rect.y + rect.h + radius },
      ];
      overlaps.sort((a, b) => a.d - b.d);
      return { x: overlaps[0].x, y: overlaps[0].y };
    }

    const push = (radius - dist) / dist;
    return { x: pos.x + dx * push, y: pos.y + dy * push };
  }

  // Empurra pos pra fora de todas as walls, permitindo deslizar ao longo
  // delas em vez de simplesmente travar o movimento.
  function resolvePosition(pos, radius, walls){
    let result = { x: pos.x, y: pos.y };
    for (const wall of walls){
      result = resolveCircleRect(result, radius, wall);
    }
    return result;
  }

  Game.MAP = MAP;
  Game.mapCollision = { resolvePosition };
})();
