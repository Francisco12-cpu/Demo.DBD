window.Game = window.Game || {};

(function(){
  "use strict";

  // Modo P2P: qualquer navegador (inclusive celular) pode virar "host" sem
  // rodar nada além da própria página — usa WebRTC (via PeerJS) pra
  // conectar os jogadores direto entre si. Só depende de internet no
  // instante de conectar (o broker público e gratuito da PeerJS cuida só
  // do "aperto de mão" inicial); o jogo em si troca dados direto
  // celular-a-celular depois disso, sem servidor nenhum no meio.
  //
  // O host roda, dentro do próprio navegador dele, a mesma lógica de sala
  // que o server.js roda em Node — mesmas mensagens (join/chooseRole/
  // startMatch/state/event/rematch), só que trafegando por WebRTC em vez
  // de WebSocket. Isso deixa `js/main.js` e `js/menu.js` completamente
  // alheios a qual dos dois transportes está em uso: os dois expõem a
  // mesma interface (chooseRole/startMatch/sendState/sendEvent/rematch/
  // close + os mesmos callbacks onJoined/onLobby/onMatchStart/onState/
  // onEvent/onServerError/onError/onClose/onPlayerLeft).

  function randomRoomCode(){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem O/0/I/1 (confundem fácil)
    let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return 'dbd-' + code;
  }

  function host({ password, name }, handlers){
    if (typeof Peer === 'undefined'){
      handlers.onError && handlers.onError('Biblioteca P2P não carregou (sem internet?).');
      return null;
    }

    const roomCode = randomRoomCode();
    const peer = new Peer(roomCode, { debug: 0 });
    const MAX_SURVIVORS = Game.CONFIG.maxSurvivors;

    /** @type {Map<string, {id:string, name:string, role:string|null, ability:string|null, conn: any}>} */
    const players = new Map();
    let matchState = 'lobby';
    let localId = null;

    function send(conn, msg){
      if (conn){ if (conn.open) conn.send(msg); }
      else deliverLocally(msg);
    }

    function deliverLocally(msg){
      if (msg.type === 'error' && handlers.onServerError) handlers.onServerError(msg.message);
      if (msg.type === 'lobby' && handlers.onLobby) handlers.onLobby(msg);
      if (msg.type === 'matchStart' && handlers.onMatchStart) handlers.onMatchStart(msg.players);
      if (msg.type === 'state' && handlers.onState) handlers.onState(msg.id, msg.data);
      if (msg.type === 'event' && handlers.onEvent) handlers.onEvent(msg.id, msg.data);
      if (msg.type === 'playerLeft' && handlers.onPlayerLeft) handlers.onPlayerLeft(msg.id);
    }

    function broadcast(msg, exceptId){
      for (const p of players.values()){
        if (p.id === exceptId) continue;
        send(p.conn, msg);
      }
    }

    function rosterSnapshot(){
      return [...players.values()].map((p) => ({ id: p.id, name: p.name, role: p.role, ability: p.ability }));
    }

    function broadcastLobby(){
      broadcast({ type: 'lobby', matchState, players: rosterSnapshot() });
    }

    function killerCount(){ return [...players.values()].filter((p) => p.role === 'killer').length; }
    function survivorCount(){ return [...players.values()].filter((p) => p.role === 'survivor').length; }

    function processMessage(id, msg, conn){
      const p = players.get(id);
      if (!p) return;

      if (msg.type === 'chooseRole'){
        const role = msg.role === 'killer' || msg.role === 'survivor' ? msg.role : null;
        if (role === 'killer' && p.role !== 'killer' && killerCount() >= 1){
          send(conn, { type: 'error', message: 'Já tem um Assassino nessa sala.' });
          return;
        }
        if (role === 'survivor' && p.role !== 'survivor' && survivorCount() >= MAX_SURVIVORS){
          send(conn, { type: 'error', message: `Sala de Sobreviventes cheia (máx ${MAX_SURVIVORS}).` });
          return;
        }
        p.role = role;
        if (msg.ability) p.ability = msg.ability;
        broadcastLobby();
        return;
      }

      if (msg.type === 'startMatch'){
        if (players.size < 2){
          send(conn, { type: 'error', message: 'Precisa de pelo menos 2 jogadores pra iniciar.' });
          return;
        }
        if (killerCount() !== 1){
          send(conn, { type: 'error', message: 'Precisa de exatamente 1 jogador como Assassino.' });
          return;
        }
        if ([...players.values()].some((pp) => pp.role === null)){
          send(conn, { type: 'error', message: 'Todo mundo na sala precisa escolher um papel.' });
          return;
        }
        matchState = 'playing';
        broadcast({ type: 'matchStart', players: rosterSnapshot() });
        return;
      }

      if (msg.type === 'state'){
        broadcast({ type: 'state', id, data: msg.data }, id);
        return;
      }

      if (msg.type === 'event'){
        broadcast({ type: 'event', id, data: msg.data }, id);
        if (msg.data && msg.data.kind === 'matchEnd') matchState = 'ended';
        return;
      }

      if (msg.type === 'rematch'){
        matchState = 'lobby';
        for (const pp of players.values()) pp.role = null;
        broadcastLobby();
        return;
      }
    }

    peer.on('open', (id) => {
      localId = id;
      players.set(localId, { id: localId, name: name || 'Jogador', role: null, ability: null, conn: null });
      handlers.onJoined && handlers.onJoined(localId);
      broadcastLobby();
    });

    peer.on('connection', (conn) => {
      conn.on('data', (msg) => {
        if (msg.type === 'join'){
          if (msg.password !== password){
            send(conn, { type: 'error', message: 'Senha incorreta.' });
            conn.close();
            return;
          }
          if (matchState === 'playing'){
            send(conn, { type: 'error', message: 'Partida já em andamento, espera a próxima.' });
            conn.close();
            return;
          }
          const id = conn.peer;
          const playerName = String(msg.name || 'Jogador').slice(0, 16) || 'Jogador';
          players.set(id, { id, name: playerName, role: null, ability: null, conn });
          send(conn, { type: 'joined', id });
          broadcastLobby();
          return;
        }
        processMessage(conn.peer, msg, conn);
      });
      conn.on('close', () => {
        if (players.has(conn.peer)){
          players.delete(conn.peer);
          broadcast({ type: 'playerLeft', id: conn.peer });
          handlers.onPlayerLeft && handlers.onPlayerLeft(conn.peer);
          if (players.size <= 1) matchState = 'lobby';
          else broadcastLobby();
        }
      });
    });

    peer.on('error', (err) => {
      handlers.onError && handlers.onError('Erro P2P: ' + (err && err.type ? err.type : err));
    });

    return {
      roomCode,
      chooseRole(role, ability){ processMessage(localId, { type: 'chooseRole', role, ability }, null); },
      startMatch(){ processMessage(localId, { type: 'startMatch' }, null); },
      rematch(){ processMessage(localId, { type: 'rematch' }, null); },
      sendState(data){ broadcast({ type: 'state', id: localId, data }); },
      sendEvent(data){
        broadcast({ type: 'event', id: localId, data });
        if (data && data.kind === 'matchEnd') matchState = 'ended';
      },
      close(){ peer.destroy(); },
    };
  }

  function join({ code, password, name }, handlers){
    if (typeof Peer === 'undefined'){
      handlers.onError && handlers.onError('Biblioteca P2P não carregou (sem internet?).');
      return null;
    }

    const peer = new Peer(undefined, { debug: 0 });
    let conn = null;

    function dispatch(msg){
      if (msg.type === 'error' && handlers.onServerError) handlers.onServerError(msg.message);
      if (msg.type === 'joined' && handlers.onJoined) handlers.onJoined(msg.id);
      if (msg.type === 'lobby' && handlers.onLobby) handlers.onLobby(msg);
      if (msg.type === 'matchStart' && handlers.onMatchStart) handlers.onMatchStart(msg.players);
      if (msg.type === 'state' && handlers.onState) handlers.onState(msg.id, msg.data);
      if (msg.type === 'event' && handlers.onEvent) handlers.onEvent(msg.id, msg.data);
      if (msg.type === 'playerLeft' && handlers.onPlayerLeft) handlers.onPlayerLeft(msg.id);
    }

    peer.on('open', () => {
      conn = peer.connect(code, { reliable: true });
      conn.on('open', () => { conn.send({ type: 'join', password, name }); });
      conn.on('data', dispatch);
      conn.on('close', () => { handlers.onClose && handlers.onClose(); });
      conn.on('error', (err) => {
        handlers.onError && handlers.onError('Erro P2P: ' + (err && err.type ? err.type : err));
      });
    });

    peer.on('error', (err) => {
      const type = err && err.type;
      const message = type === 'peer-unavailable'
        ? 'Código da sala não encontrado. Confere se digitou certo.'
        : 'Não deu pra conectar (' + (type || err) + ').';
      handlers.onError && handlers.onError(message);
    });

    return {
      chooseRole(role, ability){ conn && conn.open && conn.send({ type: 'chooseRole', role, ability }); },
      startMatch(){ conn && conn.open && conn.send({ type: 'startMatch' }); },
      rematch(){ conn && conn.open && conn.send({ type: 'rematch' }); },
      sendState(data){ conn && conn.open && conn.send({ type: 'state', data }); },
      sendEvent(data){ conn && conn.open && conn.send({ type: 'event', data }); },
      close(){ conn && conn.close(); peer.destroy(); },
    };
  }

  Game.NetWebRTC = { host, join };
})();
