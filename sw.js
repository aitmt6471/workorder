// AIT 출고요청 PWA 서비스워커
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// 푸시 수신 → 알림 표시 (서버 푸시 연동 시 동작)
self.addEventListener('push', (e) => {
  let data = { title: '출고요청', body: '새 출고요청이 도착했습니다' };
  try { if (e.data) data = Object.assign(data, e.data.json()); } catch (_) {}
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    vibrate: [120, 60, 120],
    data: { url: 'shipping.html' }
  }));
});

// 알림 클릭 → 출고요청 화면 열기/포커스
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if (c.url.includes('shipping.html') && 'focus' in c) return c.focus(); }
    if (clients.openWindow) return clients.openWindow('shipping.html');
  })());
});
