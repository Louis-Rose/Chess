// Self-destructing service worker.
//
// The PWA/offline layer was retired. A previously-installed service worker can
// keep serving a stale index.html that points at hashed chunk filenames which
// no longer exist on the server — every chunk then 404s into the SPA fallback
// (text/html) and the app fails to boot. This SW exists only to unregister any
// installed worker, wipe its caches, and reload open tabs cleanly.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.registration.unregister();
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((c) => c.navigate(c.url));
  })());
});
