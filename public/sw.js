// Service Worker para Dominó Clásico - Web Push & PWA
const CACHE_NAME = 'domino-cache-v41.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/game.js',
  '/js/domino-renderer.js',
  '/js/audio.js',
  '/js/avatars.js',
  '/favicon.ico',
  '/images/domino-icon.svg',
  '/images/icon-192.png',
  '/images/icon-512.png',
  '/images/icon-maskable-512.png',
  '/images/apple-touch-icon.png',
  '/images/favicon.png',
  '/images/app-matrix-domino.jpg',
  '/manifest.json',
  '/audio/bomba-tiempo.mp3',
  '/images/avatars/avatar_1.png',
  '/images/avatars/avatar_2.png',
  '/images/avatars/avatar_3.png',
  '/images/avatars/avatar_4.png',
  '/images/avatars/avatar_5.png',
  '/images/avatars/avatar_6.png',
  '/images/avatars/avatar_7.png',
  '/images/avatars/avatar_8.png',
  '/images/avatars/avatar_9.png',
  '/images/avatars/avatar_10.png',
  '/images/avatars/avatar_11.png',
  '/images/avatars/avatar_12.png',
  '/images/avatars/avatar_13.png',
  '/images/avatars/avatar_14.png',
  '/images/avatars/avatar_15.png',
  '/images/avatars/avatar_16.png'
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
    icon: '/images/icon-192.png',
    badge: '/images/favicon.png',
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

