// Bandlager Service Worker
// Wichtig: alle Pfade sind RELATIV (kein führendes "/"), damit das auch funktioniert,
// wenn die Seite unter einem Unterordner läuft (z.B. https://user.github.io/bandlager/).
//
// CACHE_NAME bei jeder inhaltlichen Änderung an index.html/CSS/JS HOCHZÄHLEN (v2, v3, ...).
// Der Browser prüft sw.js selbst byteweise auf Änderungen — nur wenn sich DIESE Datei
// ändert, wird überhaupt ein Update erkannt. Ändert sich nur index.html, merkt der Browser
// das an sw.js NICHT von selbst. Die Versionsnummer hier ist der zuverlässigste Weg, ein
// Update zu erzwingen.
const CACHE_NAME = 'bandlager-cache-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  // cache.addAll() bricht bei EINEM einzigen fehlgeschlagenen Asset die komplette
  // Installation ab (z.B. wenn icon-512.png mal kurz nicht erreichbar ist) — dann bleibt
  // die App komplett ohne Offline-Cache stecken. Stattdessen jede Datei einzeln versuchen,
  // damit ein Ausreißer nicht die anderen (inkl. index.html) verhindert. cache:'reload'
  // sorgt dafür, dass hier wirklich frisch vom Netz geladen wird und nicht versehentlich
  // eine alte Version aus dem HTTP-Cache des Browsers landet.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        CORE_ASSETS.map((url) => fetch(url, { cache: 'reload' })
          .then((res) => { if(res && res.ok) return cache.put(url, res); })
          .catch((err) => { console.warn('SW: Konnte Asset nicht cachen, überspringe:', url, err); })
        )
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

// Erlaubt der Seite, ein wartendes Update sofort zu aktivieren (siehe registerSW() in
// index.html), statt dass man die App zweimal neu laden/schließen muss, bis es greift.
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // Nur GET-Requests innerhalb des eigenen Scopes behandeln, alles andere (z.B. YouTube-Embed,
  // externe Fonts/CDN-Skripte, MusicBrainz/lrclib-API-Aufrufe) unangetastet durchs Netzwerk
  // laufen lassen.
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // HTML-Seite selbst (Navigation) sowie index.html: NETWORK-FIRST. Das ist der eigentliche
  // Fix — vorher war das "cache-first mit Update im Hintergrund": man bekam bei JEDEM Aufruf
  // erst die alte, gecachte Version zu sehen, und die neue landete zwar im Cache, wurde aber
  // immer erst beim ÜBERNÄCHSTEN Laden sichtbar. Bei einer aktiv weiterentwickelten App
  // (wie hier) heißt das: Änderungen scheinen "nicht anzukommen", obwohl der Cache im
  // Hintergrund längst aktualisiert wurde. Jetzt: erst das Netz probieren, nur bei Fehler
  // (offline) auf den Cache zurückfallen.
  const isHTML = event.request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/');
  if (isHTML) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Statische Assets (Icons, Manifest etc.): weiterhin cache-first mit Hintergrund-Update —
  // hier ist Geschwindigkeit wichtiger als "sofort aktuell", diese Dateien ändern sich kaum.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached); // offline -> auf Cache zurückfallen
      return cached || networkFetch;
    })
  );
});
