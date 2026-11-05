/* Чернила — офлайн-чтение. Стратегия «сначала сеть, потом кеш»:
   онлайн всегда свежая версия, офлайн — посещённые страницы.
   Чтобы сбросить кеш у всех, увеличь номер в CACHE. */
const CACHE = 'chernila-v23';
const CORE = ['./', 'index.html', 'app.css', 'story-fonts.css', 'story-designer.css', 'workshop-freedom.css', 'workshop-freedom.js', 'cover-studio.js', 'app.js', 'text-format.js', 'story-tools.js', 'visual-editor.js', 'writer.js', 'workshop-tools.js', 'profile-tools.js', 'theme-tools.js', 'data.js', 'store.js', 'supabase-config.js', 'manifest.webmanifest', 'style.css', 'script.js', 'visuals.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(()=>{}).then(()=>self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
const isFont = u => u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (!same && !isFont(url)) return; // Supabase и прочее — напрямую
  // Never return an old plaintext book/audio from an offline cache.
  if (same && /\/(?:book3(?:-final-voice)?(?:\.html)?|final-voice-with-shot-balanced-2\.mp3)$/.test(url.pathname)) {
    e.respondWith(fetch(req,{cache:'no-store'}).catch(()=>new Response('Закрытая история недоступна без сети.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})));
    return;
  }
  if (isFont(url)) {
    e.respondWith(caches.open(CACHE).then(cache => cache.match(req).then(hit => {
      const net = fetch(req).then(r => { if (r.ok || r.type==='opaque') cache.put(req, r.clone()); return r; }).catch(()=>hit);
      return hit || net;
    }))); return;
  }
  e.respondWith(fetch(req).then(r => { if (r.ok && r.type==='basic') { const cp=r.clone(); caches.open(CACHE).then(c=>c.put(req,cp)); } return r; })
    .catch(() => caches.match(req).then(hit => hit || (req.mode==='navigate' ? caches.match('index.html') : Response.error()))));
});
