'use strict';

// Servidor leve pro modo online (mesma rede Wi-Fi). Uma sala só por
// processo: quem roda esse arquivo é o "host" da sala. Os outros jogadores
// (celular ou PC) entram pelo navegador usando o IP local desta máquina +
// a porta + a senha. Não precisa de internet nem de servidor pago.
//
// Uso:
//   cd server
//   npm install
//   npm start                      (porta 8787, senha "dbd123")
//   PORT=9000 ROOM_PASSWORD=abc123 npm start   (pra customizar)

const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const PASSWORD = process.env.ROOM_PASSWORD || 'dbd123';
const MAX_SURVIVORS = 4;

const wss = new WebSocketServer({ port: PORT });

console.log('Assassino vs Sobreviventes — servidor da sala');
console.log(`Porta: ${PORT}`);
console.log(`Senha: ${PASSWORD}`);
console.log('Os outros jogadores entram pelo navegador usando o IP desta máquina na rede local, essa porta e essa senha.');

/** @type {Map<string, {id:string, ws:import('ws').WebSocket, name:string, role:'killer'|'survivor'|null, ability:string|null}>} */
const players = new Map();
let matchState = 'lobby'; // 'lobby' | 'playing' | 'ended'

function send(ws, msg){
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg, exceptId){
  const data = JSON.stringify(msg);
  for (const p of players.values()){
    if (p.id === exceptId) continue;
    if (p.ws.readyState === p.ws.OPEN) p.ws.send(data);
  }
}

function rosterSnapshot(){
  return [...players.values()].map((p) => ({ id: p.id, name: p.name, role: p.role, ability: p.ability }));
}

function broadcastLobby(){
  broadcast({ type: 'lobby', matchState, players: rosterSnapshot() });
}

function killerCount(){
  return [...players.values()].filter((p) => p.role === 'killer').length;
}
function survivorCount(){
  return [...players.values()].filter((p) => p.role === 'survivor').length;
}

wss.on('connection', (ws) => {
  let id = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join'){
      if (msg.password !== PASSWORD){
        send(ws, { type: 'error', message: 'Senha incorreta.' });
        ws.close();
        return;
      }
      if (matchState === 'playing'){
        send(ws, { type: 'error', message: 'Partida já em andamento, espera a próxima.' });
        ws.close();
        return;
      }
      id = crypto.randomUUID();
      const name = String(msg.name || 'Jogador').slice(0, 16) || 'Jogador';
      players.set(id, { id, ws, name, role: null, ability: null });
      send(ws, { type: 'joined', id });
      broadcastLobby();
      return;
    }

    if (!id || !players.has(id)) return;
    const me = players.get(id);

    if (msg.type === 'chooseRole'){
      const role = msg.role === 'killer' || msg.role === 'survivor' ? msg.role : null;
      if (role === 'killer' && me.role !== 'killer' && killerCount() >= 1){
        send(ws, { type: 'error', message: 'Já tem um Assassino nessa sala.' });
        return;
      }
      if (role === 'survivor' && me.role !== 'survivor' && survivorCount() >= MAX_SURVIVORS){
        send(ws, { type: 'error', message: `Sala de Sobreviventes cheia (máx ${MAX_SURVIVORS}).` });
        return;
      }
      me.role = role;
      if (msg.ability) me.ability = msg.ability;
      broadcastLobby();
      return;
    }

    if (msg.type === 'startMatch'){
      if (players.size < 2){
        send(ws, { type: 'error', message: 'Precisa de pelo menos 2 jogadores pra iniciar.' });
        return;
      }
      if (killerCount() !== 1){
        send(ws, { type: 'error', message: 'Precisa de exatamente 1 jogador como Assassino.' });
        return;
      }
      if ([...players.values()].some((p) => p.role === null)){
        send(ws, { type: 'error', message: 'Todo mundo na sala precisa escolher um papel (Assassino ou Sobrevivente).' });
        return;
      }
      matchState = 'playing';
      broadcast({ type: 'matchStart', players: rosterSnapshot() });
      return;
    }

    if (msg.type === 'state'){
      // relay de posição/animação — sem validação, é um relay simples
      broadcast({ type: 'state', id, data: msg.data }, id);
      return;
    }

    if (msg.type === 'event'){
      // eventos de jogo: ataque, captura, struggle, objetivo concluído, fim de partida
      broadcast({ type: 'event', id, data: msg.data }, id);
      if (msg.data && msg.data.kind === 'matchEnd'){
        matchState = 'ended';
      }
      return;
    }

    if (msg.type === 'rematch'){
      matchState = 'lobby';
      for (const p of players.values()) p.role = null;
      broadcastLobby();
      return;
    }
  });

  ws.on('close', () => {
    if (id && players.has(id)){
      players.delete(id);
      broadcast({ type: 'playerLeft', id });
      if (players.size === 0){
        // sala esvaziou — reabre pra próxima rodada de jogadores
        matchState = 'lobby';
      } else {
        broadcastLobby();
      }
    }
  });
});
