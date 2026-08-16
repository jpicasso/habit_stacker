/**
 * Daily achievement notification + unread badges for the installed PWA.
 * Loaded on every page (layout). Requires window.appAuth from supabase-auth.js.
 */
(function () {
  const SEEN_KEY = 'hs_inbox_seen_date';
  const UNREAD_COUNT_KEY = 'hs_inbox_unread_count';

  function todayLocalYmd() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function isInstalledPwa() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function isAchievementsPage() {
    return /\/habits\/achievements\.html(?:[?#]|$)/.test(window.location.pathname);
  }

  function setUnreadCount(n) {
    const count = Math.max(0, parseInt(n, 10) || 0);
    if (count > 0) {
      localStorage.setItem(UNREAD_COUNT_KEY, String(count));
    } else {
      localStorage.removeItem(UNREAD_COUNT_KEY);
    }
    renderBadges();
  }

  function unreadCount() {
    return Math.max(0, parseInt(localStorage.getItem(UNREAD_COUNT_KEY) || '0', 10) || 0);
  }

  function markInboxSeen() {
    localStorage.setItem(SEEN_KEY, todayLocalYmd());
    setUnreadCount(0);
    if (navigator.clearAppBadge) {
      navigator.clearAppBadge().catch(() => {});
    }
  }

  function renderBadges() {
    const count = unreadCount();
    document.querySelectorAll('.nav-badge').forEach((el) => {
      if (count > 0) {
        el.hidden = false;
        el.textContent = String(count);
      } else {
        el.hidden = true;
      }
    });
    if (count > 0 && navigator.setAppBadge) {
      navigator.setAppBadge(count).catch(() => {});
    } else if (count === 0 && navigator.clearAppBadge) {
      navigator.clearAppBadge().catch(() => {});
    }
  }

  window.markInboxSeen = markInboxSeen;
  window.renderInboxBadges = renderBadges;

  async function markAchievementsReadOnServer() {
    const { token } = await getAuthContext();
    if (!token) return;
    await fetch('/api/achievements/read', {
      method: 'POST',
      headers: authHeaders(token),
      keepalive: true
    });
  }

  window.markAchievementsReadOnServer = markAchievementsReadOnServer;

  async function clearShownNotifications() {
    if (navigator.clearAppBadge) {
      await navigator.clearAppBadge().catch(() => {});
    }
    const reg = navigator.serviceWorker && navigator.serviceWorker.ready
      ? await navigator.serviceWorker.ready.catch(() => null)
      : null;
    if (reg && reg.getNotifications) {
      const notes = await reg.getNotifications();
      notes.forEach((n) => n.close());
    }
  }

  /**
   * Test helper: wipe today's daily achievement + badges, then run the
   * new-day flow (create achievement, red 1, OS notification).
   */
  async function testNotifications() {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }

    const { token } = await getAuthContext();
    if (!token) {
      throw new Error('Log in first to test notifications.');
    }

    await registerServiceWorker();
    await clearShownNotifications();

    localStorage.removeItem(SEEN_KEY);
    localStorage.removeItem(UNREAD_COUNT_KEY);
    renderBadges();

    const resetRes = await fetch('/api/achievements/daily/reset', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ date: todayLocalYmd() })
    });
    const resetData = await resetRes.json().catch(() => ({}));
    if (!resetRes.ok) {
      throw new Error(resetData.error || 'Failed to clear today’s notification.');
    }

    const response = await fetch('/api/achievements/daily', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ date: todayLocalYmd() })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.details || data.error || 'Failed to create the test notification.');
    }

    setUnreadCount(data.newCount);
    await showLocalNotification(data.message);
    renderBadges();

    try {
      await subscribeToPush(token, true);
    } catch (err) {
      console.warn('Push subscribe failed:', err);
    }

    return data;
  }

  window.testNotifications = testNotifications;

  async function getAuthContext() {
    try {
      if (!window.appAuth) return { token: null };
      const session = await window.appAuth.getSession();
      if (!session) return { token: null };
      return { token: session.access_token || null };
    } catch (err) {
      return { token: null };
    }
  }

  function authHeaders(token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    return headers;
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      return await navigator.serviceWorker.register('/sw.js');
    } catch (err) {
      console.warn('Service worker registration failed:', err);
      return null;
    }
  }

  async function showLocalNotification(message) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = navigator.serviceWorker && navigator.serviceWorker.ready
      ? await navigator.serviceWorker.ready.catch(() => null)
      : null;
    if (reg && reg.showNotification) {
      await reg.showNotification('Habit Stacker', {
        body: message,
        icon: '/img/habit_stacker_icon.png',
        badge: '/img/habit_stacker_icon.png',
        data: { url: '/habits/achievements.html' }
      });
      return;
    }
    new Notification('Habit Stacker', { body: message, icon: '/img/habit_stacker_icon.png' });
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i += 1) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function subscribeToPush(token, force) {
    if (!force && !isInstalledPwa()) return;
    if (!('Notification' in window) || !('PushManager' in window)) return;
    if (Notification.permission === 'denied') return;

    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
    }

    const reg = await navigator.serviceWorker.ready.catch(() => null);
    if (!reg || !reg.pushManager) return;

    const keyRes = await fetch('/api/push/vapid-public-key');
    if (!keyRes.ok) return;
    const { publicKey } = await keyRes.json();
    if (!publicKey) return;

    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ subscription })
    });
  }

  async function runDailyCheck() {
    const { token } = await getAuthContext();
    if (!token) {
      setUnreadCount(0);
      return;
    }

    await registerServiceWorker();

    try {
      const response = await fetch('/api/achievements/daily', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ date: todayLocalYmd() })
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        if (isAchievementsPage()) {
          markInboxSeen();
          markAchievementsReadOnServer().catch(() => {});
        } else {
          setUnreadCount(data.newCount);
        }
        if (data.created && !data.pushSent) {
          await showLocalNotification(data.message);
        }
      }
    } catch (err) {
      console.warn('Daily achievement check failed:', err);
    }

    renderBadges();

    try {
      await subscribeToPush(token);
    } catch (err) {
      console.warn('Push subscribe failed:', err);
    }

    const tapOnce = () => {
      document.removeEventListener('click', tapOnce, true);
      subscribeToPush(token).catch(() => {});
    };
    document.addEventListener('click', tapOnce, true);
  }

  function waitForAuthAndRun() {
    let tries = 0;
    const tick = async () => {
      if (window.appAuth) {
        const session = await window.appAuth.getSession();
        if (session) runDailyCheck();
        else {
          setUnreadCount(0);
          renderBadges();
        }
        return;
      }
      tries += 1;
      if (tries < 25) setTimeout(tick, 200);
    };
    tick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      renderBadges();
      waitForAuthAndRun();
    });
  } else {
    renderBadges();
    waitForAuthAndRun();
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href*="achievements.html"]');
    if (!link) return;
    markInboxSeen();
    markAchievementsReadOnServer().catch((err) => {
      console.warn('Failed to mark achievements read:', err);
    });
  });
})();
