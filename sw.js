/* ═══════════════════════════════════════════════════════
   SHADOW~1 — Service Worker v5
   FIX Schwarzbildschirm: Die alte cache-first-Strategie
   konnte nach einem Deployment ein veraltetes index.html
   ausliefern, dessen gehashte Assets nicht mehr existieren —
   und lieferte bei Asset-Fehlern HTML statt JavaScript aus
   (→ Parse-Error → schwarzer Screen).
   Neu:
   · Navigationen: NETWORK-FIRST (immer frischestes index.html),
     Cache nur als Offline-Fallback
   · Assets: cache-first, aber NIEMALS HTML-Fallback für
     Skripte/Styles — ein Fehler bleibt ein Fehler
═══════════════════════════════════════════════════════ */
const CACHE  = 'shadow1-fullstack-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;   // API-Calls (Backend, OFF etc.) nie anfassen

  // Navigationen: network-first — Deployments kommen sofort an
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Assets: cache-first mit Runtime-Caching; kein HTML-Fallback
  e.respondWith(
    caches.match(e.request).then(hit =>
      hit || fetch(e.request).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
    )
  );
});
