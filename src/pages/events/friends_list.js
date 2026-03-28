async function checkAuthAndDisplayContent() {
  try {
    let auth0 = null;
    if (window.auth0) {
      auth0 = window.auth0;
    } else if (window.auth0Promise) {
      auth0 = await window.auth0Promise;
    } else {
      setTimeout(checkAuthAndDisplayContent, 200);
      return;
    }
    if (window.redirectHandledPromise) {
      await window.redirectHandledPromise;
    }
    if (auth0 && typeof auth0.isAuthenticated === 'function') {
      const isAuthenticated = await auth0.isAuthenticated();
      updateContentVisibility(isAuthenticated);
    } else {
      updateContentVisibility(false);
    }
  } catch (error) {
    console.error('Error checking authentication:', error);
    updateContentVisibility(false);
  }
}

function updateContentVisibility(isAuthenticated) {
  const privateContent = document.getElementById('private-content');
  const loginRequiredMessage = document.getElementById('login-required-message');
  if (isAuthenticated) {
    if (privateContent) privateContent.style.display = 'block';
    if (loginRequiredMessage) loginRequiredMessage.style.display = 'none';
  } else {
    if (privateContent) privateContent.style.display = 'none';
    if (loginRequiredMessage) loginRequiredMessage.style.display = 'block';
  }
}

function waitForAuth0AndCheck(maxRetries = 10, retryDelay = 200) {
  let retries = 0;
  const check = () => {
    if (window.auth0 || (window.auth0Promise && retries < maxRetries)) {
      checkAuthAndDisplayContent();
    } else if (retries < maxRetries) {
      retries++;
      setTimeout(check, retryDelay);
    } else {
      updateContentVisibility(false);
    }
  };
  check();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => waitForAuth0AndCheck());
} else {
  waitForAuth0AndCheck();
}

window.addEventListener('focus', () => {
  setTimeout(checkAuthAndDisplayContent, 100);
});

if (window.location.search.includes('code=') && window.location.search.includes('state=')) {
  setTimeout(checkAuthAndDisplayContent, 500);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function loadFriends() {
  const loadingEl = document.getElementById('friends-loading');
  const errorEl = document.getElementById('friends-error');
  const emptyEl = document.getElementById('friends-empty');
  const tableEl = document.getElementById('friends-table');
  const tbodyEl = document.getElementById('friends-tbody');

  loadingEl.style.display = 'block';
  errorEl.style.display = 'none';
  emptyEl.style.display = 'none';
  tableEl.style.display = 'none';
  tbodyEl.innerHTML = '';

  let currentUserEmail = null;
  try {
    if (window.auth0) {
      const isAuthenticated = await window.auth0.isAuthenticated();
      if (isAuthenticated) {
        const user = await window.auth0.getUser();
        currentUserEmail = user?.email || null;
      }
    }
  } catch (e) {
    console.error(e);
  }

  if (!currentUserEmail) {
    loadingEl.style.display = 'none';
    emptyEl.textContent = 'Please log in to view your friends.';
    emptyEl.style.display = 'block';
    return;
  }

  try {
    const response = await fetch(
      '/api/friends?user_id=' + encodeURIComponent(currentUserEmail)
    );
    if (response.status === 503) {
      loadingEl.style.display = 'none';
      errorEl.textContent =
        'Friends require Supabase. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and create the friends table (user1, user2).';
      errorEl.style.display = 'block';
      return;
    }
    if (!response.ok) {
      throw new Error('Failed to fetch friends');
    }

    const rows = await response.json();
    loadingEl.style.display = 'none';

    if (!rows.length) {
      emptyEl.style.display = 'block';
      return;
    }

    tableEl.style.display = 'table';
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      tr.dataset.friendId = String(row.id);
      const friendId =
        row.other_user != null
          ? String(row.other_user)
          : row.friend_email != null
            ? String(row.friend_email)
            : '';
      tr.innerHTML = `
        <td>${escapeHtml(friendId)}</td>
        <td>
          <button type="button" class="btn btn-sm btn-outline-danger friends-remove-btn" data-id="${escapeHtml(String(row.id))}">Remove</button>
        </td>
      `;
      tbodyEl.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    loadingEl.style.display = 'none';
    errorEl.textContent = 'Failed to load friends. Please refresh the page.';
    errorEl.style.display = 'block';
  }
}

async function addFriendSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('friend-email-input');
  const btn = e.target.querySelector('button[type="submit"]');
  const email = input.value.trim();
  if (!email) {
    alert('Please enter an email address.');
    return;
  }

  let userId = null;
  try {
    if (window.auth0) {
      const ok = await window.auth0.isAuthenticated();
      if (ok) {
        const user = await window.auth0.getUser();
        userId = user?.email || user?.nickname || user?.sub || null;
      }
    }
  } catch (err) {
    console.error(err);
  }
  if (!userId) {
    alert('You must be logged in to add a friend.');
    return;
  }
  if (email.toLowerCase() === String(userId).toLowerCase()) {
    alert('Use a different email than your own account.');
    return;
  }

  try {
    btn.disabled = true;
    btn.textContent = 'Adding...';
    const response = await fetch('/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, friend_id: email })
    });
    if (response.status === 503) {
      alert('Friends require Supabase. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
      return;
    }
    if (response.status === 409) {
      const j = await response.json().catch(() => ({}));
      alert(j.error || 'That friend is already in your list.');
      return;
    }
    if (!response.ok) {
      const j = await response.json().catch(() => ({}));
      throw new Error(j.error || 'Failed to add friend');
    }
    input.value = '';
    await loadFriends();
  } catch (err) {
    console.error(err);
    alert(err.message || 'Failed to add friend. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add friend';
  }
}

async function removeFriend(id) {
  if (!confirm('Remove this friend from your list?')) return;

  let userId = null;
  try {
    if (window.auth0) {
      const ok = await window.auth0.isAuthenticated();
      if (ok) {
        const user = await window.auth0.getUser();
        userId = user?.email || user?.nickname || user?.sub || null;
      }
    }
  } catch (err) {
    console.error(err);
  }
  if (!userId) {
    alert('You must be logged in.');
    return;
  }

  try {
    const response = await fetch(
      '/api/friends/' + encodeURIComponent(id) + '?user_id=' + encodeURIComponent(userId),
      { method: 'DELETE' }
    );
    if (!response.ok) {
      throw new Error('Failed to remove');
    }
    await loadFriends();
  } catch (err) {
    console.error(err);
    alert('Could not remove friend. Please try again.');
  }
}

const originalUpdateContentVisibility = updateContentVisibility;
updateContentVisibility = function (isAuthenticated) {
  originalUpdateContentVisibility(isAuthenticated);
  if (isAuthenticated) {
    setTimeout(loadFriends, 100);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('add-friend-form');
  if (form) {
    form.addEventListener('submit', addFriendSubmit);
  }
  const tbody = document.getElementById('friends-tbody');
  if (tbody) {
    tbody.addEventListener('click', (e) => {
      const b = e.target.closest('.friends-remove-btn');
      if (!b || !b.dataset.id) return;
      removeFriend(b.dataset.id);
    });
  }
});
