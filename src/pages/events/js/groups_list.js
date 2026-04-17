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

window.addEventListener('focus', () => setTimeout(checkAuthAndDisplayContent, 100));

if (window.location.search.includes('code=') && window.location.search.includes('state=')) {
  setTimeout(checkAuthAndDisplayContent, 500);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/** Display handle with a leading @ when missing (matches `/events/group/@…` URLs). */
function formatGroupHandleForDisplay(handle) {
  const h = handle != null ? String(handle).trim() : '';
  if (!h) return '';
  return h.startsWith('@') ? h : '@' + h;
}

/** Path to the group page, e.g. `/events/group/@picasso20` (handle from API, with or without `@`). */
function groupPageUrlFromHandle(handleRaw) {
  const h = handleRaw != null ? String(handleRaw).trim() : '';
  if (!h) return '';
  const noAt = h.replace(/^@+/, '');
  if (!noAt) return '';
  return '/events/group/@' + encodeURIComponent(noAt);
}

/** Public profile page, e.g. `/events/@picasso20` (see server `/events/@:handle`). */
function profilePageUrlFromHandle(handleRaw) {
  const h = handleRaw != null ? String(handleRaw).trim() : '';
  if (!h) return '';
  const noAt = h.replace(/^@+/, '');
  if (!noAt) return '';
  return '/events/@' + encodeURIComponent(noAt);
}

function initialsFromDisplayName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    return (
      parts[0][0] + parts[parts.length - 1][0]
    ).toUpperCase();
  }
  if (parts.length === 1 && parts[0].length) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return '?';
}

/**
 * @param {string} viewerEmail
 * @param {{ admin_profiles?: Array<{ email?: string, name?: string, handle?: string|null, photo_url?: string|null }>, admin_list?: string[] }} row
 */
function buildAdminsCellHtml(viewerEmail, row) {
  const profiles = row.admin_profiles;
  if (profiles && profiles.length) {
    return profiles
      .map(p => {
        const isMe =
          viewerEmail &&
          p.email &&
          String(p.email).toLowerCase() === String(viewerEmail).toLowerCase();
        const name = p.name != null ? String(p.name).trim() : '';
        const initials = initialsFromDisplayName(name);
        const photoUrl = p.photo_url != null ? String(p.photo_url).trim() : '';
        const photo = photoUrl
          ? `<img class="groups-list-admin-avatar rounded-circle border mr-1 flex-shrink-0" src="${escapeHtml(photoUrl)}" width="32" height="32" alt="" loading="lazy" referrerpolicy="no-referrer">`
          : `<span class="groups-list-admin-avatar rounded-circle border mr-1 flex-shrink-0 d-inline-flex align-items-center justify-content-center bg-secondary text-white small font-weight-bold" style="width:32px;height:32px;font-size:0.7rem;" aria-hidden="true">${escapeHtml(initials)}</span>`;
        const label = escapeHtml(name);
        const meClass = isMe ? ' text-primary font-weight-medium' : '';
        const title = p.email ? escapeHtml(String(p.email)) : '';
        const handleRaw = p.handle != null ? String(p.handle).trim() : '';
        const profileUrl = handleRaw ? profilePageUrlFromHandle(handleRaw) : '';
        const inner = `${photo}<span class="groups-list-admin-name">${label}</span>`;
        if (profileUrl) {
          return `<a href="${escapeHtml(profileUrl)}" class="groups-list-admin-profile-link d-inline-flex align-items-center mr-2 mb-1 groups-list-admin-chip${meClass}" title="${title}">${inner}</a>`;
        }
        return `<span class="d-inline-flex align-items-center mr-2 mb-1 groups-list-admin-chip${meClass}" title="${title}">${inner}</span>`;
      })
      .join('');
  }
  const adminBadges = (row.admin_list || []).map(a => {
    const isMe =
      viewerEmail &&
      a.toLowerCase() === String(viewerEmail).toLowerCase();
    return isMe
      ? `<span class="badge badge-primary mr-1" title="You">${escapeHtml(a)}</span>`
      : `<span class="badge badge-secondary mr-1">${escapeHtml(a)}</span>`;
  });
  return adminBadges.join('');
}

async function getLoggedInUserId() {
  try {
    if (window.auth0) {
      const ok = await window.auth0.isAuthenticated();
      if (ok) {
        const user = await window.auth0.getUser();
        return user?.email || user?.nickname || user?.sub || null;
      }
    }
  } catch (e) {
    console.error(e);
  }
  return null;
}

async function loadGroupInvites(email) {
  const loadingEl = document.getElementById('invites-loading');
  const errorEl = document.getElementById('invites-error');
  const emptyEl = document.getElementById('invites-empty');
  const tableEl = document.getElementById('invites-table');
  const tbodyEl = document.getElementById('invites-tbody');

  loadingEl.style.display = 'block';
  errorEl.style.display = 'none';
  emptyEl.style.display = 'none';
  tableEl.style.display = 'none';
  tbodyEl.innerHTML = '';

  try {
    const response = await fetch(
      '/api/groups/invites?user_id=' + encodeURIComponent(email)
    );
    if (response.status === 503) {
      loadingEl.style.display = 'none';
      errorEl.textContent =
        'Groups require Supabase. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and create the group_members table.';
      errorEl.style.display = 'block';
      return;
    }
    if (!response.ok) throw new Error('Failed to fetch group invitations');

    const rows = await response.json();
    loadingEl.style.display = 'none';

    if (!rows.length) {
      emptyEl.style.display = 'block';
      return;
    }

    tableEl.style.display = 'table';
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(row.group_name || '')}</td>
        <td>
          <button type="button" class="btn btn-sm btn-success group-invite-accept mr-1" data-id="${escapeHtml(String(row.id))}">Accept</button>
          <button type="button" class="btn btn-sm btn-outline-danger group-invite-reject" data-id="${escapeHtml(String(row.id))}">Reject</button>
        </td>
      `;
      tbodyEl.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    loadingEl.style.display = 'none';
    errorEl.textContent = 'Failed to load group invitations. Please refresh.';
    errorEl.style.display = 'block';
  }
}

async function loadGroups(email) {
  const loadingEl = document.getElementById('groups-loading');
  const errorEl = document.getElementById('groups-error');
  const emptyEl = document.getElementById('groups-empty');
  const tableEl = document.getElementById('groups-table');
  const tbodyEl = document.getElementById('groups-tbody');

  loadingEl.style.display = 'block';
  errorEl.style.display = 'none';
  emptyEl.style.display = 'none';
  tableEl.style.display = 'none';
  tbodyEl.innerHTML = '';

  try {
    const response = await fetch(
      '/api/groups?user_id=' + encodeURIComponent(email)
    );
    if (response.status === 503) {
      loadingEl.style.display = 'none';
      errorEl.textContent =
        'Groups require Supabase. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and create the group_members and groups tables.';
      errorEl.style.display = 'block';
      return;
    }
    if (!response.ok) throw new Error('Failed to fetch groups');

    const rows = await response.json();
    loadingEl.style.display = 'none';

    if (!rows.length) {
      emptyEl.style.display = 'block';
      return;
    }

    tableEl.style.display = 'table';
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      tr.dataset.groupName = row.group_name || '';
      const adminsInner = buildAdminsCellHtml(email, row);
      const adminsCell = adminsInner || '<span class="text-muted">—</span>';
      const visibilityCell = row.visibility
        ? escapeHtml(String(row.visibility))
        : '<span class="text-muted">—</span>';
      const handleRaw = row.handle != null && String(row.handle).trim()
        ? String(row.handle).trim()
        : '';
      const handleCell = handleRaw
        ? escapeHtml(formatGroupHandleForDisplay(handleRaw))
        : '<span class="text-muted">—</span>';
      const groupPageUrl = handleRaw ? groupPageUrlFromHandle(handleRaw) : '';
      const gn = row.group_name || '';
      const groupNameCell = groupPageUrl
        ? `<a href="${escapeHtml(groupPageUrl)}" class="groups-list-group-link">${escapeHtml(gn)}</a>`
        : escapeHtml(gn);
      tr.innerHTML = `
        <td>${groupNameCell}</td>
        <td class="groups-col-handle-cell">${handleCell}</td>
        <td class="groups-col-admins-cell">${adminsCell}</td>
        <td class="groups-col-visibility-cell">${visibilityCell}</td>
      `;
      tbodyEl.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    loadingEl.style.display = 'none';
    errorEl.textContent = 'Failed to load groups. Please refresh the page.';
    errorEl.style.display = 'block';
  }
}

async function loadGroupsPage() {
  const email = await getLoggedInUserId();
  if (!email) {
    ['invites-loading', 'groups-loading'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    const ie = document.getElementById('invites-empty');
    const ge = document.getElementById('groups-empty');
    if (ie) { ie.textContent = 'Please log in to view group invitations.'; ie.style.display = 'block'; }
    if (ge) { ge.textContent = 'Please log in to view your groups.'; ge.style.display = 'block'; }
    return;
  }
  await Promise.all([loadGroupInvites(email), loadGroups(email)]);
}

async function respondToInvite(id, action) {
  const userId = await getLoggedInUserId();
  if (!userId) { alert('You must be logged in.'); return; }

  try {
    const response = await fetch('/api/groups/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, action })
    });
    if (response.status === 503) { alert('Groups require Supabase.'); return; }
    if (!response.ok) {
      const j = await response.json().catch(() => ({}));
      throw new Error(j.error || 'Could not update invitation');
    }
    await loadGroupsPage();
  } catch (err) {
    console.error(err);
    alert(err.message || 'Something went wrong. Please try again.');
  }
}

const originalUpdateContentVisibility = updateContentVisibility;
updateContentVisibility = function (isAuthenticated) {
  originalUpdateContentVisibility(isAuthenticated);
  if (isAuthenticated) setTimeout(loadGroupsPage, 100);
};

// Tracks whether the modal is open for editing an existing group (stores group_name) or creating new (null)
let currentEditGroupName = null;
/** When editing, admin emails from the server (no UI field — sent unchanged on save). */
let loadedGroupAdmins = [];

function parseEmailList(raw) {
  return (raw || '')
    .split(/[\n,]+/)
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

function setGroupModalMode(mode) {
  const titleEl = document.getElementById('createGroupModalLabel');
  const submitBtn = document.getElementById('create-group-submit');
  const nameEl = document.getElementById('cg-group-name');
  const membersSectionEl = document.getElementById('cg-members-section');
  if (mode === 'edit') {
    titleEl.textContent = 'Edit Group';
    submitBtn.textContent = 'Save';
    nameEl.readOnly = true;
    if (membersSectionEl) membersSectionEl.style.display = 'block';
  } else {
    titleEl.textContent = 'Create Group';
    submitBtn.textContent = 'Create Group';
    nameEl.readOnly = false;
    if (membersSectionEl) membersSectionEl.style.display = 'none';
  }
}

function openCreateGroupModal() {
  currentEditGroupName = null;
  loadedGroupAdmins = [];
  document.getElementById('create-group-form').reset();
  document.getElementById('create-group-error').style.display = 'none';
  const invitedEl = document.getElementById('cg-invited-members');
  if (invitedEl) invitedEl.value = '';
  const membersEl = document.getElementById('cg-members');
  if (membersEl) membersEl.value = '';
  setGroupModalMode('create');
  if (window.jQuery) window.jQuery('#createGroupModal').modal('show');
}

async function openEditGroupModal(groupName) {
  currentEditGroupName = groupName;
  document.getElementById('create-group-form').reset();
  document.getElementById('create-group-error').style.display = 'none';
  const loadingEl = document.getElementById('create-group-loading');
  const formEl = document.getElementById('create-group-form');
  setGroupModalMode('edit');
  if (window.jQuery) window.jQuery('#createGroupModal').modal('show');

  loadingEl.style.display = 'block';
  formEl.style.display = 'none';

  try {
    const res = await fetch('/api/groups/details?group_name=' + encodeURIComponent(groupName));
    if (!res.ok) throw new Error('Could not load group details');
    const details = await res.json();

    document.getElementById('cg-group-name').value = details.group_name || '';
    const visEl = document.getElementById('cg-visibility');
    visEl.value = details.visibility || '';
    loadedGroupAdmins = Array.isArray(details.admins) ? [...details.admins] : [];
    document.getElementById('cg-invited-members').value = (details.invited_members || []).join(', ');
    document.getElementById('cg-members').value = (details.members || []).join(', ');
  } catch (err) {
    console.error(err);
    document.getElementById('create-group-error').textContent = 'Failed to load group details.';
    document.getElementById('create-group-error').style.display = 'block';
  } finally {
    loadingEl.style.display = 'none';
    formEl.style.display = 'block';
  }
}

async function createGroupSubmit() {
  const errorEl = document.getElementById('create-group-error');
  const nameEl = document.getElementById('cg-group-name');
  const visibilityEl = document.getElementById('cg-visibility');
  const invitedMembersEl = document.getElementById('cg-invited-members');
  const membersEl = document.getElementById('cg-members');
  const submitBtn = document.getElementById('create-group-submit');

  errorEl.style.display = 'none';
  errorEl.textContent = '';

  const groupName = nameEl.value.trim();
  const visibility = visibilityEl.value.trim();
  const isEdit = currentEditGroupName !== null;
  const admins = isEdit
    ? parseEmailList((loadedGroupAdmins || []).join(','))
    : [];
  const invited_members =
    isEdit && invitedMembersEl
      ? parseEmailList(invitedMembersEl.value)
      : [];
  const members = membersEl ? parseEmailList(membersEl.value) : [];

  if (!groupName) { errorEl.textContent = 'Group Name is required.'; errorEl.style.display = 'block'; nameEl.focus(); return; }
  if (!visibility) { errorEl.textContent = 'Please select a Visibility.'; errorEl.style.display = 'block'; visibilityEl.focus(); return; }

  const userId = await getLoggedInUserId();
  if (!userId) { errorEl.textContent = 'You must be logged in.'; errorEl.style.display = 'block'; return; }

  submitBtn.disabled = true;
  submitBtn.textContent = isEdit ? 'Saving…' : 'Creating…';

  try {
    let response;
    if (isEdit) {
      response = await fetch('/api/groups/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, group_name: groupName, visibility, admins, members, invited_members })
      });
    } else {
      response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, group_name: groupName, visibility, admins, invited_members })
      });
    }

    if (response.status === 503) throw new Error('Groups require Supabase to be configured.');
    if (response.status === 409) throw new Error('A group with that name already exists.');
    if (!response.ok) {
      const j = await response.json().catch(() => ({}));
      throw new Error(j.error || (isEdit ? 'Failed to save changes.' : 'Failed to create group.'));
    }

    document.getElementById('create-group-form').reset();
    if (window.jQuery) window.jQuery('#createGroupModal').modal('hide');
    await loadGroupsPage();
  } catch (err) {
    console.error(err);
    errorEl.textContent = err.message || 'Something went wrong. Please try again.';
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = isEdit ? 'Save' : 'Create Group';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const invitesTbody = document.getElementById('invites-tbody');
  if (invitesTbody) {
    invitesTbody.addEventListener('click', (e) => {
      const accept = e.target.closest('.group-invite-accept');
      const reject = e.target.closest('.group-invite-reject');
      const btn = accept || reject;
      if (!btn || !btn.dataset.id) return;
      respondToInvite(btn.dataset.id, accept ? 'accept' : 'reject');
    });
  }

  const submitBtn = document.getElementById('create-group-submit');
  if (submitBtn) submitBtn.addEventListener('click', createGroupSubmit);

  const groupsTbody = document.getElementById('groups-tbody');
  if (groupsTbody) {
    groupsTbody.addEventListener('click', (e) => {
      if (e.target.closest('a.groups-list-group-link')) return;
      if (e.target.closest('a.groups-list-admin-profile-link')) return;
      if (e.target.closest('td.groups-col-handle-cell, td.groups-col-visibility-cell')) return;
      const tr = e.target.closest('tr[data-group-name]');
      if (!tr) return;
      openEditGroupModal(tr.dataset.groupName);
    });
  }
});
