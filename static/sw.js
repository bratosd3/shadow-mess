// =============================================================================
// Shadow Mess — Service Worker (PWA + Push Notifications + Caching)
// =============================================================================

const CACHE_NAME = 'shadow-mess-v35';
const ASSETS = [
  '/',
  '/static/icons/icon.svg',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/manifest.json',
  '/static/css/style.css',
  '/static/js/app.js',
  '/static/js/calls.js'
];

// ── Install: cache core assets ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first for everything (fresh content), cache fallback offline ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET, socket.io, API
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/socket.io')) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request).then(resp => {
      if (resp && resp.status === 200) {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      }
      return resp;
    }).catch(() => caches.match(event.request))
  );
});

// ── Push notifications — heads-up style ──
self.addEventListener('push', event => {
  let data = { title: 'Shadow Message', body: 'Новое сообщение', icon: '/static/icons/icon-192.png' };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  // Determine urgency from type
  const isCall = data.type === 'call';

  const options = {
    body: data.body,
    icon: data.icon || '/static/icons/icon-192.png',
    badge: '/static/icons/icon-192.png',
    vibrate: isCall ? [300, 100, 300, 100, 300] : [200, 100, 200],
    data: {
      url: data.url || '/',
      chatId: data.chatId || null,
      type: data.type || 'message'
    },
    actions: isCall
      ? [{ action: 'open', title: 'Ответить' }, { action: 'close', title: 'Отклонить' }]
      : [{ action: 'open', title: 'Открыть' }, { action: 'close', title: 'Закрыть' }],
    tag: data.tag || 'shadow-mess-notification',
    renotify: true,
    requireInteraction: true,
    silent: false
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ── Notification click ──
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const notifData = event.notification.data || {};
  const isCall = notifData.type === 'call';

  if (event.action === 'close') {
    // If declining a call, message the client to reject
    if (isCall) {
      event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
          for (const client of clientList) {
            if (client.url.includes(self.location.origin)) {
              client.postMessage({ type: 'call_reject_from_notification', callFrom: notifData.callFrom });
              return;
            }
          }
        })
      );
    }
    return;
  }

  // 'open' action or default click
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Try to find existing window and focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          // Tell client to show incoming call UI / accept
          if (isCall) {
            client.postMessage({ type: 'call_answer_from_notification', callFrom: notifData.callFrom });
          }
          return client.focus();
        }
      }
      // Open new window with call hint
      const url = isCall ? `/?answerCall=${notifData.callFrom || ''}` : (notifData.url || '/');
      return clients.openWindow(url);
    })
  );
});
