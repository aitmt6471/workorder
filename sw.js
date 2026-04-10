// AIT MRP — Service Worker (푸시 알림)
// 위치: /workorder/sw.js  |  scope: /workorder/

self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(clients.claim()); });

self.addEventListener('push', event => {
  let data = {
    title: '📦 자재 출고 확정 — AIT MRP',
    body: '새 자재 출고 확정이 등록되었습니다. 피더뷰를 확인하세요.',
    url: 'https://aitmt6471.github.io/workorder/feeder_view.html'
  };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch(e) {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(self.registration.showNotification(data.title, {
    body:    data.body,
    icon:    '/workorder/ait-logo.png',
    badge:   '/workorder/ait-logo.png',
    vibrate: [200, 100, 200],
    tag:     data.tag || 'ait-mrp',
    renotify: true,
    data:    { url: data.url },
    actions: [
      { action: 'open',    title: '피더뷰 열기' },
      { action: 'dismiss', title: '닫기' }
    ]
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const targetUrl = event.notification.data?.url || 'https://aitmt6471.github.io/workorder/feeder_view.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('/workorder') && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
