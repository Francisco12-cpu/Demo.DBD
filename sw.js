// Service worker do PWA. Estratégia: SEMPRE tenta a rede primeiro pra
// arquivos do próprio jogo (HTML/CSS/JS) e só usa o cache se estiver
// offline — importante pra nunca travar o jogador numa versão antiga
// depois de um update (já tivemos um problema parecido com cache de
// navegador escondendo correções). O cache aqui existe só pra: (1) deixar
// o app instalável e (2) funcionar offline no modo solo, não pra acelerar
// nem pra "fixar" uma versão.
const CACHE_NAME = 'dbd-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // não mexe em chamadas externas (broker do PeerJS, etc.)

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
