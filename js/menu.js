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

  function makeHandlers(errorTarget){
    return {
      onJoined(id){
        localId = id;
        errorTarget.textContent = '';
        showScreen('lobby');
        lobbyRoomCode.style.display = hostingRoomCode ? 'block' : 'none';
        if (hostingRoomCode) lobbyRoomCode.textContent = 'Código da sala: ' + hostingRoomCode;
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
      onMatchStart(players){
        menu.style.display = 'none';
        Game.startOnline(net, localId, players);
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
  function showResult(won, detail){
    menu.style.display = 'flex';
    showScreen('result');
    resultTitle.textContent = won ? 'Vitória!' : 'Derrota';
    resultTitle.className = won ? 'won' : 'lost';
    resultDetail.textContent = detail || '';
  }

  resultAgain.addEventListener('click', () => {
    window.location.reload();
  });

  Game.Menu = { showResult };
})();
