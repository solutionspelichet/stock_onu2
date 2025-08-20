const CACHE_NAME='stock-app-cache-v3';
const urlsToCache=['./','./index.html','./style.css','./script.js','./manifest.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(urlsToCache)))});
self.addEventListener('fetch',e=>{
  e.respondWith(
    caches.match(e.request).then(r=>r||fetch(e.request).then(nr=>{
      if(nr && nr.status===200 && nr.type==='basic'){
        const cpy=nr.clone(); caches.open(CACHE_NAME).then(c=>c.put(e.request,cpy));
      }
      return nr;
    }))
  );
});
self.addEventListener('activate',e=>{
  const wl=[CACHE_NAME];
  e.waitUntil(caches.keys().then(ns=>Promise.all(ns.map(n=>!wl.includes(n)&&caches.delete(n)))));
});
