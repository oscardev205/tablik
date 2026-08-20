self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'AFFICHER_NOTIFICATION') {
    const { titre, corps, url } = event.data;
    self.registration.showNotification(titre, {
      body: corps || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      vibrate: [120, 60, 120],
      tag: 'tablik-notif',
      renotify: true,
      data: { url: url || '/' }
    });
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlCible = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((listeClients) => {
      for (const client of listeClients) {
        if (client.url.includes(urlCible) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlCible);
      }
    })
  );
});