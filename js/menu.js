window.Game = window.Game || {};

(function(){
  "use strict";

  // destrava o áudio no primeiro toque em qualquer lugar da página. No
  // modo online quem começa a partida às vezes é OUTRO jogador (mensagem
  // de rede), não um clique seu — sem isso o AudioContext ficava
  // 'suspended' pra sempre nesse caso e o jogo saía mudo (bug real
  // reportado pelo usuário, com ou sem fone).
  document.addEventListener('pointerdown', () => Game.Audio.init(), { once: true });

  const menu = document.getElementById('menu');
  const screens = {
    start: document.getElementById('menu-start'),
    join: document.getElementById('menu-join'),
    p2pChoice: document.getElementById('menu-p2p-choice'),
    lobby: document.getElementById('menu-lobby'),
    result: document.getElementById('menu-result'),
    settings: document.getElementById('menu-settings'),
  };

  function showScreen(name){
    Object.values(screens).forEach((el) => { el.style.display = 'none'; });
    screens[name].style.display = 'flex';
  }

  const nameInput = document.getElementById('menu-name');
  const abilitySelect = document.getElementById('menu-ability');
  const soloSurvivorBtn = document.getElementById('menu-solo-survivor');
  const soloKillerBtn = document.getElementById('menu-solo-killer');
  const lanBtn = document.getElementById('menu-lan');
  const p2pBtn = document.getElementById('menu-p2p');

  const joinHost = document.getElementById('join-host');
  const joinPort = document.getElementById('join-port');
  const joinPassword = document.getElementById('join-password');
  const joinError = document.getElementById('join-error');
  const joinConnectBtn = document.getElementById('join-connect');
  const joinBackBtn = document.getElementById('join-back');

  const p2pPassword = document.getElementById('p2p-password');
  const p2pHostBtn = document.getElementById('p2p-host');
  const p2pHostError = document.getElementById('p2p-host-error');
  const p2pCode = document.getElementById('p2p-code');
  const p2pJoinPassword = document.getElementById('p2p-join-password');
  const p2pJoinBtn = document.getElementById('p2p-join');
  const p2pJoinError = document.getElementById('p2p-join-error');
  const p2pBackBtn = document.getElementById('p2p-back');

  const lobbyRoomCode = document.getElementById('lobby-room-code');
  const lobbyRoomCodeText = document.getElementById('lobby-room-code-text');
  const lobbyRoomQr = document.getElementById('lobby-room-qr');
  const lobbyPlayers = document.getElementById('lobby-players');
  const lobbyBeKiller = document.getElementById('lobby-be-killer');
  const lobbyBeSurvivor = document.getElementById('lobby-be-survivor');
  const lobbyAbilityRow = document.getElementById('lobby-ability-row');
  const lobbyAbility = document.getElementById('lobby-ability');
  const lobbyError = document.getElementById('lobby-error');
  const lobbyStart = document.getElementById('lobby-start');

  const resultTitle = document.getElementById('result-title');
  const resultDetail = document.getElementById('result-detail');
  const resultAgain = document.getElementById('result-again');

  function playerName(){
    return (nameInput.value || '').trim().slice(0, 16) || 'Jogador';
  }

  // token persistido: permite ao servidor reconhecer o mesmo jogador
  // se a conexão cair no meio de uma partida e ele reconectar depois.
  function reconnectToken(){
    let token = localStorage.getItem('dbd_token');
    if (!token){
      token = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
      localStorage.setItem('dbd_token', token);
    }
    return token;
  }

  // ---------- configurações (volume + sensibilidade do joystick), persistidas ----------
  const settingsOpenBtn = document.getElementById('menu-settings-open');
  const settingsBackBtn = document.getElementById('settings-back');
  const settingsVolume = document.getElementById('settings-volume');
  const settingsJoystick = document.getElementById('settings-joystick');

  function loadSettings(){
    const volume = parseInt(localStorage.getItem('dbd_volume'), 10);
    const joystick = parseInt(localStorage.getItem('dbd_joystick'), 10);
    settingsVolume.value = isNaN(volume) ? 100 : volume;
    settingsJoystick.value = isNaN(joystick) ? 100 : joystick;
    applySettings();
  }
  function applySettings(){
    Game.Audio.setMasterVolume(parseInt(settingsVolume.value, 10) / 100);
    Game.Input.setJoystickSensitivity(parseInt(settingsJoystick.value, 10) / 100);
  }
  settingsVolume.addEventListener('input', () => {
    localStorage.setItem('dbd_volume', settingsVolume.value);
    applySettings();
  });
  settingsJoystick.addEventListener('input', () => {
    localStorage.setItem('dbd_joystick', settingsJoystick.value);
    applySettings();
  });
  settingsOpenBtn.addEventListener('click', () => showScreen('settings'));
  settingsBackBtn.addEventListener('click', () => showScreen('start'));
  loadSettings();

  const settingsTestSound = document.getElementById('settings-test-sound');
  if (settingsTestSound) settingsTestSound.addEventListener('click', () => Game.Audio.playTestSound());

  // som de clique em qualquer botão do menu — retorno de toque, já que
  // antes o menu inteiro era mudo (o teste de som tem o próprio som, não
  // precisa dobrar aqui)
  document.querySelectorAll('.menu-card button').forEach((btn) => {
    if (btn.id === 'settings-test-sound') return;
    btn.addEventListener('click', () => Game.Audio.playClick());
  });

  // ---------- progressão leve entre partidas (só contador local, sem perks) ----------
  const menuProgressEl = document.getElementById('menu-progress');
  const resultProgressEl = document.getElementById('result-progress');
  // survivorEscapes/survivorSacrifices: quebra do won/lost só pra quando o
  // papel local era Sobrevivente (won/played continuam contando os 2 papéis
  // juntos, como sempre foi) — spread com STATS_DEFAULTS cobre quem já tinha
  // dbd_stats salvo antes desses 2 campos existirem (senão viraria NaN).
  const STATS_DEFAULTS = { played: 0, won: 0, survivorEscapes: 0, survivorSacrifices: 0 };
  function readStats(){
    try {
      return { ...STATS_DEFAULTS, ...(JSON.parse(localStorage.getItem('dbd_stats')) || {}) };
    } catch { return { ...STATS_DEFAULTS }; }
  }
  function renderStats(){
    const stats = readStats();
    const text = `Partidas jogadas: ${stats.played} · Vitórias: ${stats.won} · `
      + `Fugas: ${stats.survivorEscapes} · Sacrifícios: ${stats.survivorSacrifices}`;
    menuProgressEl.textContent = text;
    return text;
  }
  // role: papel do jogador LOCAL nessa partida ('survivor'|'killer') — só
  // usado pra alimentar o contador de fugas/sacrifícios, que só faz sentido
  // pro lado Sobrevivente (o Assassino já tem won/played contando por ele)
  function recordMatchResult(won, role){
    const stats = readStats();
    stats.played += 1;
    if (won) stats.won += 1;
    if (role === 'survivor'){
      if (won) stats.survivorEscapes += 1;
      else stats.survivorSacrifices += 1;
    }
    localStorage.setItem('dbd_stats', JSON.stringify(stats));
    resultProgressEl.textContent = renderStats();
  }
  renderStats();

  soloSurvivorBtn.addEventListener('click', () => {
    menu.style.display = 'none';
    Game.startSolo(playerName(), abilitySelect.value);
  });

  soloKillerBtn.addEventListener('click', () => {
    menu.style.display = 'none';
    Game.startSoloAsKiller(playerName());
  });

  lanBtn.addEventListener('click', () => {
    joinError.textContent = '';
    showScreen('join');
  });

  p2pBtn.addEventListener('click', () => {
    p2pHostError.textContent = '';
    p2pJoinError.textContent = '';
    showScreen('p2pChoice');
  });

  joinBackBtn.addEventListener('click', () => showScreen('start'));
  p2pBackBtn.addEventListener('click', () => showScreen('start'));

  // ---------- estado compartilhado entre os 3 jeitos de conectar ----------
  let net = null;
  let localId = null;
  let lastLobby = null;
  let lastServerErrorAt = 0;
  let hostingRoomCode = null;

  function renderRoomCode(){
    if (!hostingRoomCode){
      lobbyRoomCode.style.display = 'none';
      return;
    }
    lobbyRoomCode.style.display = 'flex';
    lobbyRoomCodeText.textContent = 'Código da sala: ' + hostingRoomCode;
    if (typeof qrcode !== 'undefined'){
      try {
        const qr = qrcode(0, 'M');
        const url = location.origin + location.pathname + '?p2p=' + encodeURIComponent(hostingRoomCode);
        qr.addData(url);
        qr.make();
        lobbyRoomQr.src = qr.createDataURL(6, 4);
        lobbyRoomQr.style.display = 'block';
      } catch (err) {
        lobbyRoomQr.style.display = 'none';
      }
    }
  }

  function makeHandlers(errorTarget){
    return {
      onJoined(id){
        localId = id;
        errorTarget.textContent = '';
        showScreen('lobby');
        renderRoomCode();
      },
      onLobby(msg){
        lastLobby = msg;
        renderLobby(msg);
      },
      onServerError(message){
        lastServerErrorAt = Date.now();
        Game.Audio.playError();
        if (screens.lobby.style.display === 'flex') lobbyError.textContent = message;
        else errorTarget.textContent = message;
      },
      onError(message){
        Game.Audio.playError();
        errorTarget.textContent = message;
      },
      onClose(){
        if (Date.now() - lastServerErrorAt < 500) return;
        if (screens.result.style.display !== 'flex'){
          errorTarget.textContent = 'A conexão com a sala caiu.';
          hostingRoomCode = null;
          showScreen(errorTarget === p2pHostError || errorTarget === p2pJoinError ? 'p2pChoice' : 'join');
        }
      },
      onMatchStart(players, mapLayoutIndex){
        menu.style.display = 'none';
        Game.startOnline(net, localId, players, mapLayoutIndex);
      },
      onMatchResume(msg){
        menu.style.display = 'none';
        Game.resumeOnline(net, localId, msg.players, msg.mapLayoutIndex, msg.doneObjectives, msg.eliminatedIds);
      },
      onEvent(fromId, data){
        if (Game.onlineEventHandler) Game.onlineEventHandler(fromId, data);
      },
      onState(fromId, data){
        if (Game.onlineStateHandler) Game.onlineStateHandler(fromId, data);
      },
      onPlayerLeft(id){
        if (Game.onlinePlayerLeftHandler) Game.onlinePlayerLeftHandler(id);
      },
    };
  }

  // ---------- LAN (WebSocket, servidor num PC) ----------
  joinConnectBtn.addEventListener('click', () => {
    const hostIp = joinHost.value.trim();
    const port = parseInt(joinPort.value, 10) || 8787;
    const password = joinPassword.value;
    if (!hostIp){
      joinError.textContent = 'Digita o IP do host.';
      return;
    }
    joinError.textContent = 'Conectando...';
    hostingRoomCode = null;
    net = Game.Net.connect({ host: hostIp, port, password, name: playerName(), token: reconnectToken() }, makeHandlers(joinError));
  });

  // ---------- P2P (WebRTC, celular vira host) ----------
  p2pHostBtn.addEventListener('click', () => {
    p2pHostError.textContent = 'Criando sala...';
    net = Game.NetWebRTC.host({ password: p2pPassword.value, name: playerName(), token: reconnectToken() }, makeHandlers(p2pHostError));
    if (net) hostingRoomCode = net.roomCode;
  });

  // teclado de celular às vezes capitaliza a primeira letra sozinho — o
  // código sempre é "dbd-XXXXX" (prefixo minúsculo, sufixo maiúsculo), então
  // normaliza em vez de exigir que o usuário digite exatamente certo
  function normalizeRoomCode(raw){
    const trimmed = (raw || '').trim();
    const dash = trimmed.indexOf('-');
    if (dash === -1) return trimmed.toUpperCase();
    return trimmed.slice(0, dash).toLowerCase() + '-' + trimmed.slice(dash + 1).toUpperCase();
  }

  p2pJoinBtn.addEventListener('click', () => {
    const code = normalizeRoomCode(p2pCode.value);
    if (!code){
      p2pJoinError.textContent = 'Digita o código da sala.';
      return;
    }
    p2pJoinError.textContent = 'Conectando...';
    hostingRoomCode = null;
    net = Game.NetWebRTC.join({ code, password: p2pJoinPassword.value, name: playerName(), token: reconnectToken() }, makeHandlers(p2pJoinError));
  });

  // Se chegou aqui por um QR code (link com ?p2p=codigo), já abre direto
  // na tela de entrar com esse código preenchido — só falta a senha.
  (function prefillFromQr(){
    const code = new URLSearchParams(location.search).get('p2p');
    if (!code) return;
    p2pCode.value = code;
    showScreen('p2pChoice');
  })();

  // ---------- lobby (comum aos dois transportes online) ----------
  function renderLobby(msg){
    lobbyPlayers.innerHTML = '';
    msg.players.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'lobby-player' + (p.role ? ' role-' + p.role : '');
      const roleLabel = p.role === 'killer' ? 'Assassino' : (p.role === 'survivor' ? 'Sobrevivente' : 'sem papel');
      row.innerHTML = `<span>${escapeHtml(p.name)}${p.id === localId ? ' (você)' : ''}</span><span class="role-tag">${roleLabel}</span>`;
      lobbyPlayers.appendChild(row);
    });

    const me = msg.players.find((p) => p.id === localId);
    lobbyBeKiller.classList.toggle('active', !!me && me.role === 'killer');
    lobbyBeSurvivor.classList.toggle('active', !!me && me.role === 'survivor');
    lobbyAbilityRow.style.display = !!me && me.role === 'survivor' ? 'flex' : 'none';
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  lobbyBeKiller.addEventListener('click', () => {
    lobbyError.textContent = '';
    const me = lastLobby && lastLobby.players.find((p) => p.id === localId);
    net.chooseRole(me && me.role === 'killer' ? null : 'killer');
  });
  lobbyBeSurvivor.addEventListener('click', () => {
    lobbyError.textContent = '';
    const me = lastLobby && lastLobby.players.find((p) => p.id === localId);
    net.chooseRole(me && me.role === 'survivor' ? null : 'survivor', lobbyAbility.value);
  });
  lobbyAbility.addEventListener('change', () => {
    const me = lastLobby && lastLobby.players.find((p) => p.id === localId);
    if (me && me.role === 'survivor') net.chooseRole('survivor', lobbyAbility.value);
  });
  lobbyStart.addEventListener('click', () => {
    lobbyError.textContent = '';
    net.startMatch();
  });

  // ---------- tela de resultado (chamada pelo main.js ao fim da partida) ----------
  // onPlayAgain: no modo solo, função que reinicia uma partida nova direto;
  // no modo online, null — "jogar de novo" usa a mesma sala (net.rematch())
  // em vez de recarregar a página.
  let playAgainSolo = null;

  function showResult(won, detail, onPlayAgain, role){
    playAgainSolo = onPlayAgain || null;
    Game.hideMatchUi();
    menu.style.display = 'flex';
    showScreen('result');
    resultTitle.textContent = won ? 'Vitória!' : 'Derrota';
    resultTitle.className = won ? 'won' : 'lost';
    resultDetail.textContent = detail || '';
    recordMatchResult(won, role);
  }

  resultAgain.addEventListener('click', () => {
    Game.hideMatchUi();
    if (playAgainSolo){
      const again = playAgainSolo;
      playAgainSolo = null;
      menu.style.display = 'none';
      again();
      return;
    }
    if (net){
      lobbyError.textContent = '';
      net.rematch();
      showScreen('lobby');
      return;
    }
    window.location.reload();
  });

  Game.Menu = { showResult };
})();
