self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Habit Stacker';
  const body = data.body || 'You have a new achievement.';
  const url = data.url || '/habits/achievements.html';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/img/habit_stacker_icon.png',
      badge: '/img/habit_stacker_icon.png',
      data: { url }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/habits/achievements.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url && 'focus' in client) {
          client.focus();
          if (client.navigate) return client.navigate(url);
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'SHOW_NOTIFICATION') return;
  event.waitUntil(
    self.registration.showNotification(data.title || 'Habit Stacker', {
      body: data.body || '',
      icon: '/img/habit_stacker_icon.png',
      badge: '/img/habit_stacker_icon.png',
      data: { url: data.url || '/habits/achievements.html' }
    })
  );
});
