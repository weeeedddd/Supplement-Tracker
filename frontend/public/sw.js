const CACHE_NAME = 'coreline-shell-v3';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/coreline.svg',
  './assets/coreline/profile-codex/profile-shadow.webp',
  './assets/coreline/profile-codex/obsidian-vellum.webp',
  './assets/coreline/profile-codex/action-plate.webp',
  './assets/coreline/system-world/performance-still-life.webp',
];

async function cacheBuiltShell() {
  const cache = await caches.open(CACHE_NAME);
  const indexResponse = await fetch('./index.html', { cache: 'reload' });
  if (!indexResponse.ok) throw new Error('Unable to cache app shell');

  const markup = await indexResponse.clone().text();
  const linkedAssets = [...markup.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map(match => match[1])
    .filter(path => !path.startsWith('data:'))
    .map(path => new URL(path, self.registration.scope))
    .filter(url => url.origin === self.location.origin)
    .map(url => url.href);

  await cache.put(new URL('./index.html', self.registration.scope), indexResponse);
  await Promise.all([...new Set([...STATIC_ASSETS, ...linkedAssets])].map(asset => cache.add(asset)));
}

self.addEventListener('install', event => {
  event.waitUntil(cacheBuiltShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    })),
  );
});
