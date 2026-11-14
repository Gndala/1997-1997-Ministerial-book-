/* Service Worker — يخزّن التطبيق والمكتبات والخطوط للعمل بدون إنترنت */
const VERSION = 'v2';
const CORE = `core-${VERSION}`;
const RUNTIME = `runtime-${VERSION}`;

const CORE_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

const IMG_FILES = [
  './img/10867902.png',
  './img/1b579338.jpg',
  './img/26f0aff9.png',
  './img/295b90a4.jpg',
  './img/396fc83a.jpg',
  './img/6f81a770.jpg',
  './img/783282fd.jpg',
  './img/bf15b65a.jpg',
  './img/f0a4d315.jpg',
  './img/f82fcaaa.jpg',
  './img/fad32667.jpg',
  './img/fc21e166.jpg',
  './img/fd11f3f4.jpg'
];

const CDN_FILES = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Cairo:wght@600;700;800;900&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const core = await caches.open(CORE);
    // كل ملف على حدة: غياب ملف واحد لا يُفشل التثبيت
    await Promise.all(CORE_FILES.concat(IMG_FILES).map(async f => { try { await core.add(f); } catch (e) {} }));
    // المكتبات الخارجية: إن فشل أحدها لا يفشل التثبيت
    const rt = await caches.open(RUNTIME);
    await Promise.all(CDN_FILES.map(async url => {
      try {
        const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if (res.ok) {
          await rt.put(url, res.clone());
          // خطوط جوجل: خزّن ملفات الخط المشار إليها في ملف CSS
          if (url.includes('fonts.googleapis.com')) {
            const css = await res.text();
            const files = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)].map(m => m[1]);
            await Promise.all(files.map(async f => {
              try {
                const r = await fetch(f, { mode: 'cors', credentials: 'omit' });
                if (r.ok) await rt.put(f, r);
              } catch (e) {}
            }));
          }
        }
      } catch (e) {}
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = [CORE, RUNTIME];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // صفحات التطبيق: الشبكة أولاً (لأخذ آخر تحديث) ثم النسخة المخزّنة
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(CORE);
        c.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match('./index.html')) || (await caches.match('./'));
      }
    })());
    return;
  }

  // باقي الملفات (محلية + مكتبات + خطوط): المخزّن أولاً ثم الشبكة مع الحفظ
  const cacheable = url.origin === location.origin ||
    /cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url.hostname);
  if (!cacheable) return;

  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: false });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) {
        const rt = await caches.open(RUNTIME);
        rt.put(req, res.clone());
      }
      return res;
    } catch (e) {
      return hit || Response.error();
    }
  })());
});
