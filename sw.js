// sw.js
const CACHE_NAME = 'onu-stock-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './xlsx.full.min.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  // réseau d’abord pour les API, cache d’abord pour statiques
  if (request.url.includes('script.google.com/macros/')) {
    e.respondWith(fetch(request).catch(() => caches.match(request)));
  } else {
    e.respondWith(caches.match(request).then(r => r || fetch(request)));
  }
});
