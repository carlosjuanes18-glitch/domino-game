// Service Worker para Dominó Clásico - Web Push & PWA
const CACHE_NAME = 'domino-cache-v24.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/game.js',
  '/js/domino-renderer.js',
  '/js/audio.js',
  '/js/avatars.js',
  '/images/domino-icon.svg',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Error precacheando algunos assets:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Manejo de notificaciones Push cuando la pestaña está cerrada
self.addEventListener('push', (event) => {
  let data = {
    title: '🀫 ¡Invitación a jugar Dominó!',
    body: 'Un amigo te ha invitado a una partida de Dominó.',
    data: { url: '/' }
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/images/domino-icon.svg',
    badge: '/images/domino-icon.svg',
    vibrate: [200, 100, 200],
    data: data.data || { url: '/' },
    actions: [
      { action: 'open', title: '🎮 Entrar a Jugar' }
    ],
    tag: 'game-invitation'
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Al tocar la notificación: abrir el juego en la sala invitada
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si ya hay una ventana abierta, enfocarla y navegar a la sala
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
