/* Nobody came — офлайн-чтение.
   Стратегия «сначала сеть, потом кеш»: пока сайт онлайн, читатель всегда получает свежую версию
   (новые главы не залипают в кеше), а без сети открываются уже посещённые страницы.
   Чтобы сбросить кеш у всех, увеличь номер в CACHE. */
const CACHE = 'nobody-v12';
const CORE = ['./', 'index.html', 'style.css', 'script.js', 'visuals.js', 'manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {}).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('nobody-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isFont = url => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;   // аудио и частичные запросы не трогаем
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !isFont(url)) return;                         // Supabase и прочее — напрямую
  if (sameOrigin && /\/(?:book3(?:-final-voice)?\.html|book3-(?:gate|vault)\.js|final-voice-with-shot-balanced-2\.mp3)$/.test(url.pathname)) {
    event.respondWith(fetch(req, {cache:'no-store'}).catch(() => new Response('Закрытая история недоступна без сети.', {status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})));
    return;
  }
  if (sameOrigin && /^\/?(.*\/)?audio\//.test(url.pathname)) return;
  if (sameOrigin && /reviews-admin|secret/.test(url.pathname)) return;

  // Шрифты: берём из кеша, а обновляем в фоне.
  if (isFont(url)) {
    event.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(req).then(hit => {
          const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => hit);
          return hit || net;
        })
      )
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))
      )
  );
});
