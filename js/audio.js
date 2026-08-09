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
    const volume = 0.22 + proximity * 0.5; // subido — o panner HRTF já atenua bastante sozinho

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
    gain.gain.setValueAtTime(0.12, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.08);

    osc.connect(gain).connect(masterGain);
    osc.start();
    osc.stop(c.currentTime + 0.09);
  }

  // ---------- sons de interface (clique/erro) ----------
  // curtos e neutros — só pra dar retorno de "isso reagiu ao meu toque",
  // pedido explícito do usuário porque o menu inteiro estava mudo
  function playClick(){
    const c = ensureContext();
    if (!c) return;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(680, c.currentTime + 0.05);

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.15, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.09);

    osc.connect(gain).connect(masterGain);
    osc.start();
    osc.stop(c.currentTime + 0.1);
  }

  function playError(){
    const c = ensureContext();
    if (!c) return;
    const osc = c.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(180, c.currentTime);

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.14, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.2);

    osc.connect(gain).connect(masterGain);
    osc.start();
    osc.stop(c.currentTime + 0.22);
  }

  // aviso bem discreto pro Assassino de que um gerador começou a ser
  // reparado em algum lugar (sem revelar posição — só uma pista de que
  // "algo está acontecendo", diferente do alarme alto de errar skill check)
  function playObjectiveStart(){
    const c = ensureContext();
    if (!c) return;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 900;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.06, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.5);
    osc.connect(gain).connect(masterGain);
    osc.start();
    osc.stop(c.currentTime + 0.52);
  }

  // botão "Testar som" das Configurações — 3 bipes, pra quem não tem
  // certeza se o áudio do celular está mesmo ativado
  function playTestSound(){
    const c = ensureContext();
    if (!c) return;
    [0, 0.18, 0.36].forEach((delay, i) => {
      setTimeout(() => {
        const osc = c.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 440 + i * 110;
        const gain = c.createGain();
        gain.gain.setValueAtTime(0.2, c.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.15);
        osc.connect(gain).connect(masterGain);
        osc.start();
        osc.stop(c.currentTime + 0.16);
      }, delay * 1000);
    });
  }

  // ---------- música ambiente de terror ----------
  // Drone grave e levemente destonado (2 osciladores quase na mesma nota
  // batem entre si, criando aquele zumbido tenso) com um LFO bem lento
  // modulando o volume, tipo uma "respiração". Sintetizado igual o resto,
  // sem arquivo de música nenhum — toca baixinho o jogo inteiro.
  let ambientNodes = null;

  function startAmbient(){
    const c = ensureContext();
    if (!c || ambientNodes) return;

    const gain = c.createGain();
    gain.gain.value = 0.1;
    gain.connect(masterGain);

    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    filter.connect(gain);

    const oscA = c.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 55;
    oscA.connect(filter);

    const oscB = c.createOscillator();
    oscB.type = 'sawtooth';
    oscB.frequency.value = 58; // levemente destonado de propósito, dá o clima tenso
    oscB.connect(filter);

    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07; // bem lento — uma "respiração" a cada ~14s
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.04;
    lfo.connect(lfoGain).connect(gain.gain);

    oscA.start();
    oscB.start();
    lfo.start();
    ambientNodes = { gain, oscA, oscB, lfo };
  }

  function stopAmbient(){
    if (!ambientNodes || !ctx) return;
    const { gain, oscA, oscB, lfo } = ambientNodes;
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    setTimeout(() => { oscA.stop(); oscB.stop(); lfo.stop(); }, 500);
    ambientNodes = null;
  }

  Game.Audio = {
    init, updateHeartbeat, stopHeartbeat, playAttackSwing, playCaptureHit, playFootstep,
    playClick, playError, playTestSound, playObjectiveStart,
    setMasterVolume, startAmbient, stopAmbient,
  };
})();
