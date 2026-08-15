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
const { RESUMABLE_EVENT_KINDS } = require('../js/protocol.js');

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const PASSWORD = process.env.ROOM_PASSWORD || 'dbd123';
const MAX_SURVIVORS = 4;
const MAP_LAYOUT_COUNT = 2; // precisa bater com Game.MAP.layouts.length em js/map.js
const RECONNECT_GRACE_MS = 25000; // tempo pra quem caiu no meio da partida voltar antes de contar como saída de vez

const wss = new WebSocketServer({ port: PORT });

console.log('Until Dawn — servidor da sala');
console.log(`Porta: ${PORT}`);
console.log(`Senha: ${PASSWORD}`);
console.log('Os outros jogadores entram pelo navegador usando o IP desta máquina na rede local, essa porta e essa senha.');

/** @type {Map<string, {id:string, ws:import('ws').WebSocket, name:string, role:'killer'|'survivor'|null, ability:string|null, ready:boolean, token:string}>} */
const players = new Map();
// jogador que caiu no meio de uma partida em andamento — guardado aqui por
// RECONNECT_GRACE_MS esperando o mesmo token voltar antes de desistir dele
/** @type {Map<string, {id:string, name:string, role:string, ability:string, timer:NodeJS.Timeout}>} */
const pendingReconnect = new Map();
let matchState = 'lobby'; // 'lobby' | 'playing' | 'ended'
let currentMapLayoutIndex = 0;
let completedObjectives = new Set(); // índices, só durante a partida atual
let eliminatedIds = new Set(); // ids de jogadores já eliminados/saídos na partida atual

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
  return [...players.values()].map((p) => ({ id: p.id, name: p.name, role: p.role, ability: p.ability, ready: !!p.ready }));
}

// "host" = primeiro jogador ainda conectado (Map preserva ordem de
// inserção) — sem eleição/config nenhuma: se o host original sair, o
// próximo mais antigo vira host sozinho, de graça, só pela ordem do Map.
function hostId(){
  const first = players.keys().next();
  return first.done ? null : first.value;
}

function broadcastLobby(){
  broadcast({ type: 'lobby', matchState, players: rosterSnapshot(), hostId: hostId() });
}

function killerCount(){
  return [...players.values()].filter((p) => p.role === 'killer').length;
}
function survivorCount(){
  return [...players.values()].filter((p) => p.role === 'survivor').length;
}

function finalizeDeparture(id){
  pendingReconnect.delete(id);
  eliminatedIds.add(id);
  broadcast({ type: 'playerLeft', id });
  if (players.size === 0){
    matchState = 'lobby';
    completedObjectives = new Set();
    eliminatedIds = new Set();
  } else if (matchState !== 'playing'){
    broadcastLobby();
  }
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

      const token = typeof msg.token === 'string' && msg.token ? msg.token : null;
      const pending = token ? pendingReconnect.get(token) : null;

      if (pending){
        clearTimeout(pending.timer);
        pendingReconnect.delete(token);
        id = pending.id;
        const name = String(msg.name || pending.name).slice(0, 16) || pending.name;
        players.set(id, { id, ws, name, role: pending.role, ability: pending.ability, token });
        send(ws, { type: 'joined', id });
        if (matchState === 'playing'){
          send(ws, {
            type: 'matchResume',
            players: rosterSnapshot(),
            mapLayoutIndex: currentMapLayoutIndex,
            doneObjectives: [...completedObjectives],
            eliminatedIds: [...eliminatedIds],
          });
        } else {
          broadcastLobby();
        }
        return;
      }

      if (matchState === 'playing'){
        send(ws, { type: 'error', message: 'Partida já em andamento, espera a próxima.' });
        ws.close();
        return;
      }
      id = crypto.randomUUID();
      const name = String(msg.name || 'Jogador').slice(0, 16) || 'Jogador';
      players.set(id, { id, ws, name, role: null, ability: null, ready: false, token });
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
      if (role !== me.role) me.ready = false; // trocar de papel desmarca "pronto" — o loadout mudou
      me.role = role;
      if (msg.ability) me.ability = msg.ability;
      broadcastLobby();
      return;
    }

    if (msg.type === 'toggleReady'){
      if (!me.role) return; // precisa ter escolhido um papel antes de poder marcar pronto
      me.ready = !me.ready;
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
      if ([...players.values()].some((p) => !p.ready)){
        send(ws, { type: 'error', message: 'Todo mundo precisa marcar "pronto" antes de iniciar.' });
        return;
      }
      matchState = 'playing';
      completedObjectives = new Set();
      eliminatedIds = new Set();
      currentMapLayoutIndex = Math.floor(Math.random() * MAP_LAYOUT_COUNT);
      broadcast({ type: 'matchStart', players: rosterSnapshot(), mapLayoutIndex: currentMapLayoutIndex });
      return;
    }

    if (msg.type === 'state'){
      // relay de posição/animação — continua confiando no cliente (não é
      // anti-cheat de verdade), só clampa deslocamento implausível (ex:
      // teletransporte) pra um valor generoso acima da maior velocidade
      // possível no jogo (Investida do Assassino: 220*2.2 ≈ 484px/s)
      const now = Date.now();
      if (me.lastStateAt !== undefined && typeof msg.data.x === 'number' && typeof msg.data.y === 'number'){
        const dt = Math.max((now - me.lastStateAt) / 1000, 0.03);
        const dx = msg.data.x - me.lastX, dy = msg.data.y - me.lastY;
        const dist = Math.hypot(dx, dy);
        const maxDist = 700 * dt;
        if (dist > maxDist && dist > 0){
          const ratio = maxDist / dist;
          msg.data = { ...msg.data, x: me.lastX + dx * ratio, y: me.lastY + dy * ratio };
        }
      }
      me.lastStateAt = now;
      me.lastX = msg.data.x;
      me.lastY = msg.data.y;
      broadcast({ type: 'state', id, data: msg.data }, id);
      return;
    }

    if (msg.type === 'event'){
      // eventos de jogo: ataque, captura, struggle, objetivo concluído, fim de partida.
      // O servidor só espia kind pra guardar o mínimo necessário pra
      // reconstituir o estado de quem reconectar no meio da partida.
      broadcast({ type: 'event', id, data: msg.data }, id);
      if (msg.data && msg.data.kind === RESUMABLE_EVENT_KINDS.MATCH_END){
        matchState = 'ended';
      }
      if (msg.data && msg.data.kind === RESUMABLE_EVENT_KINDS.OBJECTIVE_DONE && typeof msg.data.index === 'number'){
        completedObjectives.add(msg.data.index);
      }
      if (msg.data && msg.data.kind === RESUMABLE_EVENT_KINDS.STRUGGLE_RESULT && msg.data.result === 'eliminated' && msg.data.playerId){
        eliminatedIds.add(msg.data.playerId);
      }
      return;
    }

    if (msg.type === 'rematch'){
      matchState = 'lobby';
      completedObjectives = new Set();
      eliminatedIds = new Set();
      for (const p of players.values()){ p.role = null; p.ready = false; }
      broadcastLobby();
      return;
    }

    if (msg.type === 'forceRole'){
      // só o host, só antes da partida começar — mesma regra do kick.
      // Deixa o host reorganizar quem é Assassino/Sobrevivente sem
      // depender de cada jogador clicar no próprio botão (útil quando
      // alguém trava ou não entende a UI)
      if (id !== hostId() || matchState !== 'lobby') return;
      const target = players.get(msg.targetId);
      if (!target) return;
      const role = msg.role === 'killer' || msg.role === 'survivor' ? msg.role : null;
      if (role === 'killer' && target.role !== 'killer' && killerCount() >= 1){
        send(ws, { type: 'error', message: 'Já tem um Assassino nessa sala.' });
        return;
      }
      if (role === 'survivor' && target.role !== 'survivor' && survivorCount() >= MAX_SURVIVORS){
        send(ws, { type: 'error', message: `Sala de Sobreviventes cheia (máx ${MAX_SURVIVORS}).` });
        return;
      }
      if (role !== target.role) target.ready = false;
      target.role = role;
      broadcastLobby();
      return;
    }

    if (msg.type === 'kick'){
      // só o host (ver hostId()) pode kickar, e só antes da partida
      // começar — kickar no meio da partida abriria um monte de caso de
      // borda (reconexão pendente, objetivo em progresso etc.) sem
      // benefício real; se precisar tirar alguém no meio do jogo, dá pra
      // esperar a partida acabar
      if (id !== hostId() || matchState !== 'lobby') return;
      const target = players.get(msg.targetId);
      if (!target || target.id === id) return;
      send(target.ws, { type: 'error', message: 'Você foi removido da sala pelo host.' });
      target.ws.close();
      // o resto (players.delete + finalizeDeparture, já que matchState
      // não é 'playing') acontece sozinho no handler de 'close' abaixo,
      // igual uma queda de conexão normal
      return;
    }
  });

  ws.on('close', () => {
    if (!id || !players.has(id)) return;
    const me = players.get(id);
    players.delete(id);

    if (matchState === 'playing' && me.token){
      // dá um tempo pra reconectar (rede caiu, celular travou etc.) antes
      // de contar como saída de vez
      const timer = setTimeout(() => finalizeDeparture(id), RECONNECT_GRACE_MS);
      pendingReconnect.set(me.token, { id, name: me.name, role: me.role, ability: me.ability, timer });
      return;
    }

    finalizeDeparture(id);
  });
});
