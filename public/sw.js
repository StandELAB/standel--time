/* StandEL Time PWA v0.32 */
// No offline database, no caching of authenticated pages or private API responses.
const VERSION = 'standel-static-v032';
const STATIC_PATHS = ['/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png', '/standel-logo.png'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(STATIC_PATHS)));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('standel-static-') && key !== VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode === 'navigate') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !STATIC_PATHS.includes(url.pathname)) return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
});
