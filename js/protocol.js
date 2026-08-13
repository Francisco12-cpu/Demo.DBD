// Referência única de protocolo de rede — funciona sem build step tanto no
// navegador (carregado via <script defer>, pendura em Game.Protocol) quanto
// no Node (server/server.js, via require).
//
// server.js (LAN) e net-webrtc.js (host P2P) implementam a mesma lógica de
// sala em dois arquivos separados (ver CLAUDE.md — decisão consciente, sem
// build step não dá pra compartilhar módulo de verdade entre os dois numa
// única função). A maioria das mensagens (`event.data.kind`) só interessa
// pro cliente (js/main.js) — servidor e host apenas repassam sem olhar pro
// conteúdo. Só estes 3 valores abaixo são inspecionados pelos DOIS lados
// (servidor E host) pra reconstituir o progresso de quem reconecta no meio
// da partida — são o único ponto onde um typo/rename num dos dois arquivos
// diverge silenciosamente do outro. Centralizados aqui pra isso virar erro
// na hora (variável indefinida) em vez de divergência silenciosa.
(function(root, factory){
  const mod = factory();
  if (typeof module === 'object' && module.exports){
    module.exports = mod;
  }
  if (typeof window !== 'undefined'){
    window.Game = window.Game || {};
    window.Game.Protocol = mod;
  }
})(this, function(){
  "use strict";

  // kinds de evento que o SERVIDOR (server.js) e o HOST P2P (net-webrtc.js)
  // precisam entender, não só repassar. Ver server.js e net-webrtc.js,
  // função processMessage/handler de 'event' nos dois.
  const RESUMABLE_EVENT_KINDS = {
    MATCH_END: 'matchEnd',
    OBJECTIVE_DONE: 'objectiveDone',
    STRUGGLE_RESULT: 'struggleResult',
  };

  // Inventário completo dos `kind` usados em js/main.js (só documentação —
  // esses não passam por servidor/host de forma inspecionada, então não
  // ganham constante própria; listados aqui só pra quem for adicionar um
  // novo saber onde procurar todos os existentes): captureStart, downed,
  // pickedUp, droppedFree, hooked, rescued, gateOpened, survivorEscaped,
  // doorForceLock, doorLocked, doorBroken, palletDropped, palletBroken,
  // palletStun, noise — e os 3 de RESUMABLE_EVENT_KINDS acima.

  return { RESUMABLE_EVENT_KINDS };
});
