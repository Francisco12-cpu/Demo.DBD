window.Game = window.Game || {};

(function(){
  "use strict";

  // Cliente WebSocket fino pro modo online. Não guarda estado de jogo —
  // só entrega mensagens recebidas via callback e expõe métodos pra mandar.
  function connect({ host, port, password, name }, handlers){
    const url = `ws://${host}:${port}`;
    let socket;
    try {
      socket = new WebSocket(url);
    } catch (err){
      handlers.onError && handlers.onError('Endereço inválido: ' + url);
      return null;
    }

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'join', password, name }));
    });

    socket.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'error' && handlers.onServerError) handlers.onServerError(msg.message);
      if (msg.type === 'joined' && handlers.onJoined) handlers.onJoined(msg.id);
      if (msg.type === 'lobby' && handlers.onLobby) handlers.onLobby(msg);
      if (msg.type === 'matchStart' && handlers.onMatchStart) handlers.onMatchStart(msg.players);
      if (msg.type === 'state' && handlers.onState) handlers.onState(msg.id, msg.data);
      if (msg.type === 'event' && handlers.onEvent) handlers.onEvent(msg.id, msg.data);
      if (msg.type === 'playerLeft' && handlers.onPlayerLeft) handlers.onPlayerLeft(msg.id);
    });

    socket.addEventListener('error', () => {
      handlers.onError && handlers.onError('Não deu pra conectar em ' + url + '. Confere IP, porta e se o servidor está rodando.');
    });

    socket.addEventListener('close', () => {
      handlers.onClose && handlers.onClose();
    });

    return {
      chooseRole(role){ socket.readyState === socket.OPEN && socket.send(JSON.stringify({ type: 'chooseRole', role })); },
      startMatch(){ socket.readyState === socket.OPEN && socket.send(JSON.stringify({ type: 'startMatch' })); },
      rematch(){ socket.readyState === socket.OPEN && socket.send(JSON.stringify({ type: 'rematch' })); },
      sendState(data){ socket.readyState === socket.OPEN && socket.send(JSON.stringify({ type: 'state', data })); },
      sendEvent(data){ socket.readyState === socket.OPEN && socket.send(JSON.stringify({ type: 'event', data })); },
      close(){ socket.close(); },
    };
  }

  Game.Net = { connect };
})();
