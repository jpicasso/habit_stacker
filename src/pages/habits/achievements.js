/**
 * Achievements page: TikTok-style inbox of rows from GET /api/achievements.
 * Displays `achievement` (description) and relative `date`.
 */

async function getAuthContext() {
  try {
    if (window.appAuth) {
      const session = await window.appAuth.getSession();
      if (session) {
        return {
          id: session.user?.id || null,
          email: session.user?.email || null,
          token: session.access_token || null
        };
      }
    }
  } catch (authError) {
    console.error('Error getting current user:', authError);
  }
  return { id: null, email: null, token: null };
}

function authHeaders(token, extra = {}) {
  const headers = { ...extra };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}

function parseAchievementDate(dateValue) {
  if (!dateValue) return null;
  const raw = String(dateValue);
  const ymd = raw.slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(ymd)
    ? new Date(ymd + 'T00:00:00')
    : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function achievementDateSortValue(dateValue) {
  const date = parseAchievementDate(dateValue);
  return date ? date.getTime() : 0;
}

function achievementText(row) {
  if (row.achievement) return String(row.achievement);
  const name = row.habit_name ? String(row.habit_name) : 'your habit';
  const type = String(row.type || '');
  const messages = {
    White: `Congrats on creating a new habit - ${name}`,
    Yellow: `Congrats on keeping your new habit for 24 hours - ${name}`,
    Orange: `Congrats on keeping your new habit for 2 weeks - ${name}`,
    Green: `Congrats on keeping your new habit for 1 month - ${name}`,
    Blue: `Congrats on keeping your new habit for 2 months - ${name}`,
    Brown: `Congrats on keeping your new habit for 3 months - ${name}`,
    Red: `Congrats on keeping your new habit for 6 month - ${name}`,
    Black: `Congrats on keeping your new habit for 12 months - ${name}`
  };
  return messages[type] || `You have a new achievement - ${name}`;
}

function formatAchievementReceivedDate(dateValue) {
  const date = parseAchievementDate(dateValue);
  if (!date) return '';
  const d = date.getDate();
  const mmm = date.toLocaleDateString('en-US', { month: 'short' });
  if (date.getFullYear() === new Date().getFullYear()) {
    return `${d}-${mmm}`;
  }
  return `${d}-${mmm}-${date.getFullYear()}`;
}

function achievementTimeLabel(row) {
  // Prefer achieved date from API (habit start + belt offset)
  return formatAchievementReceivedDate(row.date);
}

const SHIELD_ICONS = {
  White: { bg: '#ffffff', color: '#161823', stroke: '#cfd3d8', lines: ['New', 'Habit'] },
  Yellow: { bg: '#fdd835', color: '#161823', stroke: '#f9a825', lines: ['24', 'Hours'] },
  Orange: { bg: '#ef6c00', color: '#ffffff', stroke: '#e65100', lines: ['2', 'Weeks'] },
  Green: { bg: '#2e7d32', color: '#ffffff', stroke: '#1b5e20', lines: ['1', 'Month'] },
  Blue: { bg: '#1565c0', color: '#ffffff', stroke: '#0d47a1', lines: ['2', 'Months'] },
  Brown: { bg: '#6d4c41', color: '#ffffff', stroke: '#4e342e', lines: ['3', 'Months'] },
  Red: { bg: '#c62828', color: '#ffffff', stroke: '#b71c1c', lines: ['6', 'Months'] },
  Black: { bg: '#000000', color: '#ffffff', stroke: '#333333', lines: ['12', 'Months'] }
};

function inboxAvatarHtml(type) {
  const icon = SHIELD_ICONS[String(type)] || SHIELD_ICONS.White;
  const title = escapeHtml(icon.lines.join(' '));
  const line1 = escapeHtml(icon.lines[0]);
  const line2 = escapeHtml(icon.lines[1]);
  const numberLine = /^\d+$/.test(icon.lines[0]);
  const line1Size = numberLine ? 16 : 10;
  const line2Size = numberLine ? 8 : 9;
  const line1Y = numberLine ? 26 : 27;
  const line2Dy = numberLine ? 12 : 11;
  return `
    <span class="inbox-avatar inbox-shield" aria-hidden="true" title="${title}">
      <svg class="inbox-shield-svg" viewBox="0 0 56 64" width="48" height="54" role="img">
        <path
          d="M28 2 L50 10 V30 C50 46 38 58 28 62 C18 58 6 46 6 30 V10 Z"
          fill="${icon.bg}"
          stroke="${icon.stroke}"
          stroke-width="2"
        />
        <text
          x="28"
          y="${line1Y}"
          text-anchor="middle"
          fill="${icon.color}"
          font-size="${line1Size}"
          font-weight="800"
          font-family="system-ui, -apple-system, Segoe UI, sans-serif"
        >
          <tspan x="28" dy="0">${line1}</tspan>
        </text>
        <text
          x="28"
          y="${line1Y + line2Dy}"
          text-anchor="middle"
          fill="${icon.color}"
          font-size="${line2Size}"
          font-weight="700"
          font-family="system-ui, -apple-system, Segoe UI, sans-serif"
        >${line2}</text>
      </svg>
    </span>
  `;
}

let loadAchievementsGeneration = 0;

async function loadAchievements() {
  const generation = ++loadAchievementsGeneration;
  const loadingEl = document.getElementById('achievements-loading');
  const errorEl = document.getElementById('achievements-error');
  const emptyEl = document.getElementById('achievements-empty');
  const listEl = document.getElementById('achievements-list');
  if (!loadingEl || !errorEl || !emptyEl || !listEl) return;

  const hasVisibleRows = listEl.style.display !== 'none' && listEl.children.length > 0;

  try {
    if (!hasVisibleRows) {
      loadingEl.style.display = 'flex';
      listEl.style.display = 'none';
      emptyEl.style.display = 'none';
    }
    errorEl.style.display = 'none';

    const { id: currentUserId, email: currentUserEmail, token } = await getAuthContext();
    if (generation !== loadAchievementsGeneration) return;

    if (!currentUserId && !currentUserEmail) {
      loadingEl.style.display = 'none';
      emptyEl.textContent = 'Log in to see your achievements';
      emptyEl.style.display = 'block';
      listEl.style.display = 'none';
      return;
    }

    const response = await fetch('/api/achievements', {
      headers: authHeaders(token)
    });
    if (generation !== loadAchievementsGeneration) return;

    const responseData = await response.json().catch(() => ({}));
    if (!response.ok) {
      const details = responseData.details || responseData.error || '';
      console.error('Achievements API error:', response.status, details);
      throw new Error(details ? `Failed to fetch achievements: ${details}` : 'Failed to fetch achievements');
    }

    const ownerIds = new Set([currentUserId, currentUserEmail].filter(Boolean));
    const achievements = (Array.isArray(responseData) ? responseData : []).filter((row) => {
      return ownerIds.has(row.user) || ownerIds.has(row.user_id);
    });
    achievements.sort((a, b) => {
      const byDate = achievementDateSortValue(b.date) - achievementDateSortValue(a.date);
      if (byDate !== 0) return byDate;
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });

    if (generation !== loadAchievementsGeneration) return;

    loadingEl.style.display = 'none';

    if (achievements.length === 0) {
      emptyEl.textContent = 'No achievements yet';
      emptyEl.style.display = 'block';
      listEl.style.display = 'none';
      listEl.innerHTML = '';
      return;
    }

    emptyEl.style.display = 'none';
    listEl.style.display = 'block';
    listEl.innerHTML = '';

    achievements.forEach((row) => {
      const item = document.createElement('article');
      item.className = 'inbox-item';
      item.innerHTML = `
        ${inboxAvatarHtml(row.type)}
        <div class="inbox-item-body">
          <p class="inbox-item-text">${escapeHtml(achievementText(row))}</p>
        </div>
        <time class="inbox-item-time">${escapeHtml(achievementTimeLabel(row))}</time>
      `;
      listEl.appendChild(item);
    });
  } catch (error) {
    if (generation !== loadAchievementsGeneration) return;
    console.error('Error loading achievements:', error);
    loadingEl.style.display = 'none';
    errorEl.textContent = error.message || 'Failed to load achievements. Please refresh the page.';
    errorEl.style.display = 'block';
  }
}

const originalUpdateContentVisibility = window.updateContentVisibility || function () {};
window.updateContentVisibility = function (isAuthenticated) {
  const wasAuthenticated = typeof lastContentAuthState !== 'undefined' ? lastContentAuthState : null;
  originalUpdateContentVisibility(isAuthenticated);
  if (isAuthenticated && wasAuthenticated !== true) {
    loadAchievements();
    if (typeof window.markInboxSeen === 'function') {
      window.markInboxSeen();
    }
    if (typeof window.markAchievementsReadOnServer === 'function') {
      window.markAchievementsReadOnServer();
    } else {
      getAuthContext().then(({ token }) => {
        if (!token) return;
        fetch('/api/achievements/read', {
          method: 'POST',
          headers: authHeaders(token, { 'Content-Type': 'application/json' }),
          keepalive: true
        }).catch(() => {});
      });
    }
  }
};
updateContentVisibility = window.updateContentVisibility;
