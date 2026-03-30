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
      const adminBadges = (row.admin_list || []).map(a => {
        const isMe = a.toLowerCase() === email.toLowerCase();
        return isMe
          ? `<span class="badge badge-primary mr-1" title="You">${escapeHtml(a)}</span>`
          : `<span class="badge badge-secondary mr-1">${escapeHtml(a)}</span>`;
      }).join('');
      const adminsCell = adminBadges || '<span class="text-muted">—</span>';
      const visibilityCell = row.visibility
        ? escapeHtml(String(row.visibility))
        : '<span class="text-muted">—</span>';
      tr.innerHTML = `
        <td>${escapeHtml(row.group_name || '')}</td>
        <td>${adminsCell}</td>
        <td>${visibilityCell}</td>
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

function parseEmailList(raw) {
  return (raw || '')
    .split(/[\n,]+/)
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

function setGroupModalMode(mode) {
  const titleEl = document.getElementById('createGroupModalLabel');
  const submitBtn = document.getElementById('create-group-submit');
  const editActions = document.getElementById('cg-edit-actions');
  const nameEl = document.getElementById('cg-group-name');
  const membersSectionEl = document.getElementById('cg-members-section');
  if (mode === 'edit') {
    titleEl.textContent = 'Edit Group';
    submitBtn.textContent = 'Save';
    editActions.classList.remove('d-none');
    nameEl.readOnly = true;
    if (membersSectionEl) membersSectionEl.style.display = 'block';
  } else {
    titleEl.textContent = 'Create Group';
    submitBtn.textContent = 'Create Group';
    editActions.classList.add('d-none');
    nameEl.readOnly = false;
    if (membersSectionEl) membersSectionEl.style.display = 'none';
  }
}

function openCreateGroupModal() {
  currentEditGroupName = null;
  document.getElementById('create-group-form').reset();
  document.getElementById('create-group-error').style.display = 'none';
  const invitedEl = document.getElementById('cg-invited-members');
  if (invitedEl) invitedEl.value = '';
  const membersEl = document.getElementById('cg-members');
  if (membersEl) membersEl.value = '';
  // Reset the invited members label (may have been changed by visibility toggle)
  const invitedLabel = document.querySelector('label[for="cg-invited-members"]');
  if (invitedLabel) invitedLabel.innerHTML = 'Invited Members <span class="text-danger">*</span>';
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
    document.getElementById('cg-admins').value = (details.admins || []).join(', ');
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
  const adminsEl = document.getElementById('cg-admins');
  const invitedMembersEl = document.getElementById('cg-invited-members');
  const membersEl = document.getElementById('cg-members');
  const submitBtn = document.getElementById('create-group-submit');

  errorEl.style.display = 'none';
  errorEl.textContent = '';

  const groupName = nameEl.value.trim();
  const visibility = visibilityEl.value.trim();
  const admins = parseEmailList(adminsEl.value);
  const invited_members = parseEmailList(invitedMembersEl.value);
  const members = membersEl ? parseEmailList(membersEl.value) : [];

  const isEdit = currentEditGroupName !== null;

  if (!groupName) { errorEl.textContent = 'Group Name is required.'; errorEl.style.display = 'block'; nameEl.focus(); return; }
  if (!visibility) { errorEl.textContent = 'Please select a Visibility.'; errorEl.style.display = 'block'; visibilityEl.focus(); return; }
  if (!admins.length) { errorEl.textContent = 'At least one Admin email is required.'; errorEl.style.display = 'block'; adminsEl.focus(); return; }
  if (!isEdit && !invited_members.length) { errorEl.textContent = 'At least one Invited Member email is required.'; errorEl.style.display = 'block'; invitedMembersEl.focus(); return; }

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

async function deleteGroupHandler() {
  const groupName = currentEditGroupName;
  if (!groupName) return;
  if (!confirm('Are you sure you want to delete "' + groupName + '"? This cannot be undone.')) return;

  const errorEl = document.getElementById('create-group-error');
  errorEl.style.display = 'none';
  const deleteBtn = document.getElementById('cg-delete-btn');
  deleteBtn.disabled = true;
  deleteBtn.textContent = 'Deleting…';

  try {
    const userId = await getLoggedInUserId();
    if (!userId) throw new Error('You must be logged in.');

    const response = await fetch('/api/groups/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, group_name: groupName })
    });
    if (!response.ok) {
      const j = await response.json().catch(() => ({}));
      throw new Error(j.error || 'Failed to delete group.');
    }
    if (window.jQuery) window.jQuery('#createGroupModal').modal('hide');
    await loadGroupsPage();
  } catch (err) {
    console.error(err);
    errorEl.textContent = err.message || 'Something went wrong. Please try again.';
    errorEl.style.display = 'block';
  } finally {
    deleteBtn.disabled = false;
    deleteBtn.textContent = 'Delete Group';
  }
}

async function leaveGroupHandler() {
  const groupName = currentEditGroupName;
  if (!groupName) return;
  if (!confirm('Are you sure you want to leave "' + groupName + '"?')) return;

  const errorEl = document.getElementById('create-group-error');
  errorEl.style.display = 'none';
  const leaveBtn = document.getElementById('cg-leave-btn');
  leaveBtn.disabled = true;
  leaveBtn.textContent = 'Leaving…';

  try {
    const userId = await getLoggedInUserId();
    if (!userId) throw new Error('You must be logged in.');

    const response = await fetch('/api/groups/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, group_name: groupName })
    });
    if (!response.ok) {
      const j = await response.json().catch(() => ({}));
      throw new Error(j.error || 'Failed to leave group.');
    }
    if (window.jQuery) window.jQuery('#createGroupModal').modal('hide');
    await loadGroupsPage();
  } catch (err) {
    console.error(err);
    errorEl.textContent = err.message || 'Something went wrong. Please try again.';
    errorEl.style.display = 'block';
  } finally {
    leaveBtn.disabled = false;
    leaveBtn.textContent = 'Leave';
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

  // Swap "Invited Members" ↔ "Members" label based on visibility selection
  const visibilityEl = document.getElementById('cg-visibility');
  const invitedLabel = document.querySelector('label[for="cg-invited-members"]');
  if (visibilityEl && invitedLabel) {
    visibilityEl.addEventListener('change', () => {
      if (currentEditGroupName === null) {
        invitedLabel.innerHTML = visibilityEl.value === 'Only me'
          ? 'Members <span class="text-danger">*</span>'
          : 'Invited Members <span class="text-danger">*</span>';
      }
    });
  }

  const deleteBtn = document.getElementById('cg-delete-btn');
  if (deleteBtn) deleteBtn.addEventListener('click', deleteGroupHandler);

  const leaveBtn = document.getElementById('cg-leave-btn');
  if (leaveBtn) leaveBtn.addEventListener('click', leaveGroupHandler);

  const groupsTbody = document.getElementById('groups-tbody');
  if (groupsTbody) {
    groupsTbody.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-group-name]');
      if (!tr) return;
      openEditGroupModal(tr.dataset.groupName);
    });
  }
});
