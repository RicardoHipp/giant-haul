// Version: 1.0.63
importScripts('version.js');

const CACHE_NAME = 'titan-haul-cache-v' + APP_VERSION;

const ASSETS = [
  'index.html',
  'style.css',
  'script.js',
  'manifest.json',
  'version.js'
];

self.addEventListener('install', (event) => {
  console.log('[SW] Installiere neue Version: ' + APP_VERSION);
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Aktiviere Version: ' + APP_VERSION);
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => {
        return Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => {
            console.log('[SW] Lösche alten Cache: ' + key);
            return caches.delete(key);
          })
        );
      })
    ])
  );
});

self.addEventListener('fetch', (event) => {
  // WICHTIG: Nur GET-Anfragen können gecacht werden!
  // Firebase nutzt POST, das ignorieren wir hier komplett.
  if (event.request.method !== 'GET') {
    return; 
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Wenn Netzwerk da, Cache aktualisieren
        if (response.status === 200) {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, resClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Wenn Offline, Cache nutzen
        console.log('[SW] Offline-Modus: Lade aus Cache: ' + event.request.url);
        return caches.match(event.request);
      })
  );
});