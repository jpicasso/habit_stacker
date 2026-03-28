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

async function getLoggedInUserId() {
  try {
    if (window.auth0) {
      const isAuthenticated = await window.auth0.isAuthenticated();
      if (isAuthenticated) {
        const user = await window.auth0.getUser();
        return user?.email || user?.nickname || user?.sub || null;
      }
    }
  } catch (e) {
    console.error(e);
  }
  return null;
}

async function loadIncomingRequests(email) {
  const loadingEl = document.getElementById('requests-loading');
  const errorEl = document.getElementById('requests-error');
  const emptyEl = document.getElementById('requests-empty');
  const tableEl = document.getElementById('requests-table');
  const tbodyEl = document.getElementById('requests-tbody');

  loadingEl.style.display = 'block';
  errorEl.style.display = 'none';
  emptyEl.style.display = 'none';
  tableEl.style.display = 'none';
  tbodyEl.innerHTML = '';

  try {
    const response = await fetch(
      '/api/friends/incoming?user_id=' + encodeURIComponent(email)
    );
    if (response.status === 503) {
      loadingEl.style.display = 'none';
      errorEl.textContent =
        'Friends require Supabase. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.';
      errorEl.style.display = 'block';
      return;
    }
    if (!response.ok) {
      throw new Error('Failed to fetch friend requests');
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
      const person = row.user1 != null ? String(row.user1) : '';
      tr.innerHTML = `
        <td>${escapeHtml(person)}</td>
        <td>
          <button type="button" class="btn btn-sm btn-success friend-request-accept mr-1" data-id="${escapeHtml(String(row.id))}">Accept</button>
          <button type="button" class="btn btn-sm btn-outline-danger friend-request-reject" data-id="${escapeHtml(String(row.id))}">Reject</button>
        </td>
      `;
      tbodyEl.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    loadingEl.style.display = 'none';
    errorEl.textContent = 'Failed to load friend requests. Please refresh the page.';
    errorEl.style.display = 'block';
  }
}

async function loadConnectedFriends(email) {
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

  try {
    const response = await fetch(
      '/api/friends?user_id=' + encodeURIComponent(email)
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

async function loadFriendsPage() {
  const email = await getLoggedInUserId();
  if (!email) {
    document.getElementById('requests-loading').style.display = 'none';
    document.getElementById('friends-loading').style.display = 'none';
    document.getElementById('requests-empty').textContent = 'Please log in to view friend requests.';
    document.getElementById('requests-empty').style.display = 'block';
    document.getElementById('friends-empty').textContent = 'Please log in to view your friends.';
    document.getElementById('friends-empty').style.display = 'block';
    return;
  }

  document.getElementById('requests-empty').textContent = 'No pending friend requests.';
  document.getElementById('friends-empty').textContent = 'No friends yet. Add someone below.';

  await Promise.all([loadIncomingRequests(email), loadConnectedFriends(email)]);
}

async function respondToRequest(id, action) {
  const userId = await getLoggedInUserId();
  if (!userId) {
    alert('You must be logged in.');
    return;
  }

  try {
    const response = await fetch('/api/friends/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, action })
    });
    if (response.status === 503) {
      alert('Friends require Supabase.');
      return;
    }
    if (!response.ok) {
      const j = await response.json().catch(() => ({}));
      throw new Error(j.error || 'Could not update request');
    }
    await loadFriendsPage();
  } catch (err) {
    console.error(err);
    alert(err.message || 'Something went wrong. Please try again.');
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

  const userId = await getLoggedInUserId();
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
    await loadFriendsPage();
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

  const userId = await getLoggedInUserId();
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
    await loadFriendsPage();
  } catch (err) {
    console.error(err);
    alert('Could not remove friend. Please try again.');
  }
}

const originalUpdateContentVisibility = updateContentVisibility;
updateContentVisibility = function (isAuthenticated) {
  originalUpdateContentVisibility(isAuthenticated);
  if (isAuthenticated) {
    setTimeout(loadFriendsPage, 100);
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
  const reqTbody = document.getElementById('requests-tbody');
  if (reqTbody) {
    reqTbody.addEventListener('click', (e) => {
      const accept = e.target.closest('.friend-request-accept');
      const reject = e.target.closest('.friend-request-reject');
      const btn = accept || reject;
      if (!btn || !btn.dataset.id) return;
      const id = btn.dataset.id;
      if (accept) {
        respondToRequest(id, 'accept');
      } else {
        respondToRequest(id, 'reject');
      }
    });
  }
});
