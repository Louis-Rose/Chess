// Service Worker for LUMRA PWA
const CACHE_NAME = 'lumna-coach-v4';
const STATIC_ASSETS = [
  '/manifest.json',
  '/favicon.svg'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - network first, fall back to cache
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Handle Web Share Target POST
  if (event.request.method === 'POST' && (url.pathname === '/share-target' || url.pathname === '/coach/share-target')) {
    event.respondWith(
      (async () => {
        const formData = await event.request.formData();
        const file = formData.get('image');
        // Store file temporarily so the page can pick it up
        const cache = await caches.open('share-target-temp');
        if (file) {
          const response = new Response(file, {
            headers: { 'Content-Type': file.type, 'X-File-Name': file.name },
          });
          await cache.put('/shared-image', response);
        }
        // Redirect to the scoresheet reader with a flag
        return Response.redirect('/scoresheets?shared=1', 303);
      })()
    );
    return;
  }

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Only handle http(s) — skip chrome-extension://, ws://, etc.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Skip API and PostHog calls - always fetch from network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ph/')) return;

  // Never cache navigations/HTML — index.html changes every deploy and
  // caching it would pin the app to old hashed chunk references.
  const isNavigation = event.request.mode === 'navigate';
  const accept = event.request.headers.get('accept') || '';
  if (isNavigation || accept.includes('text/html')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Hashed assets under /assets/ are immutable — safe to cache.
  // Everything else: network-first, fall back to cache offline.
  const isHashedAsset = url.pathname.startsWith('/assets/');

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (isHashedAsset && response.ok && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
