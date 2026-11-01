/* Чернила — офлайн-чтение. Стратегия «сначала сеть, потом кеш»:
   онлайн всегда свежая версия, офлайн — посещённые страницы.
   Чтобы сбросить кеш у всех, увеличь номер в CACHE. */
const CACHE = 'chernila-v2';
const CORE = ['./', 'index.html', 'app.css', 'app.js', 'data.js', 'store.js', 'supabase-config.js', 'manifest.webmanifest', 'style.css', 'script.js', 'visuals.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(()=>{}).then(()=>self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
const isFont = u => u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (!same && !isFont(url)) return; // Supabase и прочее — напрямую
  if (isFont(url)) {
    e.respondWith(caches.open(CACHE).then(cache => cache.match(req).then(hit => {
      const net = fetch(req).then(r => { if (r.ok || r.type==='opaque') cache.put(req, r.clone()); return r; }).catch(()=>hit);
      return hit || net;
    }))); return;
  }
  e.respondWith(fetch(req).then(r => { if (r.ok && r.type==='basic') { const cp=r.clone(); caches.open(CACHE).then(c=>c.put(req,cp)); } return r; })
    .catch(() => caches.match(req).then(hit => hit || (req.mode==='navigate' ? caches.match('index.html') : Response.error()))));
});
