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
  const abilitySelect2 = document.getElementById('menu-ability2');
  const menuKillerAbility = document.getElementById('menu-killer-ability');
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
  const lobbyRoomCodeCopy = document.getElementById('lobby-room-code-copy');
  const lobbyRoomQr = document.getElementById('lobby-room-qr');
  const lobbyCounts = document.getElementById('lobby-counts');
  const lobbyPlayers = document.getElementById('lobby-players');
  const lobbyBeKiller = document.getElementById('lobby-be-killer');
  const lobbyBeSurvivor = document.getElementById('lobby-be-survivor');
  const lobbyAbilityRow = document.getElementById('lobby-ability-row');
  const lobbyAbility = document.getElementById('lobby-ability');
  const lobbyAbility2 = document.getElementById('lobby-ability2');
  const lobbyKillerAbilityRow = document.getElementById('lobby-killer-ability-row');
  const lobbyKillerAbility = document.getElementById('lobby-killer-ability');
  const lobbyError = document.getElementById('lobby-error');
  const lobbyReady = document.getElementById('lobby-ready');
  const lobbyStart = document.getElementById('lobby-start');

  const resultTitle = document.getElementById('result-title');
  const resultDetail = document.getElementById('result-detail');
  const resultAgain = document.getElementById('result-again');

  function playerName(){
    return (nameInput.value || '').trim().slice(0, 16) || 'Jogador';
  }

  // as 2 habilidades do Sobrevivente precisam ser diferentes — em vez de
  // travar o <select> ou mostrar erro, se o jogador escolher em um select a
  // mesma habilidade que já está no outro, os dois trocam de lugar sozinhos
  // (sempre sobra uma combinação válida, sem precisar de mensagem de erro)
  function linkAbilitySelects(selA, selB, onChange){
    selA.addEventListener('change', () => {
      if (selA.value === selB.value){
        selB.value = selA.dataset.prevValue || (selB.value === 'sprint' ? 'camouflage' : 'sprint');
      }
      selA.dataset.prevValue = selA.value;
      selB.dataset.prevValue = selB.value;
      onChange();
    });
    selB.addEventListener('change', () => {
      if (selB.value === selA.value){
        selA.value = selB.dataset.prevValue || (selA.value === 'sprint' ? 'camouflage' : 'sprint');
      }
      selA.dataset.prevValue = selA.value;
      selB.dataset.prevValue = selB.value;
      onChange();
    });
    selA.dataset.prevValue = selA.value;
    selB.dataset.prevValue = selB.value;
  }

  // loadout de habilidades persistido entre sessões — mesmo padrão do
  // token de reconexão logo abaixo: silencioso, sem UI própria, só lembra
  // a última escolha (solo e lobby online compartilham a mesma preferência,
  // já que é "o que esse jogador costuma jogar", não algo por partida).
  const SURVIVOR_ABILITY_KEYS = ['sprint', 'camouflage', 'barricade', 'distract'];
  const KILLER_ABILITY_KEYS = ['trap', 'invisibility'];

  function loadAbilityPrefs(){
    const a1 = localStorage.getItem('dbd_ability');
    const a2 = localStorage.getItem('dbd_ability2');
    const ka = localStorage.getItem('dbd_killer_ability');
    if (SURVIVOR_ABILITY_KEYS.includes(a1)){
      abilitySelect.value = a1;
      lobbyAbility.value = a1;
    }
    if (SURVIVOR_ABILITY_KEYS.includes(a2) && a2 !== abilitySelect.value){
      abilitySelect2.value = a2;
      lobbyAbility2.value = a2;
    }
    if (KILLER_ABILITY_KEYS.includes(ka)){
      menuKillerAbility.value = ka;
      lobbyKillerAbility.value = ka;
    }
  }
  function saveSurvivorAbilityPrefs(a1, a2){
    localStorage.setItem('dbd_ability', a1);
    localStorage.setItem('dbd_ability2', a2);
  }
  function saveKillerAbilityPref(key){
    localStorage.setItem('dbd_killer_ability', key);
  }
  loadAbilityPrefs();

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

  linkAbilitySelects(abilitySelect, abilitySelect2, () => {
    saveSurvivorAbilityPrefs(abilitySelect.value, abilitySelect2.value);
  });
  menuKillerAbility.addEventListener('change', () => saveKillerAbilityPref(menuKillerAbility.value));

  soloSurvivorBtn.addEventListener('click', () => {
    menu.style.display = 'none';
    Game.startSolo(playerName(), abilitySelect.value, abilitySelect2.value);
  });

  soloKillerBtn.addEventListener('click', () => {
    menu.style.display = 'none';
    Game.startSoloAsKiller(playerName(), menuKillerAbility.value);
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
  let lastServerErrorMessage = '';
  let hostingRoomCode = null;

  // reconexão automática: queda de rede (não senha errada/sala cheia — essas
  // vêm por onServerError/onError, guardadas por lastServerErrorAt, e não
  // adianta tentar de novo com os mesmos dados errados) tenta reconectar
  // sozinha algumas vezes antes de devolver o jogador pro formulário manual.
  // O servidor já guarda o lugar de quem caiu no meio de uma partida por um
  // tempo (RECONNECT_GRACE_MS em server.js/net-webrtc.js) via reconnectToken()
  // — só faltava o cliente tentar reconectar sozinho nesse intervalo.
  const RECONNECT_ATTEMPTS = 3;
  const RECONNECT_DELAY_MS = 2000;
  let reconnectAttemptsLeft = 0;
  let lastConnectFn = null; // () => net — refaz a MESMA conexão (mesmos host/porta/senha ou código/senha)

  function attemptAutoReconnect(errorTarget){
    if (reconnectAttemptsLeft <= 0 || !lastConnectFn){
      errorTarget.textContent = 'A conexão com a sala caiu.';
      hostingRoomCode = null;
      showScreen(errorTarget === p2pHostError || errorTarget === p2pJoinError ? 'p2pChoice' : 'join');
      return;
    }
    const attemptNumber = RECONNECT_ATTEMPTS - reconnectAttemptsLeft + 1;
    reconnectAttemptsLeft -= 1;
    errorTarget.textContent = `Conexão caiu — tentando reconectar (${attemptNumber}/${RECONNECT_ATTEMPTS})...`;
    setTimeout(() => {
      if (lastConnectFn) net = lastConnectFn();
    }, RECONNECT_DELAY_MS);
  }

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

  // clipboard só existe em contexto seguro (https ou localhost) — sem
  // fallback nenhum se não tiver: o código já está visível na tela pra
  // copiar manualmente, o botão só é uma conveniência
  if (navigator.clipboard){
    lobbyRoomCodeCopy.addEventListener('click', () => {
      if (!hostingRoomCode) return;
      navigator.clipboard.writeText(hostingRoomCode).then(() => {
        const original = lobbyRoomCodeCopy.textContent;
        lobbyRoomCodeCopy.textContent = 'Copiado!';
        setTimeout(() => { lobbyRoomCodeCopy.textContent = original; }, 1500);
      }).catch(() => {});
    });
  } else {
    lobbyRoomCodeCopy.style.display = 'none';
  }

  function makeHandlers(errorTarget){
    return {
      onJoined(id){
        localId = id;
        errorTarget.textContent = '';
        reconnectAttemptsLeft = RECONNECT_ATTEMPTS; // conectou (de 1ª ou reconectando) — zera o contador pra próxima queda
        showScreen('lobby');
        renderRoomCode();
      },
      onLobby(msg){
        lastLobby = msg;
        renderLobby(msg);
      },
      onServerError(message){
        lastServerErrorAt = Date.now();
        lastServerErrorMessage = message;
        Game.Audio.playError();
        if (screens.lobby.style.display === 'flex') lobbyError.textContent = message;
        else errorTarget.textContent = message;
      },
      onError(message){
        Game.Audio.playError();
        errorTarget.textContent = message;
      },
      onClose(){
        // erro recente (senha errada, sala cheia, kick etc.) — rejeição
        // DELIBERADA do servidor, não adianta tentar reconectar sozinho
        // (cairia no mesmo motivo de novo). Se ainda estamos no formulário
        // de conexão, a mensagem já apareceu ali mesmo, sem precisar
        // navegar de novo. Se já tínhamos saído do formulário (ex: lobby,
        // kickado pelo host), navega de volta carregando a mensagem
        // específica (não a genérica), senão ela se perde no elemento de
        // erro da tela antiga (lobbyError) que vai ficar escondida.
        //
        // Sem erro recente = queda de rede de verdade — aí sim vale tentar
        // reconectar sozinho (attemptAutoReconnect).
        const onConnectForm = screens.join.style.display === 'flex' || screens.p2pChoice.style.display === 'flex';
        const recentServerError = Date.now() - lastServerErrorAt < 1000;
        if (onConnectForm && recentServerError) return;
        if (screens.result.style.display === 'flex') return;
        if (recentServerError){
          errorTarget.textContent = lastServerErrorMessage;
          hostingRoomCode = null;
          showScreen(errorTarget === p2pHostError || errorTarget === p2pJoinError ? 'p2pChoice' : 'join');
        } else {
          attemptAutoReconnect(errorTarget);
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
    reconnectAttemptsLeft = RECONNECT_ATTEMPTS;
    lastConnectFn = () => Game.Net.connect({ host: hostIp, port, password, name: playerName(), token: reconnectToken() }, makeHandlers(joinError));
    net = lastConnectFn();
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
    reconnectAttemptsLeft = RECONNECT_ATTEMPTS;
    lastConnectFn = () => Game.NetWebRTC.join({ code, password: p2pJoinPassword.value, name: playerName(), token: reconnectToken() }, makeHandlers(p2pJoinError));
    net = lastConnectFn();
  });

  // Se chegou aqui por um QR code (link com ?p2p=codigo), já abre direto
  // na tela de entrar com esse código preenchido — só falta a senha.
  (function prefillFromQr(){
    const code = new URLSearchParams(location.search).get('p2p');
    if (!code) return;
    p2pCode.value = code;
    showScreen('p2pChoice');
  })();

  // atalho do PWA instalado (manifest.json → shortcuts, link
  // ?mode=solo-survivor|solo-killer) — pula direto pro modo solo sem
  // passar pelo menu, mesmo padrão do QR code do P2P acima. Precisa
  // esperar `DOMContentLoaded`: scripts com `defer` rodam na ordem do
  // HTML, e js/main.js (que registra Game.startSolo/startSoloAsKiller)
  // carrega DEPOIS de js/menu.js — clicar síncrono aqui achava a função
  // ainda undefined. DOMContentLoaded só dispara depois de todo script
  // defer já ter rodado, então por aí garante a ordem certa sem
  // depender de qual script carrega primeiro.
  document.addEventListener('DOMContentLoaded', () => {
    const mode = new URLSearchParams(location.search).get('mode');
    if (mode === 'solo-survivor') soloSurvivorBtn.click();
    else if (mode === 'solo-killer') soloKillerBtn.click();
  });

  // ---------- lobby (comum aos dois transportes online) ----------
  function renderLobby(msg){
    lobbyPlayers.innerHTML = '';
    const killerCount = msg.players.filter((p) => p.role === 'killer').length;
    const survivorCount = msg.players.filter((p) => p.role === 'survivor').length;
    lobbyCounts.textContent = `${killerCount}/1 Assassino · ${survivorCount}/${Game.CONFIG.maxSurvivors} Sobreviventes`;
    // host = primeiro a entrar na sala ainda conectado (servidor decide,
    // ver hostId() em server.js/net-webrtc.js — aqui só lê o que já veio)
    const amIHost = !!msg.hostId && msg.hostId === localId;
    msg.players.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'lobby-player' + (p.role ? ' role-' + p.role : '') + (p.ready ? ' ready' : '');
      const roleLabel = p.role === 'killer' ? 'Assassino' : (p.role === 'survivor' ? 'Sobrevivente' : 'sem papel');
      const isHostTag = p.id === msg.hostId ? ' · host' : '';
      const readyTag = p.ready ? '<span class="ready-tag">pronto</span>' : '';
      row.innerHTML = `<span>${escapeHtml(p.name)}${p.id === localId ? ' (você)' : ''}${isHostTag}</span>${readyTag}<span class="role-tag">${roleLabel}</span>`;
      // só o host vê o botão de kickar, e não em si mesmo — remover alguém
      // no meio da partida abriria caso de borda demais pro benefício, por
      // isso só aparece na sala (matchState !== 'playing', que é a única
      // hora em que a tela de lobby fica visível de qualquer forma)
      if (amIHost && p.id !== localId){
        const killerBtn = document.createElement('button');
        killerBtn.type = 'button';
        killerBtn.className = 'lobby-role-btn' + (p.role === 'killer' ? ' active' : '');
        killerBtn.textContent = 'A';
        killerBtn.title = p.role === 'killer' ? 'Tirar do papel de Assassino' : 'Definir como Assassino';
        killerBtn.dataset.forceRoleId = p.id;
        killerBtn.dataset.forceRole = p.role === 'killer' ? '' : 'killer';
        row.appendChild(killerBtn);

        const survivorBtn = document.createElement('button');
        survivorBtn.type = 'button';
        survivorBtn.className = 'lobby-role-btn' + (p.role === 'survivor' ? ' active' : '');
        survivorBtn.textContent = 'S';
        survivorBtn.title = p.role === 'survivor' ? 'Tirar do papel de Sobrevivente' : 'Definir como Sobrevivente';
        survivorBtn.dataset.forceRoleId = p.id;
        survivorBtn.dataset.forceRole = p.role === 'survivor' ? '' : 'survivor';
        row.appendChild(survivorBtn);

        const kickBtn = document.createElement('button');
        kickBtn.type = 'button';
        kickBtn.className = 'lobby-kick-btn';
        kickBtn.textContent = '✕';
        kickBtn.title = 'Remover da sala';
        kickBtn.dataset.kickId = p.id;
        row.appendChild(kickBtn);
      }
      lobbyPlayers.appendChild(row);
    });

    const me = msg.players.find((p) => p.id === localId);
    lobbyBeKiller.classList.toggle('active', !!me && me.role === 'killer');
    lobbyBeSurvivor.classList.toggle('active', !!me && me.role === 'survivor');
    lobbyAbilityRow.style.display = !!me && me.role === 'survivor' ? 'flex' : 'none';
    lobbyKillerAbilityRow.style.display = !!me && me.role === 'killer' ? 'flex' : 'none';
    if (me && me.role === 'killer') lobbyKillerAbility.value = me.ability === 'invisibility' ? 'invisibility' : 'trap';

    lobbyReady.disabled = !me || !me.role;
    lobbyReady.classList.toggle('active', !!me && me.ready);
    lobbyReady.textContent = !!me && me.ready ? 'Pronto ✓ (clique pra desmarcar)' : 'Marcar como pronto';
    const everyoneReady = msg.players.length > 0 && msg.players.every((p) => p.ready);
    lobbyStart.disabled = !everyoneReady;
  }

  // delegação de evento: 1 listener só, em vez de 1 por botão de kick
  // recriado a cada renderLobby()
  lobbyPlayers.addEventListener('click', (e) => {
    const kickBtn = e.target.closest('[data-kick-id]');
    if (kickBtn && net){ net.kick(kickBtn.dataset.kickId); return; }
    const roleBtn = e.target.closest('[data-force-role-id]');
    if (roleBtn && net){ net.forceRole(roleBtn.dataset.forceRoleId, roleBtn.dataset.forceRole || null); return; }
  });

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  lobbyBeKiller.addEventListener('click', () => {
    lobbyError.textContent = '';
    const me = lastLobby && lastLobby.players.find((p) => p.id === localId);
    net.chooseRole(me && me.role === 'killer' ? null : 'killer', lobbyKillerAbility.value);
    saveKillerAbilityPref(lobbyKillerAbility.value);
  });
  lobbyKillerAbility.addEventListener('change', () => {
    const me = lastLobby && lastLobby.players.find((p) => p.id === localId);
    if (me && me.role === 'killer') net.chooseRole('killer', lobbyKillerAbility.value);
    saveKillerAbilityPref(lobbyKillerAbility.value);
  });
  lobbyBeSurvivor.addEventListener('click', () => {
    lobbyError.textContent = '';
    const me = lastLobby && lastLobby.players.find((p) => p.id === localId);
    net.chooseRole(me && me.role === 'survivor' ? null : 'survivor', lobbyAbility.value, lobbyAbility2.value);
    saveSurvivorAbilityPrefs(lobbyAbility.value, lobbyAbility2.value);
  });
  linkAbilitySelects(lobbyAbility, lobbyAbility2, () => {
    const me = lastLobby && lastLobby.players.find((p) => p.id === localId);
    if (me && me.role === 'survivor') net.chooseRole('survivor', lobbyAbility.value, lobbyAbility2.value);
    saveSurvivorAbilityPrefs(lobbyAbility.value, lobbyAbility2.value);
  });
  lobbyReady.addEventListener('click', () => {
    lobbyError.textContent = '';
    net.toggleReady();
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
