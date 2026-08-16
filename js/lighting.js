window.Game = window.Game || {};

// Câmera + iluminação por linha de visão — extraído de main.js porque não
// tem nenhuma dependência de qual modo de jogo (solo/solo-assassino/online)
// está rodando, só do personagem local e das paredes que bloqueiam visão
// naquele instante. Segue o mesmo padrão de fábrica do resto do projeto
// (Game.createX retorna {state, ...funções}), mesmo não sendo uma entidade
// de jogo — é a câmera/luz da partida atual.
(function(){
  "use strict";

  // Em vez de encolher o mapa inteiro pra caber na tela (ficava minúsculo
  // no celular), a câmera segue o personagem local com um zoom fixo — o
  // mapa é maior que a tela de propósito, só uma janela ao redor do
  // personagem fica visível (dá pra sobrar um "spotlight" de #lighting
  // por cima, ver update()).
  //
  // "Aliasing" nas texturas de chão/parede (achado 2026-08-16, relatado
  // pelo Francisco depois do BUG-002/BUG-003): os tiles novos (16px de
  // base — ver Game.CONFIG.tiles) são finos e repetem, então qualquer
  // desalinhamento de sub-pixel entre eles vira um padrão de moiré bem
  // visível (antes, com cor sólida, isso não existia porque não tinha
  // nenhuma borda de tile pra desalinhar). 1.3 e 1.7 não são múltiplos
  // exatos de 1/16 — 16×1.3=20.8px, uma fração de pixel por tile, que o
  // navegador tem que arredondar/suavizar tile a tile. Ajustados pro
  // múltiplo de 1/16 mais próximo (16×1.3125=21px, 16×1.6875=27px,
  // exatos) — mudança visual imperceptível no zoom em si, mas todo tile
  // de 16/32/48/64px (todos múltiplos de 16) passa a cair em pixel
  // inteiro. Ver também pixel-snap do offset da câmera em update()
  // abaixo — os dois juntos são as "2 formas mais fáceis" de resolver.
  const CAMERA_ZOOM_DESKTOP = 1.3125;
  const CAMERA_ZOOM_MOBILE = 1.6875;

  // Polígono de visibilidade calculado por raycasting em espaço de tela:
  // um raio pra cada canto de parede (± uma fração de grau, pra pegar a
  // sombra "colada" na quina) mais um leque de raios uniformes pra manter a
  // borda arredondada onde não tem parede nenhuma por perto. Cada raio para
  // na primeira parede que encontrar (ou no raio máximo de visão).
  function wallSegmentsScreen(walls, offsetX, offsetY, zoom){
    const segs = [];
    walls.forEach((w) => {
      const x1 = offsetX + w.x * zoom, y1 = offsetY + w.y * zoom;
      const x2 = offsetX + (w.x + w.w) * zoom, y2 = offsetY + (w.y + w.h) * zoom;
      segs.push({ x1, y1, x2, y2: y1 });
      segs.push({ x1: x2, y1, x2, y2 });
      segs.push({ x1: x2, y1: y2, x2: x1, y2 });
      segs.push({ x1, y1: y2, x2: x1, y2: y1 });
    });
    return segs;
  }

  function raySegmentT(ox, oy, dx, dy, seg){
    const sx = seg.x2 - seg.x1, sy = seg.y2 - seg.y1;
    const denom = dx * sy - dy * sx;
    if (Math.abs(denom) < 1e-10) return null;
    const t = ((seg.x1 - ox) * sy - (seg.y1 - oy) * sx) / denom;
    const u = ((seg.x1 - ox) * dy - (seg.y1 - oy) * dx) / denom;
    if (t >= 0 && u >= 0 && u <= 1) return t;
    return null;
  }

  function visibilityPolygon(originX, originY, segments, maxRadius){
    const EPS = 0.00005;
    const angles = new Set();
    const RAYS = 60;
    for (let i = 0; i < RAYS; i++) angles.add((i / RAYS) * Math.PI * 2);
    segments.forEach((seg) => {
      [[seg.x1, seg.y1], [seg.x2, seg.y2]].forEach(([px, py]) => {
        const a = Math.atan2(py - originY, px - originX);
        angles.add(a - EPS); angles.add(a); angles.add(a + EPS);
      });
    });

    const points = [...angles].map((angle) => {
      const dx = Math.cos(angle), dy = Math.sin(angle);
      let minT = maxRadius;
      segments.forEach((seg) => {
        const t = raySegmentT(originX, originY, dx, dy, seg);
        if (t !== null && t < minT) minT = t;
      });
      return { x: originX + dx * minT, y: originY + dy * minT, angle };
    });
    points.sort((a, b) => a.angle - b.angle);
    return points;
  }

  // arena: elemento que recebe o transform de câmera (translate+scale);
  // lightingEl: canvas do spotlight de escuridão por cima de tudo
  function createLighting(arena, lightingEl){
    let canvasW = 0, canvasH = 0;
    const ctx = lightingEl.getContext ? lightingEl.getContext('2d') : null;

    function currentZoom(){
      return Game.Input.isTouchDevice ? CAMERA_ZOOM_MOBILE : CAMERA_ZOOM_DESKTOP;
    }

    // visionBlockingWalls: paredes que bloqueiam luz NESTE instante (portas
    // trancadas contam, pallet derrubado não — decidido por quem chama,
    // porque isso depende do estado do mundo daquela partida). lightSources:
    // focos estáticos (tochas, BUG-002/BUG-003) — [{x,y,radius}], mundo.
    function drawLighting(followWorldPos, followScreenX, followScreenY, offsetX, offsetY, zoom, revealAll, visionBlockingWalls, lightSources){
      if (!ctx) return; // navegador sem canvas: fica sem o efeito, sem quebrar o jogo
      const w = window.innerWidth, h = window.innerHeight;
      if (w !== canvasW || h !== canvasH){
        lightingEl.width = w; lightingEl.height = h;
        canvasW = w; canvasH = h;
      }
      // Sentido ativo: a escuridão em si precisa sumir, senão o Sobrevivente
      // continua "revelado através da parede" só na lógica do jogo (ver
      // updateKillerVision em main.js), mas visualmente pintado de preto por
      // cima — exatamente o bug relatado ("aperto Sentido mas não vejo nada
      // mudar")
      if (revealAll){
        ctx.clearRect(0, 0, w, h);
        return;
      }
      const zoomPx = Game.CONFIG.visionRadius * zoom;
      const maxRadius = zoomPx + 220;

      // otimização: só considera paredes que realmente podem tocar o raio
      // máximo de visão — evita gastar tempo com paredes do outro lado do
      // mapa (importante com mapas grandes/muitas salas) e deixa a
      // iluminação mais leve em celulares fracos
      const maxRadiusWorld = maxRadius / zoom;
      const nearbyWalls = visionBlockingWalls.filter((wl) => {
        const cx = Math.max(wl.x, Math.min(followWorldPos.x, wl.x + wl.w));
        const cy = Math.max(wl.y, Math.min(followWorldPos.y, wl.y + wl.h));
        return Math.hypot(followWorldPos.x - cx, followWorldPos.y - cy) <= maxRadiusWorld;
      });

      const segs = wallSegmentsScreen(nearbyWalls, offsetX, offsetY, zoom);
      const poly = visibilityPolygon(followScreenX, followScreenY, segs, maxRadius);

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(4,3,6,0.98)';
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.beginPath();
      poly.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.closePath();
      ctx.clip();

      ctx.globalCompositeOperation = 'destination-out';

      // BUG-002/BUG-003 (BUGS.md) — causa raiz real da "parede preta"
      // relatada: antes disso, só existia o gradiente radial abaixo,
      // centrado no jogador. Por definição de raycasting, uma parede bem
      // na FRENTE do jogador sempre cai na BORDA do polígono de visão (é o
      // próprio obstáculo que faz o raio parar ali) — exatamente onde
      // aquele gradiente é mais fraco (perto de 0% de apagamento). Então a
      // parede que você está literalmente encostado nela — o caso mais
      // óbvio de "deveria estar bem clara" — ficava quase 100% coberta
      // pela escuridão de base (rgba(4,3,6,0.98), quase preto puro).
      // Esse preenchimento plano (mesma cor, alpha fixo) garante um piso
      // mínimo de visibilidade em TUDO dentro do polígono, não importa a
      // distância — o gradiente do jogador (logo abaixo) continua
      // reforçando o centro por cima disso.
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(0, 0, w, h);

      const grad = ctx.createRadialGradient(followScreenX, followScreenY, 0, followScreenX, followScreenY, zoomPx + 60);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(Math.min(1, zoomPx / (zoomPx + 60)), 'rgba(255,255,255,0.9)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // focos de luz estáticos (tochas, BUG-002/DD-05) — mesma ideia do
      // gradiente do jogador acima, centrado em cada tocha perto o
      // bastante pra importar. Continua dentro do MESMO clip do polígono
      // de visão do jogador, então uma tocha do outro lado de uma parede
      // não vaza luz pro cômodo escondido atrás dela (simplificação
      // consciente — um raycasting próprio por tocha, todo frame, seria
      // caro demais pro ganho; a tocha só reforça o que já é potencialmente
      // visível, não revela salas inteiras escondidas).
      (lightSources || []).forEach((light) => {
        const lx = offsetX + light.x * zoom;
        const ly = offsetY + light.y * zoom;
        const lr = light.radius * zoom;
        if (Math.hypot(lx - followScreenX, ly - followScreenY) > maxRadius + lr) return; // longe demais pra aparecer, nem desenha
        const lightGrad = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
        lightGrad.addColorStop(0, 'rgba(255,255,255,0.85)');
        lightGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = lightGrad;
        ctx.fillRect(0, 0, w, h);
      });

      // reforço de contorno nas paredes perto: a queda de luz do gradiente
      // deixa a face da parede fraca demais bem na borda da visão, fazendo
      // ela "sumir" junto com o cômodo escondido atrás — mesmo estando
      // dentro do polígono visível. Isso aqui só reforça o traço da própria
      // parede; como ainda está dentro do clip do polígono, o que sobrar do
      // traço do lado de fora (atrás da parede, fora de visão) continua
      // cortado — não revela o cômodo escondido, só deixa a parede em si
      // legível.
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      segs.forEach((seg) => {
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
        ctx.stroke();
      });

      ctx.restore();
    }

    // followPos: posição de mundo do personagem local a seguir; revealAll:
    // true só quando o Assassino local está com Sentido ativo no modo
    // online (some com a escuridão por completo enquanto durar); visionBlockingWalls:
    // lista de paredes (incluindo portas trancadas) que bloqueiam luz agora;
    // lightSources: focos estáticos (tochas) — [{x,y,radius}], opcional
    function update(followPos, revealAll, visionBlockingWalls, lightSources){
      const MAP = Game.MAP;
      const zoom = currentZoom();
      const viewW = window.innerWidth;
      const viewH = window.innerHeight;
      const halfW = viewW / zoom / 2;
      const halfH = viewH / zoom / 2;

      const camX = MAP.width > halfW * 2
        ? Math.max(halfW, Math.min(MAP.width - halfW, followPos.x))
        : MAP.width / 2;
      const camY = MAP.height > halfH * 2
        ? Math.max(halfH, Math.min(MAP.height - halfH, followPos.y))
        : MAP.height / 2;

      // pixel-snap: câmera segue a posição CONTÍNUA do jogador (com casas
      // decimais), então sem arredondar aqui o translate muda por uma
      // fração de pixel a cada frame — em combinação com as texturas que
      // repetem (chão/parede, ver BUG-003), isso lê como um tremor/
      // aliasing constante enquanto anda. Arredondar pra pixel inteiro
      // deixa a câmera "grudada" na grade de pixel do tile, só se move em
      // saltos de 1px (imperceptível, o jogo já roda em 60fps).
      const offsetX = Math.round(viewW / 2 - camX * zoom);
      const offsetY = Math.round(viewH / 2 - camY * zoom);
      arena.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`;

      const screenX = offsetX + followPos.x * zoom;
      const screenY = offsetY + followPos.y * zoom;
      drawLighting(followPos, screenX, screenY, offsetX, offsetY, zoom, revealAll, visionBlockingWalls || [], lightSources || []);
    }

    return { update, currentZoom };
  }

  Game.createLighting = createLighting;
})();
