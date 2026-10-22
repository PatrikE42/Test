/* Service Worker der Vereinskasse.
   Er speichert NUR die App-Dateien (damit die Kasse ohne Netz startet), niemals Bestellungen oder Verkaufsdaten.
   Strategie "Netz zuerst": Mit Netz kommen immer die neuesten Dateien (neue Preise!), ohne Netz die gespeicherte Kopie.
   Die Version kommt aus der Registrierung (?v=...) und stammt aus KONFIG.version in app.js; alte Caches werden gelöscht. */
'use strict';
const VERSION = new URL(self.location).searchParams.get('v') || '0';
const CACHE = 'vereinskasse-' + VERSION;
const DATEIEN = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.json',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(DATEIEN.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('vereinskasse-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then(res => { if (res.ok) { const kopie = res.clone(); caches.open(CACHE).then(c => c.put(req, kopie)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
