const CACHE_NAME = 'rivetone-static-v071';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('rivetone-') && k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Cache only the explicitly listed public shell assets. Never cache Supabase,
  // authenticated responses, document downloads, or arbitrary same-origin URLs.
  if (event.request.headers.has('authorization') || event.request.headers.has('apikey')) return;
  if (!ASSETS.some(asset => {
    const allowed = new URL(asset, self.registration.scope);
    return allowed.origin === url.origin && allowed.pathname === url.pathname;
  })) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (!response.ok || response.type !== 'basic') return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.open(CACHE_NAME).then(cache => cache.match(event.request)).then(r => r || Response.error()))
  );
});
