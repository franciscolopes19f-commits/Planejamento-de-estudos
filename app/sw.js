// Service worker: permite abrir o app sem internet (cache dos arquivos estáticos).
const VERSION = 'rumo-v1';
const ASSETS = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'icons/icon-512.png', 'data/radar.json',
  'js/main.js', 'js/store.js', 'js/seed.js', 'js/demo.js', 'js/time.js', 'js/ui.js', 'js/radar.js', 'js/planner.js', 'js/stats.js', 'js/alerts.js', 'js/timer.js', 'js/sync.js',
  'js/views/today.js', 'js/views/plan.js', 'js/views/study.js', 'js/views/contests.js', 'js/views/evolution.js', 'js/views/reviews.js',
  'js/views/subjects.js', 'js/views/routine.js', 'js/views/settings.js', 'js/views/more.js'];

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Radar: rede primeiro (dados atualizados), cache como reserva. Demais arquivos: rede primeiro, cache offline.
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => cs[0] ? cs[0].focus() : self.clients.openWindow('./#/hoje')));
});
