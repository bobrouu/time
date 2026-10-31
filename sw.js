// Offline support: serves the app from cache instantly and refreshes the cache in the
// background, so a new deployment is picked up on the next launch. Bump VERSION when
// the ASSETS list changes.
const VERSION = 'v0.3.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/model.js',
  './js/store.js',
  './js/ui.js',
  './js/stats.js',
  './js/sync.js',
  './js/views/week.js',
  './js/views/day.js',
  './js/views/plan.js',
  './js/views/sheet.js',
  './js/views/settings.js',
  './js/views/stats.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(e.request, { ignoreSearch: true });
      const update = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => hit ?? Response.error());
      if (hit) e.waitUntil(update.then(() => undefined));
      return hit || update;
    }),
  );
});
