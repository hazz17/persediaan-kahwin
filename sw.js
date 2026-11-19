const CACHE = 'kahwin-v16';
const ASSETS = ['./', './index.html', './manifest.json', './sync.js?v=1', './firebase-config.js',
  './icons/icon-192.png?v=7', './icons/icon-512.png?v=7', './icons/icon-180.png?v=7', './icons/icon-maskable.png?v=7'];
// Fail luar yang boleh disimpan untuk guna tanpa internet: font Google & SDK Firebase.
const CACHEABLE_EXTERNAL = /fonts\.(googleapis|gstatic)\.com|www\.gstatic\.com\/firebasejs\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Halaman: rangkaian dahulu (supaya kemas kini muncul). Fail app & luar yang dibenarkan: cache dahulu.
// Permintaan lain (cth. aliran langsung Firestore/Auth) tidak disentuh langsung.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const sameOrigin = req.url.startsWith(self.location.origin);
  if (!sameOrigin && !CACHEABLE_EXTERNAL.test(req.url)) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  }).catch(() => hit)));
});
