/* Bandlager — Service Worker
   Cacht die App-Hülle (HTML, Manifest, Icons), damit die App auch offline
   startet. Songs & Playlists selbst liegen bereits in IndexedDB und sind
   davon unabhängig immer verfügbar. */

const CACHE_NAME = 'bandlager-shell-v1';
const SHELL_URLS = [
  './',
  './musik-bibliothek.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        SHELL_URLS.map((url) => cache.add(url).catch(() => { /* einzelne fehlende Datei ignorieren */ }))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first für die App-Hülle, sonst normal ans Netz (z.B. Google Fonts, jsmediatags CDN).
self.addEventListener('fetch', (event) => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if(url.origin !== self.location.origin) return; // externe Ressourcen (CDN/Fonts) nicht cachen/abfangen

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if(cached) return cached;
      return fetch(event.request).then((response) => {
        if(response && response.ok){
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
