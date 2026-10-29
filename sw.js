// Service worker de NutriSafe: permite abrir la app sin conexión.
// Lo genera build_app.py; la versión cambia con cada publicación.
const VERSION = '34c348bd15';
const CORE = 'nutrisafe-core-' + VERSION;      // página, datos, iconos
const RUNTIME = 'nutrisafe-rt-v1';             // fuentes, iconos, librerías y el motor de lectura (se reutiliza entre versiones)
const PRECACHE = ["./", "data.117191e3ad.js", "manifest.webmanifest", "assets/icon.svg", "assets/icon-192.png", "assets/icon-512.png", "assets/icon-maskable-192.png", "assets/icon-maskable-512.png"];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CORE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('nutrisafe-core-') && k !== CORE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Recursos de terceros que se pueden guardar: fuentes, iconos y librerías (OCR, códigos de barras)
const CACHEABLE_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'tessdata.projectnaptha.com'];

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Página: primero la red (para tener siempre la última versión); sin conexión, la guardada
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(req, { signal: ctrl.signal }); clearTimeout(timer);
        if (res.ok) { const c = await caches.open(CORE); c.put('./', res.clone()); }
        return res;
      } catch (err) {
        return (await caches.match('./')) || (await caches.match('index.html')) || Response.error();
      }
    })());
    return;
  }

  if (url.origin === self.location.origin) {
    // Los modelos de PaddleOCR ya se guardan en su propia caché: no se duplican aquí
    if (url.pathname.includes('/models/')) return;
    // Datos con hash, iconos y motor de lectura: primero la caché
    if (/\/(data\.[0-9a-f]+\.js|assets\/|vendor\/|manifest\.webmanifest)/.test(url.pathname)) {
      e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(url.pathname.includes('/vendor/') ? RUNTIME : CORE).then(c => c.put(req, copy)); }
        return res;
      })));
    }
    return;
  }

  // Terceros: se usa lo guardado y se actualiza en segundo plano
  if (CACHEABLE_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(RUNTIME).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
  // El resto (Open Food Facts, USDA, sugerencias) va siempre a la red
});
