const CACHE_VERSION = 'tabaja-v12.9.3.19-paid-access-admin-create';
const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=12.9.3.19',
  './app.js?v=12.9.3.19',
  './cloud.js?v=12.9.3.18',
  './v8-ui.js?v=12.9.3.9',
  './employee-manager.js?v=12.9.3.18',
  './activity-store.js?v=12.9.3.18',
  './command-center.js?v=12.9.3.18',
  './pwa.js?v=12.9.3.18',
  './nfc-studio.js?v=12.9.3-local-pwa',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, fallback) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return (await caches.match(request)) || (fallback ? await caches.match(fallback) : Response.error());
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }
  if (sameOrigin && /\.(?:html|css|js)$/.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response && (response.status === 200 || response.type === 'opaque')) {
      caches.open(CACHE_VERSION).then(cache => cache.put(request, response.clone()));
    }
    return response;
  })));
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
