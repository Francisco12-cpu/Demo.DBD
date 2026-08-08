window.Game = window.Game || {};

(function(){
  "use strict";

  const menu = document.getElementById('menu');
  const screens = {
    start: document.getElementById('menu-start'),
    join: document.getElementById('menu-join'),
    lobby: document.getElementById('menu-lobby'),
    result: document.getElementById('menu-result'),
  };

  function showScreen(name){
    Object.values(screens).forEach((el) => { el.style.display = 'none'; });
    screens[name].style.display = 'flex';
  }

  const nameInput = document.getElementById('menu-name');
  const soloBtn = document.getElementById('menu-solo');
  const onlineBtn = document.getElementById('menu-online');

  const joinHost = document.getElementById('join-host');
  const joinPort = document.getElementById('join-port');
  const joinPassword = document.getElementById('join-password');
  const joinError = document.getElementById('join-error');
  const joinConnectBtn = document.getElementById('join-connect');
  const joinBackBtn = document.getElementById('join-back');

  const lobbyPlayers = document.getElementById('lobby-players');
  const lobbyBeKiller = document.getElementById('lobby-be-killer');
  const lobbyBeSurvivor = document.getElementById('lobby-be-survivor');
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
    Game.startSolo(playerName());
  });

  onlineBtn.addEventListener('click', () => {
    joinError.textContent = '';
    showScreen('join');
  });

  joinBackBtn.addEventListener('click', () => showScreen('start'));

  let net = null;
  let localId = null;
  let lastLobby = null;
  let lastServerErrorAt = 0;

  joinConnectBtn.addEventListener('click', () => {
    const host = joinHost.value.trim();
    const port = parseInt(joinPort.value, 10) || 8787;
    const password = joinPassword.value;
    if (!host){
      joinError.textContent = 'Digita o IP do host.';
      return;
    }
    joinError.textContent = 'Conectando...';
    joinConnectBtn.disabled = true;

    net = Game.Net.connect({ host, port, password, name: playerName() }, {
      onJoined(id){
        localId = id;
        joinConnectBtn.disabled = false;
        joinError.textContent = '';
        showScreen('lobby');
      },
      onLobby(msg){
        lastLobby = msg;
        renderLobby(msg);
      },
      onServerError(message){
        joinConnectBtn.disabled = false;
        lastServerErrorAt = Date.now();
        if (screens.lobby.style.display === 'flex') lobbyError.textContent = message;
        else joinError.textContent = message;
      },
      onError(message){
        joinConnectBtn.disabled = false;
        joinError.textContent = message;
      },
      onClose(){
        // se um erro específico do servidor acabou de aparecer, não sobrescreve com a mensagem genérica
        if (Date.now() - lastServerErrorAt < 500) return;
        if (screens.result.style.display !== 'flex'){
          joinError.textContent = 'A conexão com a sala caiu.';
          showScreen('join');
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
    });
  });

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
    net.chooseRole(me && me.role === 'survivor' ? null : 'survivor');
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
