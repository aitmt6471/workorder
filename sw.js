// AIT 출고요청 PWA 서비스워커
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// 푸시 수신 → 최신 라인 조회 후 '{라인}의 새 출고요청이 도착했습니다' 알림
const PUSH_LATEST_URL = 'https://aitechn8n.ngrok.app/webhook/ait/spec/push-latest';
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let line = '';
    // 푸시 payload에 line이 실려오면 우선 사용
    try { if (e.data) { const d = e.data.json(); if (d && d.line) line = d.line; } } catch (_) {}
    // payload 없으면 서버에서 최신 출고요청 라인 조회
    if (!line) {
      try {
        const r = await fetch(PUSH_LATEST_URL, { cache: 'no-store' });
        if (r.ok) { const j = await r.json(); line = (j && j.line) || ''; }
      } catch (_) {}
    }
    const body = line ? `${line}의 새 출고요청이 도착했습니다.` : '새 출고요청이 도착했습니다.';
    await self.registration.showNotification('출고요청', {
      body,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      vibrate: [120, 60, 120],
      data: { url: 'shipping.html' }
    });
  })());
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
