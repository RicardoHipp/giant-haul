// Version: 1.0.43
importScripts('version.js');

const CACHE_NAME = 'titan-haul-cache-v' + APP_VERSION;

// Dateien, die für den Offline-Modus gespeichert werden
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
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => {
        return Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        );
      })
    ])
  );
});

// RADIKALER NETWORK-FIRST ANSATZ
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Wenn Netzwerk erfolgreich, Kopie im Cache aktualisieren
        const resClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, resClone);
        });
        return response;
      })
      .catch(() => {
        // Nur wenn Netzwerk fehlschlägt (Offline), Cache nutzen
        return caches.match(event.request);
      })
  );
});