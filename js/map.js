window.Game = window.Game || {};

(function(){
  "use strict";

  // Mapa fixo V1. Puramente dados + colisão — sem referência a personagem
  // nem ao DOM, pra não travar uma futura migração pra mapas em tileset/
  // gerados (V2). x/y de walls é o canto superior-esquerdo (AABB).
  // Mapa 2x maior que a V1 original (mesma planta, coordenadas dobradas) —
  // com a câmera seguindo o personagem (ver js/main.js), não precisa mais
  // caber inteiro na tela, então dá pra ser bem maior sem ficar tudo
  // minúsculo no celular.
  const MAP = {
    width: 1800,
    height: 1120,
    player: { x: 260, y: 560 },
    killer: { x: 1640, y: 960 },
    // pontos de spawn pra até 4 sobreviventes no modo online (índice = ordem de entrada)
    survivorSpawns: [
      { x: 260, y: 560 },
      { x: 260, y: 920 },
      { x: 260, y: 200 },
      { x: 600, y: 200 },
    ],
    // vão entre os dois segmentos da parede central — onde a habilidade
    // "Barricar porta" spawna uma parede temporária. Igual nos dois
    // layouts (só os obstáculos soltos mudam), então não precisa de dado
    // por layout.
    door: { x: 880, y: 440, w: 40, h: 240 },
    // pontos onde objetivos podem nascer; main.js usa os N primeiros,
    // N = Game.CONFIG.survivorCount + 1
    objectiveSpots: [
      { x: 300, y: 300 },
      { x: 1300, y: 920 },
      { x: 600, y: 960 },
      { x: 1560, y: 260 },
      { x: 160, y: 960 },
    ],
    // V2 do mapa: mais de 1 layout de obstáculos. Escolhido aleatoriamente
    // no início de cada partida (no modo online, quem inicia sorteia e
    // manda o índice pra todo mundo, pra ficar igual pra todo mundo — ver
    // matchStart em server.js/net-webrtc.js).
    layouts: [
      {
        walls: [
          { x: 880, y: 60, w: 40, h: 380 },   // parede central, segmento de cima
          { x: 880, y: 680, w: 40, h: 380 },  // parede central, segmento de baixo
          { x: 300, y: 840, w: 220, h: 48 },  // obstáculo solto
          { x: 1280, y: 140, w: 52, h: 260 }, // obstáculo solto
        ],
      },
      {
        walls: [
          { x: 880, y: 60, w: 40, h: 380 },
          { x: 880, y: 680, w: 40, h: 380 },
          { x: 1280, y: 840, w: 220, h: 48 }, // mesmos obstáculos soltos, espelhados
          { x: 468, y: 140, w: 52, h: 260 },
        ],
      },
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
