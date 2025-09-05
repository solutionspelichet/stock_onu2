// --- PWA ONU Stock: Service Worker ---
const VERSION = 'v1.0.3';
const BASE = self.registration.scope.replace(location.origin, '') || '/stock_onu2/';

// Tu peux ajuster la liste selon tes fichiers
const CORE_ASSETS = [
  `${BASE}`,
  `${BASE}index.html`,
  `${BASE}styles.css`,
  `${BASE}script.js`,
  `${BASE}manifest.webmanifest`,
  `${BASE}offline.html`,
  `${BASE}icons/icon-192.png`,
  `${BASE}icons/icon-512.png`,
  // Optionnel si tu as une copie locale :
  `${BASE}xlsx.full.min.js`
];

const CACHE_CORE  = `core-${VERSION}`;
const CACHE_RUNTIME = `rt-${VERSION}`;

// Pré-cache du shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_CORE).then(c => c.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Nettoyage anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => ![CACHE_CORE, CACHE_RUNTIME].includes(k))
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Utilitaires de stratégie
const isHTML = (req) => req.destination === 'document' || req.headers.get('accept')?.includes('text/html');
const isCDN  = (url) => /(?:cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)/.test(url.hostname);
const isAppsScript = (url) => /script\.google\.com$/.test(url.hostname);

// Réponse fallback (offline)
async function offlineResponse(request) {
  if (isHTML(request)) {
    const cache = await caches.open(CACHE_CORE);
    const page = await cache.match(`${BASE}offline.html`);
    if (page) return page;
  }
  // JSON fallback générique
  return new Response(JSON.stringify({ ok:false, offline:true }), {
    headers: { 'Content-Type': 'application/json' }, status: 503
  });
}

// Stratégies:
// - HTML: Network-first → fallback cache → offline.html
// - CDN libs (Chart.js, XLSX…): Cache-first → revalidate en arrière-plan
// - Apps Script API: Stale-While-Revalidate (garde la dernière réponse OK)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ne gère que GET
  if (req.method !== 'GET') return;

  if (isHTML(req)) {
    // Network-first pour pages
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        const cache = await caches.open(CACHE_RUNTIME);
        cache.put(req, net.clone());
        return net;
      } catch (_) {
        const cache = await caches.open(CACHE_RUNTIME);
        const hit = await cache.match(req);
        return hit || offlineResponse(req);
      }
    })());
    return;
  }

  if (isCDN(url)) {
    // Cache-first pour bibliothèques
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_RUNTIME);
      const hit = await cache.match(req);
      if (hit) {
        // rafraîchit en arrière-plan
        event.waitUntil(fetch(req).then(r => cache.put(req, r.clone())).catch(()=>{}));
        return hit;
      }
      try {
        const net = await fetch(req);
        cache.put(req, net.clone());
        return net;
      } catch (_) {
        return offlineResponse(req);
      }
    })());
    return;
  }

  if (isAppsScript(url)) {
    // Stale-While-Revalidate pour l’API
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_RUNTIME);
      const cached = await cache.match(req);
      try {
        const net = await fetch(req);
        // ne met en cache que si OK
        if (net && net.ok) cache.put(req, net.clone());
        return net;
      } catch (_) {
        if (cached) return cached;
        return offlineResponse(req);
      }
    })());
    return;
  }

  // Par défaut: try cache → network → offline
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_RUNTIME);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const net = await fetch(req);
      cache.put(req, net.clone());
      return net;
    } catch (_) {
      return offlineResponse(req);
    }
  })());
});
