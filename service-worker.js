const CACHE_NAME = 'stock-app-cache-v1';
const urlsToCache = [
  const urlsToCache = [
  '/stock_onu/index.html' // Seulement l'index.html
];
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('Failed to add URLs to cache:', error); // Log d'erreur plus détaillé
        // Vous pouvez choisir de rejeter le promise ici pour signaler l'échec de l'installation
        // throw error; 
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        // Cloner la requête pour pouvoir la réutiliser après la réponse
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(
          response => {
            // Vérifier si nous avons reçu une réponse valide
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Cloner la réponse car elle ne peut être consommée qu'une seule fois
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
