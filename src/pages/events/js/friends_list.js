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

function escapeAttr(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isContactsListPage() {
  return window.location.pathname.indexOf('contact_list') !== -1;
}

function isFriendsListPage() {
  return window.location.pathname.indexOf('friends_list') !== -1;
}

function addModalDefaultSubmitLabel() {
  if (isContactsListPage()) return 'Add contact';
  return 'Add';
}

/** Enriched rows for row-click modal (set in loadFriendsAndContacts). */
let friendsListEntriesCache = [];

/** Keys in connections API are lowercased emails; match friend/contact the same way. */
function connectionLookupKey(entry) {
  const raw = entry.lookupEmail != null && String(entry.lookupEmail).trim() !== ''
    ? entry.lookupEmail
    : entry.name;
  return String(raw || '').trim().toLowerCase();
}

/** contact.html loads a person by `contact_name` query (see events_table.js). */
function contactPageHrefForListName(name) {
  return (
    '/events/contact.html?contact_name=' + encodeURIComponent(String(name || ''))
  );
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
  if (!loadingEl) return;
  const errorEl = document.getElementById('requests-error');
  const emptyEl = document.getElementById('requests-empty');
  const tableEl = document.getElementById('requests-table');
  const tbodyEl = document.getElementById('requests-tbody');
  if (!errorEl || !emptyEl || !tableEl || !tbodyEl) return;

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

async function loadFriendsAndContacts(email) {
  const loadingEl = document.getElementById('friends-loading');
  const errorEl   = document.getElementById('friends-error');
  const emptyEl   = document.getElementById('friends-empty');
  const tableEl   = document.getElementById('friends-table');
  const tbodyEl   = document.getElementById('friends-tbody');
  if (!loadingEl || !errorEl || !emptyEl || !tableEl || !tbodyEl) return;

  loadingEl.style.display = 'block';
  errorEl.style.display   = 'none';
  emptyEl.style.display   = 'none';
  tableEl.style.display   = 'none';
  tbodyEl.innerHTML       = '';

  const contactsOnly = isContactsListPage();

  try {
    let friendRows = [];
    let contactRows = [];
    let connectionsMap = {};

    if (contactsOnly) {
      const [contactsRes, connectionsRes] = await Promise.all([
        fetch('/api/contacts?user_id=' + encodeURIComponent(email)),
        fetch('/api/groups/connections?user_id=' + encodeURIComponent(email))
      ]);
      if (contactsRes.status === 503) {
        loadingEl.style.display = 'none';
        errorEl.textContent =
          'Contacts require Supabase. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.';
        errorEl.style.display = 'block';
        return;
      }
      if (!contactsRes.ok) throw new Error('Failed to fetch contacts');
      contactRows = await contactsRes.json();
      if (connectionsRes.ok) {
        connectionsMap = await connectionsRes.json();
      } else {
        console.warn(
          'GET /api/groups/connections failed:',
          connectionsRes.status,
          await connectionsRes.text().catch(() => '')
        );
      }
    } else {
      const [friendsRes, connectionsRes] = await Promise.all([
        fetch('/api/friends?user_id=' + encodeURIComponent(email)),
        fetch('/api/groups/connections?user_id=' + encodeURIComponent(email))
      ]);
      if (friendsRes.status === 503) {
        loadingEl.style.display = 'none';
        errorEl.textContent =
          'Friends require Supabase. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.';
        errorEl.style.display = 'block';
        return;
      }
      if (!friendsRes.ok) throw new Error('Failed to fetch friends');
      friendRows = await friendsRes.json();
      if (connectionsRes.ok) {
        connectionsMap = await connectionsRes.json();
      } else {
        console.warn(
          'GET /api/groups/connections failed:',
          connectionsRes.status,
          await connectionsRes.text().catch(() => '')
        );
      }
    }

    loadingEl.style.display = 'none';

    const entries = [];

    friendRows.forEach(row => {
      const name =
        row.other_user != null
          ? String(row.other_user)
          : row.friend_email != null
            ? String(row.friend_email)
            : '';
      const notes =
        row.private_notes != null ? String(row.private_notes) : '';
      entries.push({
        name,
        lookupEmail: name,
        type: 'friend',
        id: String(row.id),
        notes
      });
    });

    contactRows.forEach(row => {
      const name = row.name != null ? String(row.name) : '';
      const emailCol = row.email != null ? String(row.email).trim() : '';
      const notes =
        row.notes != null
          ? String(row.notes)
          : row.private_notes != null
            ? String(row.private_notes)
            : '';
      entries.push({
        name,
        lookupEmail: emailCol || (name.includes('@') ? name : ''),
        type: 'contact',
        id: String(row.id),
        notes
      });
    });

    if (!entries.length) {
      emptyEl.style.display = 'block';
      return;
    }

    entries.sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );

    friendsListEntriesCache = entries.map(entry => ({
      ...entry,
      groupsList: connectionsMap[connectionLookupKey(entry)] || []
    }));

    tableEl.style.display = 'table';
    friendsListEntriesCache.forEach((entry, idx) => {
      const tr = document.createElement('tr');
      tr.classList.add('friends-table-row');
      tr.dataset.entryIndex = String(idx);

      const removeBtn =
        entry.type === 'friend'
          ? `<button type="button" class="btn btn-sm btn-outline-danger friends-remove-btn mr-1" data-id="${escapeHtml(entry.id)}">Remove</button>`
          : '';

      const deleteBtn =
        entry.type === 'contact'
          ? `<button type="button" class="btn btn-sm btn-outline-danger friends-delete-btn" data-name="${escapeAttr(entry.name)}" data-contact-id="${escapeAttr(String(entry.id))}">Delete</button>`
          : '';

      const sharedGroups = entry.groupsList;
      const groupsCell = sharedGroups.length
        ? sharedGroups
            .map(g => `<span class="badge badge-info mr-1">${escapeHtml(g)}</span>`)
            .join('')
        : '<span class="text-muted small">—</span>';

      const nameCell =
        entry.name && String(entry.name).trim() !== ''
          ? `<a href="${escapeAttr(contactPageHrefForListName(entry.name))}" class="friends-name-link">${escapeHtml(entry.name)}</a>`
          : escapeHtml(entry.name || '');

      tr.innerHTML = `
        <td>${nameCell}</td>
        <td>${groupsCell}</td>
        <td><div class="d-flex flex-wrap align-items-center">${removeBtn}${deleteBtn}</div></td>
      `;
      if (entry.type === 'friend') tr.dataset.friendId = entry.id;
      tbodyEl.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    loadingEl.style.display = 'none';
    errorEl.textContent = contactsOnly
      ? 'Failed to load contacts. Please refresh the page.'
      : 'Failed to load friends. Please refresh the page.';
    errorEl.style.display = 'block';
  }
}

async function loadFriendsPage() {
  const email = await getLoggedInUserId();
  if (!email) {
    const rl = document.getElementById('requests-loading');
    const fl = document.getElementById('friends-loading');
    if (rl) rl.style.display = 'none';
    if (fl) fl.style.display = 'none';
    const re = document.getElementById('requests-empty');
    if (re) {
      re.textContent = 'Please log in to view friend requests.';
      re.style.display = 'block';
    }
    const fe = document.getElementById('friends-empty');
    if (fe) {
      fe.textContent = isContactsListPage()
        ? 'Please log in to view your contacts.'
        : 'Please log in to view your friends.';
      fe.style.display = 'block';
    }
    return;
  }

  const re = document.getElementById('requests-empty');
  if (re) re.textContent = 'No pending friend requests.';
  const fe = document.getElementById('friends-empty');
  if (fe) {
    fe.textContent = isContactsListPage()
      ? 'No contacts yet.'
      : 'No friends yet.';
  }

  const tasks = [loadFriendsAndContacts(email)];
  if (isFriendsListPage()) tasks.push(loadIncomingRequests(email));
  await Promise.all(tasks);
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

function syncAddFriendModalHints() {
  const status = document.getElementById('af-status');
  const nameInput = document.getElementById('af-name');
  const hFriend = document.getElementById('af-name-hint-friend');
  const hContact = document.getElementById('af-name-hint-contact');
  const groupWrap = document.getElementById('af-group-wrap');
  if (!nameInput || !hFriend || !hContact) return;

  if (isContactsListPage()) {
    if (status) status.value = 'contact';
    hFriend.classList.add('d-none');
    hContact.classList.remove('d-none');
    nameInput.setAttribute('type', 'text');
    nameInput.setAttribute('autocomplete', 'name');
    if (groupWrap) groupWrap.classList.add('d-none');
    return;
  }
  if (isFriendsListPage()) {
    if (status) status.value = 'friend';
    hFriend.classList.remove('d-none');
    hContact.classList.add('d-none');
    nameInput.setAttribute('type', 'email');
    nameInput.setAttribute('autocomplete', 'email');
    if (groupWrap) groupWrap.classList.remove('d-none');
    return;
  }

  if (!status) return;
  if (status.value === 'friend') {
    hFriend.classList.remove('d-none');
    hContact.classList.add('d-none');
    nameInput.setAttribute('type', 'email');
    nameInput.setAttribute('autocomplete', 'email');
    if (groupWrap) groupWrap.classList.remove('d-none');
  } else {
    hFriend.classList.add('d-none');
    hContact.classList.remove('d-none');
    nameInput.setAttribute('type', 'text');
    nameInput.setAttribute('autocomplete', 'name');
    if (groupWrap) groupWrap.classList.add('d-none');
  }
}

async function loadOwnedGroupsIntoModal() {
  const sel = document.getElementById('af-group');
  if (!sel) return;
  sel.innerHTML = '<option value="">None</option>';
  const userId = await getLoggedInUserId();
  if (!userId) return;
  try {
    const res = await fetch('/api/groups/owned?user_id=' + encodeURIComponent(userId));
    if (!res.ok) return;
    const rows = await res.json();
    rows.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.group_name;
      opt.textContent = r.group_name;
      sel.appendChild(opt);
    });
  } catch (e) {
    console.error(e);
  }
}

function applyPageSpecificAddModal() {
  const statusField = document.getElementById('af-status');
  const statusWrap = statusField && statusField.closest('.form-group');
  if (statusWrap) {
    statusWrap.style.display =
      isContactsListPage() || isFriendsListPage() ? 'none' : '';
  }
  const label = document.getElementById('addFriendModalLabel');
  if (label) {
    if (isContactsListPage()) label.textContent = 'Add contact';
    else if (isFriendsListPage()) label.textContent = 'Add friend';
  }
  const submit = document.getElementById('af-submit');
  if (submit && (isContactsListPage() || isFriendsListPage())) {
    submit.textContent = addModalDefaultSubmitLabel();
  }
}

function resetAddFriendModal() {
  const form = document.getElementById('add-friend-modal-form');
  if (form) form.reset();
  const status = document.getElementById('af-status');
  if (status) {
    if (isContactsListPage()) status.value = 'contact';
    else if (isFriendsListPage()) status.value = 'friend';
    else status.value = 'friend';
  }
  syncAddFriendModalHints();
  applyPageSpecificAddModal();
}

async function addFriendModalSubmit() {
  const nameInput = document.getElementById('af-name');
  const statusEl = document.getElementById('af-status');
  const notesInput = document.getElementById('af-notes');
  const groupSel = document.getElementById('af-group');
  const btn = document.getElementById('af-submit');

  const name = nameInput && nameInput.value.trim();
  const status = isContactsListPage()
    ? 'contact'
    : isFriendsListPage()
      ? 'friend'
      : statusEl && statusEl.value;
  const notes = notesInput && notesInput.value.trim();
  const groupName =
    groupSel && groupSel.value ? String(groupSel.value).trim() : '';

  if (!name) {
    alert('Please enter a name.');
    return;
  }

  const userId = await getLoggedInUserId();
  if (!userId) {
    alert('You must be logged in.');
    return;
  }

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Adding…';
    }

    if (status === 'friend') {
      const email = name;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        alert('For a friend, enter a valid email address.');
        return;
      }
      if (email.toLowerCase() === String(userId).toLowerCase()) {
        alert('Use a different email than your own account.');
        return;
      }
      const response = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          friend_id: email,
          private_notes: notes || undefined
        })
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

      if (groupName) {
        const inv = await fetch('/api/groups/invite-member', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            group_name: groupName,
            member: email
          })
        });
        if (!inv.ok && inv.status !== 409) {
          const j = await inv.json().catch(() => ({}));
          alert(
            j.error ||
              'Friend request saved, but the group invite could not be sent.'
          );
        }
      }
    } else {
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          name,
          private_notes: notes || undefined
        })
      });
      if (response.status === 503) {
        alert('Contacts require Supabase.');
        return;
      }
      if (!response.ok) {
        const j = await response.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to add contact');
      }
    }

    resetAddFriendModal();
    if (window.jQuery) window.jQuery('#addFriendModal').modal('hide');
    await loadFriendsPage();
  } catch (err) {
    console.error(err);
    alert(err.message || 'Something went wrong. Please try again.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = addModalDefaultSubmitLabel();
    }
  }
}

async function deleteContactFromTable(btn) {
  if (
    !confirm(
      "Are you sure you want to delete this contact? It can't be undone."
    )
  ) {
    return;
  }

  const userId = await getLoggedInUserId();
  if (!userId) {
    alert('You must be logged in.');
    return;
  }

  const name = btn.dataset.name || '';
  const contactId = btn.dataset.contactId || '';

  try {
    let url =
      '/api/contacts?user_id=' + encodeURIComponent(userId);
    if (contactId) {
      url += '&id=' + encodeURIComponent(contactId);
    } else if (name) {
      url += '&name=' + encodeURIComponent(name);
    } else {
      alert('Nothing to delete.');
      return;
    }

    const response = await fetch(url, { method: 'DELETE' });
    if (response.status === 503) {
      alert('Contacts require Supabase.');
      return;
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || 'Failed to delete');
    }
    if (result.deleted === 0) {
      alert('No matching contact was found for this name.');
    }
    await loadFriendsPage();
  } catch (err) {
    console.error(err);
    alert(err.message || 'Could not delete. Please try again.');
  }
}

function openRowDetailModal(index) {
  const entry = friendsListEntriesCache[index];
  if (!entry) return;
  const nameEl = document.getElementById('row-detail-name');
  const statusEl = document.getElementById('row-detail-status');
  const groupsEl = document.getElementById('row-detail-groups');
  const notesEl = document.getElementById('row-detail-notes');
  const modal = document.getElementById('rowDetailModal');
  if (!nameEl || !groupsEl || !notesEl || !modal) return;

  nameEl.value = entry.name || '';
  nameEl.readOnly = entry.type !== 'contact';
  nameEl.classList.toggle('bg-light', entry.type !== 'contact');
  if (statusEl) {
    statusEl.value = entry.type === 'friend' ? 'Friend' : 'Contact';
  }
  groupsEl.value =
    entry.groupsList && entry.groupsList.length
      ? entry.groupsList.join(', ')
      : '—';
  notesEl.value = entry.notes || '';
  modal.dataset.entryIndex = String(index);
  if (window.jQuery) window.jQuery('#rowDetailModal').modal('show');
}

async function rowDetailSubmit() {
  const modal = document.getElementById('rowDetailModal');
  const nameEl = document.getElementById('row-detail-name');
  const notesEl = document.getElementById('row-detail-notes');
  const btn = document.getElementById('row-detail-submit');
  if (!modal || !nameEl || !notesEl || !btn) return;

  const idx = parseInt(modal.dataset.entryIndex, 10);
  if (isNaN(idx)) return;
  const entry = friendsListEntriesCache[idx];
  if (!entry) return;

  const userId = await getLoggedInUserId();
  if (!userId) {
    alert('You must be logged in.');
    return;
  }

  try {
    btn.disabled = true;
    btn.textContent = 'Saving…';

    if (entry.type === 'contact') {
      const name = nameEl.value.trim();
      if (!name) {
        alert('Name cannot be empty.');
        return;
      }
      const response = await fetch(
        '/api/contacts/' + encodeURIComponent(entry.id),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            name,
            notes: notesEl.value
          })
        }
      );
      if (response.status === 503) {
        alert('Contacts require Supabase.');
        return;
      }
      if (!response.ok) {
        const j = await response.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to save');
      }
    } else {
      const response = await fetch(
        '/api/friends/' + encodeURIComponent(entry.id),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            private_notes: notesEl.value
          })
        }
      );
      if (response.status === 503) {
        alert('Friends require Supabase.');
        return;
      }
      if (!response.ok) {
        const j = await response.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to save');
      }
    }

    if (window.jQuery) window.jQuery('#rowDetailModal').modal('hide');
    await loadFriendsPage();
  } catch (err) {
    console.error(err);
    alert(err.message || 'Could not save. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit';
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
  const addModal = document.getElementById('addFriendModal');
  if (addModal) {
    addModal.addEventListener('show.bs.modal', () => {
      resetAddFriendModal();
      loadOwnedGroupsIntoModal();
    });
  }
  const afStatus = document.getElementById('af-status');
  if (afStatus) {
    afStatus.addEventListener('change', syncAddFriendModalHints);
  }
  const afSubmit = document.getElementById('af-submit');
  if (afSubmit) {
    afSubmit.addEventListener('click', addFriendModalSubmit);
  }
  syncAddFriendModalHints();
  applyPageSpecificAddModal();
  const tbody = document.getElementById('friends-tbody');
  if (tbody) {
    tbody.addEventListener('click', (e) => {
      const del = e.target.closest('.friends-delete-btn');
      if (del) {
        deleteContactFromTable(del);
        return;
      }
      const b = e.target.closest('.friends-remove-btn');
      if (b && b.dataset.id) {
        removeFriend(b.dataset.id);
        return;
      }
      if (e.target.closest('.friends-name-link')) return;
      const tr = e.target.closest('tr.friends-table-row');
      if (!tr) return;
      const idx = parseInt(tr.dataset.entryIndex, 10);
      if (isNaN(idx)) return;
      openRowDetailModal(idx);
    });
  }
  const rowDetailBtn = document.getElementById('row-detail-submit');
  if (rowDetailBtn) {
    rowDetailBtn.addEventListener('click', rowDetailSubmit);
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
