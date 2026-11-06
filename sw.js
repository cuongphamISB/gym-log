// Offline-first app shell. Bump VERSION on every deploy.
const VERSION = 'gymlog-v1.1.0';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/logic.js', 'js/seed.js', 'js/store.js', 'js/coach.js', 'js/health.js', 'js/app.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
];
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(SHELL);
    // exercise images: best effort
    try { const seed = await (await fetch('js/seed.js')).text(); const imgs = [...seed.matchAll(/"(img\/[^"]+)"/g)].map(m => m[1]); await c.addAll([...new Set(imgs)]); } catch (err) { /* ignore */ }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // AI API calls etc. go straight to network
  // Stale-while-revalidate: instant + offline from cache, refreshed in the background for the next launch.
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    const key = req.mode === 'navigate' ? 'index.html' : req;
    const hit = await c.match(key, { ignoreSearch: true });
    const net = fetch(req, { cache: 'no-cache' }).then(res => { if (res.ok) c.put(key, res.clone()); return res; });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    try { return await net; } catch (err) { return Response.error(); }
  })());
});
