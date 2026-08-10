window.Game = window.Game || {};

(function(){
  "use strict";

  // Mapa V3: bem maior, com "salas" de verdade (estruturas fechadas com uma
  // porta cada) espalhadas por um campo aberto, em vez de só obstáculos
  // soltos — parecido com o jogo oficial que inspirou o projeto (prédios
  // isolados + área aberta pra correr entre eles). Continua sendo só
  // dados + colisão, sem referência a personagem/DOM (js/main.js que lê e
  // desenha) — mesma convenção de sempre.
  //
  // As paredes de cada sala são geradas a partir de retângulos (ver
  // `roomsToWalls` abaixo) em vez de escritas à mão feche-a-feche: bem
  // menos chance de errar a aritmética de onde cada parede começa/termina,
  // e cada porta já sai com o retângulo exato do vão, reaproveitado tanto
  // pra colisão (quando trancada vira uma parede temporária) quanto pra
  // saber quando um jogador está perto o bastante pra interagir com ela.
  const THICK = 36;   // espessura das paredes das salas
  const DOOR_SIZE = 96; // largura do vão da porta

  function edgeWithGaps(walls, doors, vertical, fixedCoord, start, end, gapPositions){
    const length = end - start;
    const gaps = gapPositions.map((p) => start + p * length).sort((a, b) => a - b);
    let cursor = start;
    gaps.forEach((g) => {
      const gapStart = g - DOOR_SIZE / 2, gapEnd = g + DOOR_SIZE / 2;
      if (gapStart > cursor){
        walls.push(vertical
          ? { x: fixedCoord, y: cursor, w: THICK, h: gapStart - cursor }
          : { x: cursor, y: fixedCoord, w: gapStart - cursor, h: THICK });
      }
      doors.push(vertical
        ? { x: fixedCoord, y: gapStart, w: THICK, h: DOOR_SIZE }
        : { x: gapStart, y: fixedCoord, w: DOOR_SIZE, h: THICK });
      cursor = gapEnd;
    });
    if (cursor < end){
      walls.push(vertical
        ? { x: fixedCoord, y: cursor, w: THICK, h: end - cursor }
        : { x: cursor, y: fixedCoord, w: end - cursor, h: THICK });
    }
  }

  // rooms: [{ x, y, w, h, doors: [{ side: 'top'|'bottom'|'left'|'right', at: 0..1 }] }]
  function roomsToWalls(rooms){
    const walls = [];
    const doors = [];
    rooms.forEach((room) => {
      const { x, y, w, h } = room;
      const bySide = { top: [], bottom: [], left: [], right: [] };
      room.doors.forEach((d) => bySide[d.side].push(d.at));
      edgeWithGaps(walls, doors, false, y, x, x + w, bySide.top);
      edgeWithGaps(walls, doors, false, y + h - THICK, x, x + w, bySide.bottom);
      edgeWithGaps(walls, doors, true, x, y, y + h, bySide.left);
      edgeWithGaps(walls, doors, true, x + w - THICK, y, y + h, bySide.right);
    });
    return { walls, doors };
  }

  // 6 salas de 480x360, em 2 fileiras de 3 — o "prédio" de cada sala é
  // fixo entre layouts, só o lado da porta (e uns obstáculos soltos no
  // campo aberto) muda, igual a convenção antiga de variar só as paredes.
  const ROOM_DEF = [
    { x: 280, y: 260, w: 480, h: 360 },   // sala 0 (topo-esquerda)
    { x: 1180, y: 260, w: 480, h: 360 },  // sala 1 (topo-centro)
    { x: 2080, y: 260, w: 480, h: 360 },  // sala 2 (topo-direita)
    { x: 280, y: 1140, w: 480, h: 360 },  // sala 3 (baixo-esquerda)
    { x: 1180, y: 1140, w: 480, h: 360 }, // sala 4 (baixo-centro)
    { x: 2080, y: 1140, w: 480, h: 360 }, // sala 5 (baixo-direita)
  ];

  const DOOR_SIDES_BY_LAYOUT = [
    ['right', 'bottom', 'left', 'top', 'right', 'top'],
    ['bottom', 'left', 'bottom', 'right', 'top', 'left'],
  ];

  const LOOSE_OBSTACLES_BY_LAYOUT = [
    [{ x: 900, y: 900, w: 200, h: 50 }, { x: 1700, y: 1650, w: 50, h: 200 }],
    [{ x: 1900, y: 900, w: 200, h: 50 }, { x: 700, y: 1650, w: 50, h: 200 }],
  ];

  function buildRoomLayout(doorSides, looseObstacles){
    const rooms = ROOM_DEF.map((r, i) => ({ ...r, doors: [{ side: doorSides[i], at: 0.5 }] }));
    const { walls, doors } = roomsToWalls(rooms);
    return { walls: walls.concat(looseObstacles), doors };
  }

  const MAP = {
    width: 3000,
    height: 2000,
    player: { x: 140, y: 140 },
    killer: { x: 1500, y: 1000 },
    // pontos de spawn pra até 4 sobreviventes no modo online (índice = ordem de entrada)
    survivorSpawns: [
      { x: 140, y: 140 },
      { x: 140, y: 1860 },
      { x: 2860, y: 140 },
      { x: 2860, y: 1860 },
    ],
    // 4 objetivos "arriscados" (dentro de uma sala, atrás de porta) + 4
    // "seguros" (campo aberto) — mesma tensão do jogo oficial: objetivo
    // dentro de prédio rende mais rápido de fazer sem ser visto, mas com
    // só uma porta de fuga se o Assassino arrombar
    objectiveSpots: [
      { x: 520, y: 440 },   // sala 0
      { x: 2320, y: 440 },  // sala 2
      { x: 520, y: 1320 },  // sala 3
      { x: 2320, y: 1320 }, // sala 5
      { x: 970, y: 440 },
      { x: 1900, y: 440 },
      { x: 970, y: 1320 },
      { x: 1900, y: 1320 },
    ],
    // 1 esconderijo (armário/mesa) por sala, num canto — ver js/hideout.js
    hideoutSpots: ROOM_DEF.map((r) => ({ x: r.x + 60, y: r.y + 60 })),
    // 2 portões de saída, em bordas opostas do mapa, longe de qualquer sala
    // — só podem ser abertos depois que os 5 geradores terminarem (ver js/gate.js)
    gateSpots: [
      { x: 1500, y: 100 },
      { x: 1500, y: 1900 },
    ],
    // ganchos: onde o Assassino pendura quem ele carrega (ver js/capture.js).
    // Espalhados pelo campo aberto entre as salas, longe o bastante de
    // qualquer sala pra nunca cair dentro de uma (checar contra ROOM_DEF
    // ao mudar isso: nenhum ponto pode cair num retângulo de sala).
    hookSpots: [
      { x: 970, y: 850 },
      { x: 1870, y: 850 },
      { x: 970, y: 1750 },
      { x: 1870, y: 1750 },
    ],
    // V3 do mapa: layouts com salas de verdade. Escolhido aleatoriamente no
    // início de cada partida (no modo online, quem inicia sorteia e manda
    // o índice pra todo mundo — ver matchStart em server.js/net-webrtc.js).
    // Cada layout expõe `walls` (colisão) e `doors` (retângulo do vão de
    // cada porta — ver js/door.js pro estado de trancada/arrombada).
    layouts: [
      buildRoomLayout(DOOR_SIDES_BY_LAYOUT[0], LOOSE_OBSTACLES_BY_LAYOUT[0]),
      buildRoomLayout(DOOR_SIDES_BY_LAYOUT[1], LOOSE_OBSTACLES_BY_LAYOUT[1]),
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
