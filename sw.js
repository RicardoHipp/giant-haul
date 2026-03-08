// Version: 1.0.42
// Importiert die zentrale Versionsnummer
importScripts('version.js');

const CACHE_NAME = 'titan-haul-' + APP_VERSION;
const ASSETS = [
  'index.html',
  'style.css',
  'script.js',
  'manifest.json',
  'version.js',
  'https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;700;900&family=Share+Tech+Mono&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Zwingt den neuen SW, nicht auf das Schließen der Tabs zu warten
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(), // Übernimmt sofort die Kontrolle über alle offenen Tabs
      caches.keys().then((keys) => {
        return Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        );
      })
    ])
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

// Fetch Event (Network First für HTML, Cache First für andere Assets)
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});