window.Game = window.Game || {};

// Config central de balanceamento (equivalente às @export do Godot).
// Nunca duplicar esses valores espalhados pelo código — sempre ler daqui.
Game.CONFIG = {
  // O Sobrevivente não ataca ninguém (só foge/usa habilidade) — attackXxx
  // só existe pro Assassino, cujo "ataque" inicia a captura. Um único
  // objeto de personagem por tipo continua valendo (nenhuma duplicação de
  // lógica), só que o Sobrevivente simplesmente nunca chama tryAttack().
  characters: {
    survivor: {
      speed: 180,
      color: '--survivor',
      label: 'SOBREVIVENTE',
    },
    killer: {
      speed: 205, // era 220 (+22%); +14% sobre o Sobrevivente agora, proporção mais perto do jogo original
      color: '--killer',
      label: 'ASSASSINO',
      attackCooldown: 600, // ms
      attackDuration: 350, // ms
      attackRange: 55,     // px
      // o golpe não sai mais do centro do corpo — sai de um ponto na
      // FRENTE dele, espelhado conforme o lado que ele está virado (pedido
      // do usuário: "colisão na frente dele, adaptada pro lado")
      attackForwardOffset: 16, // px
    },
  },
  playerRadius: 28, // raio de colisão do personagem (metade do sprite 64px, sprite pixel art 32px em escala 2x)
  killerVisionRange: 240, // px — modo online: distância normal que o Assassino enxerga um Sobrevivente sem usar Sentido
  heartbeatRange: 340, // px — modo online/solo: distância máxima em que o Sobrevivente ouve o batimento cardíaco do Assassino (funciona mesmo sem ele estar visível)
  // raio de audição pros SFX ambiente de porta/pallet feitos por OUTRO
  // jogador/IA longe (trancar/arrombar porta, derrubar/quebrar pallet) —
  // sem isso, esses sons tocariam pra qualquer jogador não importa a
  // distância, o mesmo problema que o sistema de ruído (Game.CONFIG.noise)
  // já corrigiu pros alertas de verdade. Ações do PRÓPRIO jogador sempre
  // tocam (ele já precisa estar perto pra interagir, a mecânica em si já
  // garante isso). Portão abrindo/Sobrevivente escapando ficam de fora
  // desse raio de propósito — são poucos por partida e sinalizam uma
  // virada de jogo pra todo mundo, não um som ambiente rotineiro.
  sfxRadius: 650,
  visionRadius: 150, // px (mundo) — raio do "spotlight" ao redor do próprio personagem; na tela vira visionRadius*zoom, então precisa ser bem menor que o alcance de câmera pra sobrar área escura

  // spritesheets em pixel art de verdade (assets/killer-sheet.png,
  // assets/survivor-sheet.png — fornecidas pelo usuário, licença de uso
  // livre) — substituem a técnica antiga de mask-image + cor sólida.
  // frameSize/cols/rows descrevem a grade da folha; scale é o fator de
  // ampliação em tela (2x = 32px vira 64px, nítido e sem borrão, sempre
  // inteiro por causa do image-rendering:pixelated). Cada animação tem sua
  // própria linha (row, 0-indexed de cima pra baixo), quantidade de frames
  // realmente usados naquela linha, velocidade (fps) e se repete (loop).
  sprites: {
    killer: {
      sheet: 'assets/killer-sheet.png',
      frameSize: 32, cols: 8, rows: 9, scale: 2,
      animations: {
        idle:   { row: 0, frames: 2, fps: 2,  loop: true },
        run:    { row: 3, frames: 8, fps: 12, loop: true },
        attack: { row: 8, frames: 8, fps: 22, loop: false },
        // ainda não ligadas a nenhum sistema de jogo — reservadas pra
        // quando a habilidade de invisibilidade e a "cutscene" de derrota
        // existirem (ver README → Planos futuros)
        vanish: { row: 6, frames: 4, fps: 8,  loop: false },
        fall:   { row: 7, frames: 8, fps: 10, loop: false },
      },
    },
    survivor: {
      sheet: 'assets/survivor-sheet.png',
      frameSize: 32, cols: 10, rows: 11, scale: 2,
      animations: {
        idle:   { row: 0, frames: 1, fps: 1,  loop: true },
        run:    { row: 0, frames: 6, fps: 8,  loop: true },
        // usada só enquanto a habilidade Sprint está ativa (mais rápida —
        // pedido do usuário: "usa o r1 só que muito muito rápido")
        sprint: { row: 1, frames: 8, fps: 20, loop: true },
        // derrubado/carregado/pendurado (js/capture.js) — mesma pose em loop
        downed: { row: 6, frames: 10, fps: 8, loop: true },
        // reservada pro efeito de dano com sprite de verdade em vez do
        // filtro CSS atual (ver README → Planos futuros)
        hit:    { row: 7, frames: 4, fps: 14, loop: false },
      },
    },
  },

  // matiz (graus, hue-rotate) de cada "vaga" de Sobrevivente na partida
  // (índice = ordem de entrada/spawn) — a arte já vem colorida (não é mais
  // uma máscara), então diferenciar os 4 é um filtro de cor por cima, não
  // mais uma cor sólida. 0 = cor original da arte.
  survivorHues: [0, 70, 160, 250],

  // 1 jogador local no modo solo (a IA é o Assassino)
  survivorCount: 1,
  // geradores fixos em 5, igual ao jogo original — não escala mais com o
  // número de Sobreviventes (era sobreviventes+1); MAP.objectiveSpots tem
  // 8 pontos disponíveis, os 5 primeiros são usados
  generatorCount: 5,
  objective: {
    radius: 70,   // px — distância máxima do centro do objetivo pra progredir
    duration: 35, // segundos parado por perto pra completar 0% -> 100% (era 4 — partida durava segundos)
    // cooperação (só modo online, vários Sobreviventes no mesmo gerador):
    // cada ajudante extra além de quem está preenchendo acelera o progresso
    // nessa fração — com o máximo de 4 Sobreviventes por partida, o teto
    // natural é 1 + 3*0.5 = 2.5x (3 ajudantes), sem precisar de clamp extra
    cooperationBonusPerHelper: 0.5,
  },

  // skill check circular (estilo DBD): dispara de vez em quando enquanto o
  // objetivo enche; jogador aperta o botão de ataque/interação na hora
  // certa. Reaproveita o mesmo botão de ataque — não tem tecla extra.
  skillCheck: {
    minInterval: 2.5,      // segundos mínimos entre skill checks
    maxInterval: 5,        // segundos máximos entre skill checks
    // 32deg a 220deg/s dava uma janela de reação de ~145ms — quase
    // impossível de acertar de primeira, principalmente no toque (o dedo
    // ainda precisa alcançar o botão). Aumentado pra ~270ms, ainda exige
    // atenção mas dá pra reagir de verdade.
    zoneWidthDeg: 46,       // tamanho da zona de acerto no nível 0 (primeiro skill check do gerador)
    speedDegPerSec: 170,    // velocidade do ponteiro no nível 0
    successBonus: 0.18,     // progresso ganho ao acertar

    // dificuldade progressiva: cada ACERTO no mesmo gerador deixa o próximo
    // skill check dele um pouco mais rápido/apertado (fica "mais difícil
    // até conseguir"). Errar não muda a dificuldade nem tira progresso — só
    // obriga repetir aquele mesmo skill check (perde o tempo até ele
    // aparecer nesse nível de novo). Os limites (min/max) evitam que vire
    // impossível de acertar depois de muitos geradores reparados.
    zoneShrinkPerHit: 3,     // graus a menos na zona por acerto
    speedGainPerHit: 14,     // graus/s a mais no ponteiro por acerto
    minZoneWidthDeg: 22,     // nunca fica menor que isso
    maxSpeedDegPerSec: 320,  // nunca fica mais rápido que isso
  },

  // captura (js/capture.js) — igual ao jogo original: o 2º golpe DERRUBA
  // (não captura na hora). O Assassino precisa carregar até um gancho
  // (`MAP.hookSpots`) e pendurar; só aí começa a luta de verdade (struggle
  // bar, apertando repetido antes do tempo acabar). Outro Sobrevivente
  // pode resgatar quem tá pendurado, ou a própria pessoa pode se soltar do
  // carrego se apertar rápido o bastante antes de chegar no gancho.
  capture: {
    // fase pendurado no gancho
    duration: 6,       // segundos pendurado antes de ser sacrificado (eliminado)
    pulseGain: 0.12,    // progresso ganho por aperto, tentando se soltar
    decayPerSec: 0.05,  // progresso perdido por segundo (não dá pra só apertar uma vez e esperar)
    immunityAfterEscape: 1.5, // segundos livre de ser derrubado de novo depois de se soltar/ser resgatado (senão o Assassino recaptura na hora, colado)

    // fase derrubado -> carregado -> gancho
    pickUpRange: 55,          // px — o quão perto o Assassino precisa estar de quem caiu pra pegar
    carrySpeedMultiplier: 0.72, // Assassino anda mais devagar carregando alguém (janela de perseguição/resgate)
    wiggleGoal: 5,             // apertos necessários pra se soltar do carrego antes de chegar no gancho
    hookRange: 70,             // px — o quão perto de um gancho o Assassino precisa estar pra pendurar
    rescueRange: 55,           // px — o quão perto um Sobrevivente aliado precisa estar pra resgatar quem tá pendurado
  },

  maxSurvivors: 4, // limite de sobreviventes por partida (modo online)

  // sistema de vida (js/health.js): 1º golpe do Assassino machuca (fica
  // mais lento, sangrando, dá pra curar sozinho parado); só o 2º golpe
  // derruba de vez (aí sim entra a barra de struggle de js/capture.js) —
  // igual ao jogo original em vez de cair capturado no primeiro toque
  health: {
    injuredSpeedMultiplier: 0.85,
    healDuration: 10, // segundos parado pra curar sozinho (ferido -> saudável)
    healDecayRate: 0.4, // progresso de cura perdido por segundo ao sair do lugar antes de terminar
  },

  // portão de saída (js/gate.js): só pode ser aberto depois que todos os
  // geradores forem concluídos. Sobrevivente canaliza parado perto por
  // `openDuration`; uma vez aberto, fica aberto pro resto da partida —
  // qualquer Sobrevivente que chegar perto depois disso escapa na hora
  gate: {
    radius: 130,
    openDuration: 15,
    progressDecayRate: 0.3, // progresso perdido por segundo ao sair do alcance antes de terminar
  },

  // pallets (js/pallet.js): obstáculo solto que o Sobrevivente derruba na
  // hora (botão de ação, não canalizado) — em pé não bloqueia nada; caído,
  // vira parede de verdade E atordoa o Assassino se ele estava perto o
  // bastante no instante da queda ("pallet stun" clássico). O Assassino
  // quebra de vez canalizando perto, mais devagar que arrombar porta —
  // o loop de perseguição só vale a pena se custar tempo de verdade.
  pallet: {
    // o pallet mede 110x36 (ver PALLET_SPOTS_BY_LAYOUT em js/map.js) — uma
    // vez derrubado ele vira colisão de verdade, então esse raio PRECISA
    // ser maior que metade do lado comprido (55) + playerRadius (28) =
    // ~83px, senão o Assassino fica travado pela própria colisão do pallet
    // antes de chegar perto o bastante pra quebrar (bug real, achado
    // testando: com radius menor que isso, era geometricamente impossível
    // encostar perto o suficiente vindo do lado comprido)
    radius: 100,          // px — alcance pra derrubar (Sobrevivente) e canalizar quebra (Assassino)
    stunRadius: 90,       // px — Assassino nesse raio do pallet NO INSTANTE em que ele cai fica atordoado
    stunDuration: 2.5,    // segundos travado (sem mover, sem atacar) depois de atordoado
    breakDuration: 3,     // segundos canalizando perto pra destruir de vez — mais lento que porta (2s) de propósito
    breakDecayRate: 0.6,  // progresso de quebra perdido por segundo ao sair do alcance antes de terminar
  },

  // janelas (js/window.js): vão que NUNCA bloqueia ninguém (ao contrário de
  // porta/pallet) — só muda a velocidade de quem atravessa. Sobrevivente
  // pula rápido, Assassino escala devagar — essa assimetria é o que cria o
  // loop de perseguição ao redor de uma sala com porta de um lado e janela
  // do outro.
  window: {
    radius: 60,                    // px — raio ao redor do centro da janela onde a velocidade muda
    survivorSpeedMultiplier: 1.05, // Sobrevivente atravessa quase sem perder velocidade
    killerSpeedMultiplier: 0.55,   // Assassino perde bastante velocidade escalando
  },

  // portas das salas (js/door.js): Sobrevivente tranca ficando perto (sem o
  // Assassino por perto) por `lockDuration`; o Assassino sempre consegue
  // arrombar ficando perto por `breakDuration` — mais rápido que trancar de
  // propósito, pra nunca virar um bloqueio permanente
  door: {
    lockDuration: 3,
    breakDuration: 2,
    radius: 80,
    progressDecayRate: 0.6, // progresso de trancar/arrombar perdido por segundo ao sair do alcance antes de terminar
  },

  // raio de audição de ruído (px) — pra onde o Assassino (real ou IA) só
  // reage se estiver dentro dessa distância do barulho. Generaliza um
  // padrão que antes era 3 mecanismos quase idênticos copiados (aviso de
  // esconderijo, skill check errado, distrair) sem nenhum raio de verdade
  // (todo mundo recebia o evento, o Assassino sempre ouvia não importa a
  // distância) — ver js/main.js, emitNoise()/alertKillerAI().
  noise: {
    hideoutRadius: 420,
    skillCheckFailRadius: 500,
    distractRadius: Infinity, // isca de propósito, sem limite de distância
    palletDropRadius: 260,
    palletBreakRadius: 420,
    sprintRadius: 160,        // sprint é mais rápido, mas arrisca ser ouvido de perto
  },

  // esconderijos (armário/mesa, js/hideout.js): Sobrevivente entra parado
  // perto de um ponto de esconderijo; some da visão do Assassino igual
  // Camuflagem, mas sem gastar habilidade — em troca, não pode se mexer
  // enquanto escondido e é obrigado a sair sozinho depois de `maxDuration`
  hideout: {
    radius: 40,        // precisa estar bem perto pra entrar/sair
    maxDuration: 14,   // segundos — depois disso sai forçado
    // ficar parado escondido tempo demais faz barulho: depois de
    // `noiseAfter` segundos escondido, o jogo revela a posição pro
    // Assassino (som + marcador no mapa) a cada `noiseInterval` segundos,
    // até sair (por vontade ou forçado em maxDuration). Ajuste esses dois
    // números pra deixar mais fácil ou mais arriscado ficar escondido.
    noiseAfter: 6,      // segundos escondido até começar a fazer barulho
    noiseInterval: 3,   // segundos entre cada barulho, depois de noiseAfter
    // sem isso, dava pra sair e entrar de novo instantaneamente pra
    // resetar hiddenFor e nunca fazer barulho (camping infinito) — exploit
    // real, achado numa auditoria de código, não um bug reportado por
    // jogador. Bloqueia reentrada por esse tempo depois de QUALQUER saída
    // (voluntária ou forçada), perto do valor de noiseAfter de propósito:
    // só vale a pena sair achando que vai poder voltar rápido se realmente
    // precisar (ex: skill check), não como tática de resetar o timer.
    reentryCooldown: 5,
  },

  // Sobrevivente controlado pela IA (modo solo, jogando de Assassino) —
  // foge do Assassino, repara geradores sozinho e tenta escapar pelo
  // portão. Espelha `characters.killer` (IA que persegue no modo solo
  // normal), só que fugindo em vez de perseguindo.
  survivorAI: {
    speedMultiplier: 0.96,  // um pouco mais devagar que o Assassino, senão nunca dá pra alcançar
    fleeRange: 260,         // px — a essa distância do Assassino, larga o gerador e foge
    // "reação" ao skill check: chance por segundo de tentar apertar
    // enquanto ele está ativo (não é acerto garantido — ainda depende de
    // estar no ângulo certo, igual ao jogador)
    reactionChancePerSecond: 2.2,
    struggleInterval: 0.6,  // segundos entre cada "puxão" de luta quando capturado
  },

  // ---------- habilidades (passo 7) ----------
  // Assassino tem sempre as duas; Sobrevivente escolhe 2 das 4 antes de
  // entrar (nunca repetidas — ver linkAbilitySelects em menu.js). Todas
  // seguem o mesmo objeto { duration, cooldown, ... } lido por
  // js/ability.js — nunca hardcoded fora daqui.
  abilities: {
    killerSense: {
      label: 'Sentido',
      duration: 4,     // segundos revelando todos os Sobreviventes através das paredes
      cooldown: 18,
    },
    killerDash: {
      label: 'Investida',
      duration: 1.2,   // segundos de velocidade aumentada
      cooldown: 10,
      speedMultiplier: 2.2,
    },
    // 3ª habilidade do Assassino (slot 3/tecla R) — planta uma armadilha no
    // chão que fica armada até algum Sobrevivente passar perto (sem
    // expiração automática por tempo, só 1 ativa por vez: decisão
    // consciente pra simplificar, o cooldown já limita o ritmo de reposição
    // igual a um pallet quebrado). `duration` aqui não é "efeito ativo no
    // Assassino" como nas outras habilidades — é reaproveitado por
    // js/main.js como "armadilha ainda armada, sem contar cooldown" até
    // disparar ou o Assassino plantar de novo.
    killerTrap: {
      label: 'Armadilha',
      duration: 30,          // segundos armada no chão antes de poder plantar outra (se ninguém pisar)
      cooldown: 12,           // segundos de cooldown depois que ela dispara (ou expira)
      triggerRadius: 26,      // px — distância do Sobrevivente pra fisgar
      snareDuration: 3,       // segundos preso/lento depois de pisar
      snareSpeedMultiplier: 0.32,
    },
    // outra opção pro mesmo slot 3 (escolha 1-de-2 no lobby/menu solo,
    // igual ao Sobrevivente escolhe 2-de-4) — some da bússola/batimento/
    // vinheta de perigo do Sobrevivente, mas continua visível a olho nu
    // (não é invisibilidade de verdade, só remove o "aviso à distância").
    // Só tem efeito real no modo online — no solo-como-Assassino a IA
    // Sobrevivente sempre sabe a posição exata dele por outros meios
    // (mesma limitação já documentada da Camuflagem no sentido contrário).
    killerInvisibility: {
      label: 'Invisibilidade',
      duration: 10,
      cooldown: 20,
    },
    survivor: {
      sprint: {
        label: 'Sprint',
        duration: 3,
        cooldown: 12,
        speedMultiplier: 1.6,
      },
      camouflage: {
        label: 'Camuflagem',
        duration: 6,     // segundos invisível pro Sentido do Assassino
        cooldown: 16,
      },
      barricade: {
        label: 'Trancar porta',
        duration: 8,     // segundos que a porta fica trancada instantaneamente (sem canalizar)
        cooldown: 0,
        maxUses: 2,      // usos limitados por partida, não infinito
        radius: 90,       // precisa estar perto de alguma porta (a mais próxima) pra usar
      },
      distract: {
        label: 'Distrair',
        duration: 5,     // segundos que o "ruído" falso dura
        cooldown: 14,
      },
    },
  },
};
