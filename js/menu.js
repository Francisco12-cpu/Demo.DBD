window.Game = window.Game || {};

(function(){
  "use strict";

  const menu = document.getElementById('menu');
  const screens = {
    start: document.getElementById('menu-start'),
    join: document.getElementById('menu-join'),
    p2pChoice: document.getElementById('menu-p2p-choice'),
    lobby: document.getElementById('menu-lobby'),
    result: document.getElementById('menu-result'),
  };

  function showScreen(name){
    Object.values(screens).forEach((el) => { el.style.display = 'none'; });
    screens[name].style.display = 'flex';
  }

  const nameInput = document.getElementById('menu-name');
  const abilitySelect = document.getElementById('menu-ability');
  const soloBtn = document.getElementById('menu-solo');
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

  soloBtn.addEventListener('click', () => {
    menu.style.display = 'none';
    Game.startSolo(playerName(), abilitySelect.value);
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
        if (screens.lobby.style.display === 'flex') lobbyError.textContent = message;
        else errorTarget.textContent = message;
      },
      onError(message){
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
    net = Game.Net.connect({ host: hostIp, port, password, name: playerName() }, makeHandlers(joinError));
  });

  // ---------- P2P (WebRTC, celular vira host) ----------
  p2pHostBtn.addEventListener('click', () => {
    p2pHostError.textContent = 'Criando sala...';
    net = Game.NetWebRTC.host({ password: p2pPassword.value, name: playerName() }, makeHandlers(p2pHostError));
    if (net) hostingRoomCode = net.roomCode;
  });

  p2pJoinBtn.addEventListener('click', () => {
    const code = p2pCode.value.trim();
    if (!code){
      p2pJoinError.textContent = 'Digita o código da sala.';
      return;
    }
    p2pJoinError.textContent = 'Conectando...';
    hostingRoomCode = null;
    net = Game.NetWebRTC.join({ code, password: p2pJoinPassword.value, name: playerName() }, makeHandlers(p2pJoinError));
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

  function showResult(won, detail, onPlayAgain){
    playAgainSolo = onPlayAgain || null;
    Game.hideMatchUi();
    menu.style.display = 'flex';
    showScreen('result');
    resultTitle.textContent = won ? 'Vitória!' : 'Derrota';
    resultTitle.className = won ? 'won' : 'lost';
    resultDetail.textContent = detail || '';
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
