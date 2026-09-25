// GTC Sports service worker v3 — network-first para HTML, cache-first para logos/estáticos
const CACHE='gtc-v3';
const IMG='gtc-img-v1';
const CORE=['/','/index.html','/manifest.webmanifest','/icon-192.png','/icon-512.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE).catch(()=>{})));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE&&k!==IMG).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  // Logos e imágenes de Supabase Storage -> cache-first (inmutables). Carga instantánea tras la 1ra vez.
  if(url.hostname.indexOf('supabase')>=0 && url.pathname.indexOf('/storage/v1/object/public/')>=0){
    e.respondWith(caches.open(IMG).then(c=>c.match(req).then(hit=>{
      const net=fetch(req).then(r=>{if(r&&r.ok)c.put(req,r.clone());return r;}).catch(()=>hit);
      return hit||net;
    })));
    return;
  }
  // API de Supabase (datos) -> siempre red, sin cache
  if(url.pathname.startsWith('/api/')||url.hostname.indexOf('supabase')>=0)return;
  // Documento -> network-first con fallback a cache
  if(req.mode==='navigate'||req.destination==='document'){
    e.respondWith(fetch(req).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put('/',cp)).catch(()=>{});return r;}).catch(()=>caches.match('/').then(m=>m||caches.match('/index.html'))));
    return;
  }
  // Otros estáticos del mismo origen -> cache-first
  e.respondWith(caches.match(req).then(m=>m||fetch(req).then(r=>{if(url.origin===location.origin&&r&&r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put(req,cp)).catch(()=>{});}return r;}).catch(()=>m)));
});
