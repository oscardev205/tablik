self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Pas de mise en cache pour l'instant : l'appli a besoin du serveur pour fonctionner
  event.respondWith(fetch(event.request));
});