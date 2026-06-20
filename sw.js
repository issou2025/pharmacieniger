const CACHE_NAME = 'pharma-niamey-v3';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './data/pharmacies.json'
];

// Installation : mise en cache des actifs essentiels
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Mise en cache des actifs de base');
        return cache.addAll(ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activation : nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Suppression de l\'ancien cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch : Stratégie Stale-While-Revalidate (Sert le cache immédiatement, puis met à jour en arrière-plan)
self.addEventListener('fetch', (event) => {
  // Ignorer les requêtes externes non GET (comme Google Maps API ou chrome-extension)
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Lancer une requête réseau en tâche de fond pour rafraîchir le cache
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch(() => {
            // Ignorer l'erreur hors-ligne
          });
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
