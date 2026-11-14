/* Service Worker — يخزّن التطبيق والمكتبات والخطوط للعمل بدون إنترنت */
const VERSION = 'v3';
const CORE = `core-${VERSION}`;
const RUNTIME = `runtime-${VERSION}`;

const CORE_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

const IMG_FILES = [
  './10867902.png',
  './1b579338.jpg',
  './26f0aff9.png',
  './295b90a4.jpg',
  './396fc83a.jpg',
  './6f81a770.jpg',
  './783282fd.jpg',
  './bf15b65a.jpg',
  './f0a4d315.jpg',
  './f82fcaaa.jpg',
  './fad32667.jpg',
  './fc21e166.jpg',
  './fd11f3f4.jpg'
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
