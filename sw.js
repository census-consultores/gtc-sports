// GTC Sports service worker — network-first para HTML, cache para estáticos
const CACHE='gtc-v1';
const CORE=['/','/index.html','/manifest.webmanifest','/icon-192.png','/icon-512.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE).catch(()=>{})));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET'){return;}
  const url=new URL(req.url);
  // nunca cachear API ni supabase
  if(url.pathname.startsWith('/api/')||url.hostname.indexOf('supabase')>=0){return;}
  if(req.mode==='navigate'||req.destination==='document'){
    e.respondWith(fetch(req).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put('/',cp)).catch(()=>{});return r;}).catch(()=>caches.match('/').then(m=>m||caches.match('/index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(m=>m||fetch(req).then(r=>{if(url.origin===location.origin){const cp=r.clone();caches.open(CACHE).then(c=>c.put(req,cp)).catch(()=>{});}return r;}).catch(()=>m)));
});
