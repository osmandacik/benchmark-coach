// Offline support: caches the app files so it opens at the gym without signal.
// Bump VERSION when you change any file so phones pick up the new version.

const VERSION = 'v2';
const CACHE = `benchmark-coach-${VERSION}`;
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'js/app.js',
  'js/actions.js',
  'js/adapt.js',
  'js/audio.js',
  'js/coach.js',
  'js/store.js',
  'js/timer.js',
  'js/util.js',
  'js/data/benchmarks.js',
  'js/data/blocks.js',
  'js/data/calendar.js',
  'js/data/moves.js',
  'js/data/sessions.js',
  'js/views/bench.js',
  'js/views/change.js',
  'js/views/log.js',
  'js/views/plan.js',
  'js/views/profile.js',
  'js/views/session.js',
  'js/views/timer.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Serve from cache, refresh the cache in the background when online.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) return cached;
      const res = await network;
      if (res) return res;
      if (req.mode === 'navigate') return cache.match('index.html');
      return new Response('Offline', { status: 503 });
    }),
  );
});
