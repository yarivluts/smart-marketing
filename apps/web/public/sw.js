/*
 * GrowthOS service worker: shows push notifications and opens the page they point at.
 * Deliberately minimal - no fetch handler and no offline cache, so a signed-in page is never
 * served from a stale copy. See apps/web/lib/push for the sending and subscribing side.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function safePath(url) {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && url.indexOf('\\') === -1 ? url : '/';
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'GrowthOS';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: typeof data.tag === 'string' ? data.tag : undefined,
      data: { url: safePath(data.url) },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url === target && 'focus' in client) return client.focus();
      }
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin && 'navigate' in client);
      if (open) {
        // navigate() refuses a tab this worker does not control yet; open a new one then.
        return open
          .focus()
          .then(() => open.navigate(target))
          .catch(() => self.clients.openWindow(target));
      }
      return self.clients.openWindow(target);
    }),
  );
});
