const CACHE_NAME = 'coreline-shell-v7';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/coreline-192.png',
  './icons/coreline-512.png',
  './icons/coreline-maskable-512.png',
  './icons/coreline-mark.webp',
  './icons/coreline-badge-96.png',
  './assets/coreline/profile-codex/profile-shadow.webp',
  './assets/coreline/profile-codex/obsidian-vellum.webp',
  './assets/coreline/profile-codex/action-plate.webp',
  './assets/coreline/system-world/performance-still-life.webp',
];

async function builtAssetsFromManifest() {
  try {
    const response = await fetch('./asset-manifest.json', { cache: 'reload' });
    if (!response.ok) return [];
    const manifest = await response.json();
    const paths = Object.values(manifest).flatMap(entry => [
      entry.file,
      ...(entry.css || []),
      ...(entry.assets || []),
    ]).filter(Boolean);
    return [...new Set(paths)].map(path => new URL(path, self.registration.scope).href);
  } catch {
    // Development servers do not emit a build manifest. Runtime caching still
    // keeps the local shell usable there.
    return [];
  }
}

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
  const builtAssets = await builtAssetsFromManifest();

  await cache.put(new URL('./index.html', self.registration.scope), indexResponse);
  await Promise.all([...new Set([...STATIC_ASSETS, ...linkedAssets, ...builtAssets])].map(asset => cache.add(asset)));
}

self.addEventListener('install', event => {
  event.waitUntil(cacheBuiltShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('coreline-shell-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
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

const REMINDER_CACHE = 'coreline-reminders';
const REMINDER_SCHEDULE_PATH = '__coreline/reminder-schedule.json';
const REMINDER_DELIVERY_PATH = '__coreline/reminder-delivery.json';

function reminderUrl(path) {
  return new URL(path, self.registration.scope).href;
}

async function readReminderJson(path, fallback) {
  try {
    const cache = await caches.open(REMINDER_CACHE);
    const response = await cache.match(reminderUrl(path));
    if (!response) return fallback;
    const value = await response.json();
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

async function writeReminderJson(path, value) {
  const cache = await caches.open(REMINDER_CACHE);
  await cache.put(reminderUrl(path), new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
  }));
}

function localDayKey(date) {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function minutesFromClock(value, fallback) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
  if (!match) return fallback;
  return Number(match[1]) * 60 + Number(match[2]);
}

function inQuietHours(nowMinutes, start, end) {
  const quietStart = minutesFromClock(start, 22 * 60);
  const quietEnd = minutesFromClock(end, 7 * 60);
  if (quietStart === quietEnd) return false;
  if (quietStart < quietEnd) return nowMinutes >= quietStart && nowMinutes < quietEnd;
  return nowMinutes >= quietStart || nowMinutes < quietEnd;
}

/**
 * Show the reminders that came due while the app was closed. The schedule is
 * written by the app; nothing here invents a reminder of its own.
 */
async function showDueReminders() {
  const schedule = await readReminderJson(REMINDER_SCHEDULE_PATH, null);
  if (!schedule || !Array.isArray(schedule.reminders) || !schedule.reminders.length) return;
  if (self.Notification && self.Notification.permission !== 'granted') return;

  const now = new Date();
  const stamp = now.getTime();
  if (Number(schedule.snoozedUntil) > stamp) return;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (inQuietHours(nowMinutes, schedule.quietStart, schedule.quietEnd)) return;

  const day = localDayKey(now);
  const delivered = await readReminderJson(REMINDER_DELIVERY_PATH, {});
  let changed = false;

  for (const reminder of schedule.reminders) {
    if (!reminder || typeof reminder.id !== 'string') continue;
    if (Array.isArray(reminder.days) && reminder.days.length && !reminder.days.includes(now.getDay())) continue;
    if (reminder.suppressedOn === day) continue;
    if (nowMinutes < minutesFromClock(reminder.time, 24 * 60)) continue;
    const key = `${reminder.id}:${day}`;
    if (delivered[key]) continue;

    await self.registration.showNotification(String(reminder.title || 'CORELINE'), {
      body: String(reminder.body || ''),
      tag: key,
      icon: './icons/coreline-192.png',
      badge: './icons/coreline-badge-96.png',
      data: { url: new URL(reminder.url || './', self.registration.scope).href },
    });
    delivered[key] = stamp;
    changed = true;
  }

  if (changed) {
    // Keep only the last two days so the record cannot grow without bound.
    const cutoff = stamp - 2 * 86_400_000;
    const pruned = Object.fromEntries(Object.entries(delivered).filter(([, at]) => Number(at) >= cutoff));
    await writeReminderJson(REMINDER_DELIVERY_PATH, pruned);
  }
}

self.addEventListener('periodicsync', event => {
  if (event.tag !== 'coreline-reminders') return;
  event.waitUntil(showDueReminders());
});

self.addEventListener('sync', event => {
  if (event.tag !== 'coreline-reminders') return;
  event.waitUntil(showDueReminders());
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'coreline-check-reminders') return;
  event.waitUntil(showDueReminders());
});

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = { body: event.data?.text() || '' }; }
  const title = payload.title || 'CORELINE';
  const url = new URL(payload.url || './', self.registration.scope).href;
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || '',
    tag: payload.tag || 'coreline-system',
    icon: './icons/coreline-192.png',
    badge: './icons/coreline-badge-96.png',
    data: { url },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'snooze', title: 'Snooze 1h' },
    ],
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const destinationUrl = new URL(event.notification.data?.url || './', self.registration.scope);
  if (event.action === 'snooze') destinationUrl.searchParams.set('pushAction', 'snooze');
  const destination = destinationUrl.href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(client => client.url.startsWith(self.registration.scope));
      if (existing) return existing.navigate(destination).then(client => client?.focus());
      return self.clients.openWindow(destination);
    }),
  );
});
