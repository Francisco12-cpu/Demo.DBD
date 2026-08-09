window.Game = window.Game || {};

(function(){
  "use strict";

  // Sons sintetizados na hora via Web Audio API — sem arquivo de áudio,
  // sem depender de internet. O batimento cardíaco é espacial de verdade
  // (PannerNode com HRTF): a posição do Assassino em relação ao
  // Sobrevivente vira posição 3D no áudio, então o som muda de lado no
  // fone conforme a direção real, e fica mais forte/rápido quanto mais
  // perto. Só o Sobrevivente ouve — é a "visão" auditiva dele do
  // Assassino, funciona mesmo sem ele estar visível na tela.

  let ctx = null;
  let masterGain = null;
  let masterVolume = 1;

  function ensureContext(){
    if (ctx) return ctx;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    ctx = new AudioContextClass();
    masterGain = ctx.createGain();
    masterGain.gain.value = masterVolume;
    masterGain.connect(ctx.destination);
    return ctx;
  }

  // Volume master (0..1), configurável no menu de opções — persiste entre
  // partidas via localStorage (ver js/menu.js). Afeta todos os sons daqui
  // pra frente (todo som passa pelo masterGain em vez de ir direto pro
  // destino final).
  function setMasterVolume(v){
    masterVolume = Math.max(0, Math.min(1, v));
    if (masterGain) masterGain.gain.value = masterVolume;
  }

  // Precisa ser chamado a partir de um gesto do usuário (clique/toque) —
  // navegadores bloqueiam áudio automático. O menu já garante isso (o
  // jogador clica "Jogar" antes da partida começar).
  function init(){
    const c = ensureContext();
    if (c && c.state === 'suspended') c.resume();
  }

  function makePanner(c, panX, panZ){
    const panner = c.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 10;
    panner.rolloffFactor = 1;
    if (panner.positionX){
      panner.positionX.value = panX;
      panner.positionY.value = 0;
      panner.positionZ.value = panZ;
    } else if (panner.setPosition){
      panner.setPosition(panX, 0, panZ);
    }
    return panner;
  }

  function playThump(panX, panZ, volume, freq){
    const c = ensureContext();
    if (!c) return;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.001), c.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.24);

    const panner = makePanner(c, panX, panZ);

    osc.connect(gain).connect(panner).connect(masterGain);
    osc.start();
    osc.stop(c.currentTime + 0.26);
  }

  // ---------- batimento cardíaco ----------
  let heartbeatOn = false;
  let nextBeatAt = 0;

  function stopHeartbeat(){
    heartbeatOn = false;
  }

  // listenerPos/killerPos: {x,y} no espaço do jogo. maxDistance: além
  // disso, o batimento fica em silêncio (o Assassino está "longe demais
  // pra ouvir").
  function updateHeartbeat(listenerPos, killerPos, maxDistance){
    const c = ensureContext();
    if (!c || !killerPos){ heartbeatOn = false; return; }

    const dx = killerPos.x - listenerPos.x;
    const dy = killerPos.y - listenerPos.y;
    const dist = Math.hypot(dx, dy);
    if (dist > maxDistance){ heartbeatOn = false; return; }

    heartbeatOn = true;
    const norm = Math.max(dist, 1);
    const panX = (dx / norm) * 3;   // esquerda/direita
    const panZ = (dy / norm) * 3;   // frente/trás (eixo "Y" do jogo vira "Z" do áudio)

    const proximity = 1 - Math.min(dist / maxDistance, 1); // 0 longe .. 1 grudado
    const intervalMs = 950 - proximity * 600; // 950ms longe -> 350ms bem perto
    const volume = 0.12 + proximity * 0.35;

    if (c.currentTime * 1000 >= nextBeatAt){
      playThump(panX, panZ, volume, 68);
      setTimeout(() => { if (heartbeatOn) playThump(panX, panZ, volume * 0.75, 52); }, 110);
      nextBeatAt = c.currentTime * 1000 + intervalMs;
    }
  }

  // ---------- efeitos sonoros (não-espaciais, simples) ----------
  function playAttackSwing(){
    const c = ensureContext();
    if (!c) return;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, c.currentTime + 0.15);

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.18, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.16);

    osc.connect(gain).connect(masterGain);
    osc.start();
    osc.stop(c.currentTime + 0.18);
  }

  function playCaptureHit(){
    const c = ensureContext();
    if (!c) return;
    const osc = c.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(180, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, c.currentTime + 0.3);

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.22, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.32);

    osc.connect(gain).connect(masterGain);
    osc.start();
    osc.stop(c.currentTime + 0.34);
  }

  // passo curto e discreto — dá presença sonora ao jogo mesmo longe de
  // qualquer evento (captura, ataque, batimento), sem ficar irritante
  function playFootstep(){
    const c = ensureContext();
    if (!c) return;
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(90 + Math.random() * 20, c.currentTime);

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.05, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.08);

    osc.connect(gain).connect(masterGain);
    osc.start();
    osc.stop(c.currentTime + 0.09);
  }

  Game.Audio = { init, updateHeartbeat, stopHeartbeat, playAttackSwing, playCaptureHit, playFootstep, setMasterVolume };
})();
