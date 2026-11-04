/* Pulso 360 — Service Worker
   Objetivo: garantir que TODO usuário sempre receba o index.html (e o manifesto)
   mais recente, sem depender do cache do navegador (que prendia o HTML antigo e
   fazia o painel abrir base velha). Estratégia: NETWORK-FIRST forçado para o
   documento (navegação) e para o manifesto; o resto passa direto (o próprio
   painel já controla o cache das partes via ?v= + no-cache).
   Seguro: se a rede falhar, cai no cache como contingência (offline). */

const CACHE = 'pulso360-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  const isNav = req.mode === 'navigate';
  const isManifest = url.pathname.endsWith('/manifesto.json') || url.pathname.endsWith('manifesto.json');

  if (isNav || isManifest) {
    // Sempre busca fresco da rede (ignora cache HTTP). Guarda uma cópia só para offline.
    e.respondWith(
      fetch(url.pathname + url.search, { cache: 'reload' })
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return r;
        })
        .catch(() => caches.match(req).then((c) => c || fetch(req)))
    );
    return;
  }
  // Demais requisições (partes ?v=, libs, etc.): comportamento normal do navegador.
});
