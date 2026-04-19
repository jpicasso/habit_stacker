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

/** Placeholder before `/api/contact-photo` returns a `contact_photos` URL. */
const LIST_CONTACT_PHOTO_PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 72 72"><circle cx="36" cy="36" r="36" fill="#dee2e6"/><circle cx="36" cy="27" r="11" fill="#adb5bd"/><path d="M12 60c4-10 14-16 24-16s20 6 24 16" fill="#adb5bd"/></svg>'
  );

/**
 * Resolve public URLs from bucket `contact_photos` via API (same as profiles.html).
 */
async function hydrateFriendsListContactPhotos(tbodyEl, ownersHandle) {
  if (!tbodyEl || !ownersHandle) return;
  const imgs = tbodyEl.querySelectorAll(
    'img.friends-list-contact-photo[data-contact-name]'
  );
  await Promise.all(
    [...imgs].map(async img => {
      const cn = img.getAttribute('data-contact-name');
      if (!cn) return;
      try {
        const res = await fetch(
          '/api/contact-photo?owners_handle=' +
            encodeURIComponent(ownersHandle) +
            '&contact_name=' +
            encodeURIComponent(cn)
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.url) {
          img.src = data.url;
          img.alt = '';
        }
      } catch (e) {
        console.warn('Contact list photo:', e);
      }
    })
  );
}

/** Group page: `profile_photos` for rows with `, friend` (stem = `person_handle`); else `contact_photos` by `person_handle`. */
function groupMemberRowUsesProfilePhoto(displayStatus) {
  const s = String(displayStatus || '');
  return s.includes(', friend');
}

async function hydrateGroupMemberPhotos(tbodyEl) {
  if (!tbodyEl) return;
  const profileImgs = tbodyEl.querySelectorAll(
    'img.friends-list-contact-photo[data-profile-photo-handle]'
  );
  await Promise.all(
    [...profileImgs].map(async img => {
      const h = img.getAttribute('data-profile-photo-handle');
      if (!h) return;
      try {
        const res = await fetch(
          '/api/profile/photo?handle=' + encodeURIComponent(h)
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.url) {
          img.src = data.url;
          img.alt = '';
        }
      } catch (e) {
        console.warn('Group member profile photo:', e);
      }
    })
  );
  const contactImgs = tbodyEl.querySelectorAll(
    'img.friends-list-contact-photo[data-contact-photo-handle]'
  );
  await Promise.all(
    [...contactImgs].map(async img => {
      const ph = img.getAttribute('data-contact-photo-handle');
      if (!ph) return;
      try {
        const res = await fetch(
          '/api/contact-photo?person_handle=' + encodeURIComponent(ph)
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.url) {
          img.src = data.url;
          img.alt = '';
        }
      } catch (e) {
        console.warn('Group member contact photo:', e);
      }
    })
  );
}

function isContactLibraryPage() {
  return window.location.pathname.indexOf('contact_library') !== -1;
}

/** `/events/group/@handle` — dynamic group detail (see server `GET /events/group/:groupPath`). */
function isGroupPage() {
  return /^\/events\/group\/.+/.test(window.location.pathname);
}

/** Path segment after `/events/group/` (e.g. `@collegefriends_johnpicasso`). */
function getGroupHandleFromUrl() {
  const m = window.location.pathname.match(/^\/events\/group\/(.+)$/);
  if (!m) return '';
  try {
    return decodeURIComponent(m[1]);
  } catch (e) {
    return m[1];
  }
}

function addModalDefaultSubmitLabel() {
  if (isContactLibraryPage()) return 'Add contact';
  if (isGroupPage()) return 'Add member';
  return 'Add';
}

/** Trim, collapse spaces, lowercase — for sorting names. */
function normalizePersonSortKey(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Ascending A→Z; empty names last. */
function comparePersonNamesAsc(a, b) {
  const ka = normalizePersonSortKey(a.name);
  const kb = normalizePersonSortKey(b.name);
  if (!ka && !kb) return 0;
  if (!ka) return 1;
  if (!kb) return -1;
  return ka.localeCompare(kb, undefined, { sensitivity: 'base', numeric: true });
}

/** Enriched rows for row-click modal (set in loadFriendsAndContacts). */
let friendsListEntriesCache = [];

/** Matches server `normalizePersonHandle` / mutual-groups map keys. */
function personHandleKey(handleRaw) {
  return String(handleRaw || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
}

/** Matches server `contact_details.handle` suffix (letters/digits only, lowercased). */
function contactDisplayNameToUrlSlug(name) {
  return String(name || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

/**
 * Contact list row now links to profiles page.
 * @param {string} _name Display name (unused for profile URL)
 * @param {string} ownersHandle Profile handle (`contact_details.owners_handle`)
 */
function contactPageHrefForListName(_name, ownersHandle) {
  const oh = String(ownersHandle || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
  if (!oh) return '/events/profiles.html';
  return '/events/@' + encodeURIComponent(oh);
}

/** Group member row -> `/events/@<person_handle>`. */
function contactPageHrefForPersonHandle(personHandle) {
  const raw = String(personHandle || '')
    .trim()
    .replace(/^@+/, '');
  if (!raw) return '/events/profiles.html';
  return '/events/@' + encodeURIComponent(raw);
}

/** Public profile page from `profiles.handle`, e.g. `/events/@picasso20` (see server `/events/@:handle`). */
function profilePageUrlFromHandle(handleRaw) {
  const h = handleRaw != null ? String(handleRaw).trim() : '';
  if (!h) return '';
  const noAt = h.replace(/^@+/, '');
  if (!noAt) return '';
  return '/events/@' + encodeURIComponent(noAt);
}

/** Group page URL from `groups.group_handle` / `group_members.group_handle` (see `/events/group/@…`). */
function groupPageUrlFromHandle(handleRaw) {
  const h = handleRaw != null ? String(handleRaw).trim() : '';
  if (!h) return '';
  const noAt = h.replace(/^@+/, '');
  if (!noAt) return '';
  return '/events/group/@' + encodeURIComponent(noAt);
}

async function handleGroupMemberRemoveClick(btn, tbodyEl) {
  const tr = btn.closest('tr.group-member-row');
  if (!tr || !tr.dataset.personHandle) return;
  const groupName = tbodyEl.dataset.groupDisplayName || 'this group';
  const memberDisplay =
    (btn.dataset.memberDisplay && String(btn.dataset.memberDisplay).trim()) ||
    tr.dataset.personHandle ||
    'this member';
  const personHandle = tr.dataset.personHandle;
  if (
    !confirm(
      'Are you sure you want to remove ' +
        memberDisplay +
        ' from the ' +
        groupName +
        '?'
    )
  ) {
    return;
  }
  const userId = await getLoggedInUserId();
  if (!userId) {
    alert('You must be logged in.');
    return;
  }
  const gh = getGroupHandleFromUrl();
  try {
    const res = await fetch('/api/groups/member-by-group-handle', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        group_handle: gh,
        person_handle: personHandle
      })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(j.error || 'Could not remove member');
    }
    await loadGroupMembersPage();
  } catch (err) {
    console.error(err);
    alert(err.message || 'Could not remove member.');
  }
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

/** Profile `handle` matches `contact_details.owners_handle` (see /api/contact-details/list). */
async function fetchProfileHandle(userId) {
  try {
    const res = await fetch(
      '/api/person-handle?user_id=' + encodeURIComponent(userId)
    );
    if (!res.ok) return null;
    const row = await res.json();
    if (!row || !row.person_handle) return null;
    return String(row.person_handle).trim().replace(/^@+/, '');
  } catch (e) {
    console.error(e);
    return null;
  }
}

function setMyProfileNavHref(personHandle) {
  if (!personHandle) return;
  const h = String(personHandle).trim().replace(/^@+/, '');
  if (!h) return;
  const links = document.querySelectorAll(
    'a[href="/events/profiles.html"], a[data-nav="my-profile"]'
  );
  links.forEach(a => {
    a.href = '/events/@' + encodeURIComponent(h);
    a.setAttribute('data-nav', 'my-profile');
  });
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
    const enriched = await Promise.all(
      rows.map(async (row) => {
        const inviterHandle =
          row.user1 != null ? String(row.user1).trim() : '';
        let inviterName = inviterHandle;
        if (inviterHandle) {
          try {
            const pr = await fetch(
              '/api/profile/by-handle?handle=' +
                encodeURIComponent(inviterHandle)
            );
            if (pr.ok) {
              const p = await pr.json();
              if (p && p.name != null && String(p.name).trim() !== '') {
                inviterName = String(p.name).trim();
              }
            }
          } catch (e) {
            /* ignore */
          }
        }
        return { row, inviterHandle, inviterName };
      })
    );
    enriched.forEach(({ row, inviterHandle, inviterName }) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(inviterName)}</td>
        <td>${escapeHtml(inviterHandle)}</td>
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

async function loadGroupMembersPage() {
  const loadingEl = document.getElementById('friends-loading');
  const errorEl = document.getElementById('friends-error');
  const emptyEl = document.getElementById('friends-empty');
  const tableEl = document.getElementById('friends-table');
  const tbodyEl = document.getElementById('friends-tbody');
  const titleEl = document.getElementById('group-page-title');
  if (!loadingEl || !errorEl || !emptyEl || !tableEl || !tbodyEl) return;

  loadingEl.style.display = 'block';
  errorEl.style.display = 'none';
  emptyEl.style.display = 'none';
  tableEl.style.display = 'none';
  tbodyEl.innerHTML = '';

  const handle = getGroupHandleFromUrl();
  if (!handle) {
    loadingEl.style.display = 'none';
    errorEl.textContent = 'Invalid group link.';
    errorEl.style.display = 'block';
    if (titleEl) titleEl.textContent = 'Group';
    return;
  }

  try {
    const gRes = await fetch(
      '/api/groups/by-handle?handle=' + encodeURIComponent(handle)
    );
    if (gRes.status === 503) {
      loadingEl.style.display = 'none';
      errorEl.textContent =
        'Groups require Supabase. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.';
      errorEl.style.display = 'block';
      return;
    }
    if (gRes.status === 404) {
      loadingEl.style.display = 'none';
      errorEl.textContent = 'Group not found.';
      errorEl.style.display = 'block';
      if (titleEl) titleEl.textContent = 'Group';
      return;
    }
    if (!gRes.ok) throw new Error('Failed to load group');
    const groupRow = await gRes.json();
    const groupName =
      groupRow.group_name != null ? String(groupRow.group_name).trim() : '';
    if (titleEl) titleEl.textContent = groupName || 'Group';
    tbodyEl.dataset.groupDisplayName = groupName || '';

    const viewerId = await getLoggedInUserId();
    let membersUrl =
      '/api/groups/members-by-group-handle?group_handle=' +
      encodeURIComponent(handle);
    if (viewerId) {
      membersUrl += '&user_id=' + encodeURIComponent(viewerId);
    }
    const mRes = await fetch(membersUrl);
    if (mRes.status === 503) {
      loadingEl.style.display = 'none';
      errorEl.textContent =
        'Groups require Supabase. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.';
      errorEl.style.display = 'block';
      return;
    }
    if (!mRes.ok) throw new Error('Failed to load members');
    const members = await mRes.json();

    loadingEl.style.display = 'none';

    if (!Array.isArray(members) || !members.length) {
      emptyEl.style.display = 'block';
      return;
    }

    tableEl.style.display = 'table';
    members.forEach(row => {
      const tr = document.createElement('tr');
      const displayName =
        row.display_name != null && String(row.display_name).trim() !== ''
          ? String(row.display_name).trim()
          : '';
      const cn =
        row.contact_name != null && String(row.contact_name).trim() !== ''
          ? String(row.contact_name).trim()
          : '';
      const member =
        displayName ||
        cn ||
        (row.person_handle != null ? String(row.person_handle) : '');
      const status =
        row.display_status != null && String(row.display_status).trim() !== ''
          ? String(row.display_status).trim()
          : row.status != null
            ? String(row.status)
            : '';
      const ph = row.person_handle != null ? String(row.person_handle) : '';
      const useProfilePhoto = ph && groupMemberRowUsesProfilePhoto(status);
      const photoHtml =
        ph && useProfilePhoto
          ? `<img src="${LIST_CONTACT_PHOTO_PLACEHOLDER}" width="36" height="36" class="friends-list-contact-photo rounded-circle flex-shrink-0 mr-2" alt="" data-profile-photo-handle="${escapeAttr(ph)}" />`
          : ph
            ? `<img src="${LIST_CONTACT_PHOTO_PLACEHOLDER}" width="36" height="36" class="friends-list-contact-photo rounded-circle flex-shrink-0 mr-2" alt="" data-contact-photo-handle="${escapeAttr(ph)}" />`
            : '';
      const nameCell = ph
        ? `<span class="d-inline-flex align-items-center min-w-0">${photoHtml}<span class="text-break">${escapeHtml(member)}</span></span>`
        : escapeHtml(member);
      const removeBtnHtml = ph
        ? `<button type="button" class="btn btn-link btn-sm text-danger p-0 border-0 group-member-remove-btn" title="Remove from group" aria-label="Remove from group" data-member-display="${escapeAttr(member)}"><span class="material-icons align-middle" style="font-size:22px;line-height:1;">delete</span></button>`
        : '';
      tr.innerHTML = `
        <td>${nameCell}</td>
        <td>${escapeHtml(status)}</td>
        <td>${escapeHtml(ph)}</td>
        <td class="text-right align-middle">${removeBtnHtml}</td>
      `;
      if (ph) {
        tr.classList.add('group-member-row');
        tr.dataset.personHandle = ph;
        tr.style.cursor = 'pointer';
        tr.setAttribute('title', 'Open contact');
      }
      tbodyEl.appendChild(tr);
    });
    await hydrateGroupMemberPhotos(tbodyEl);
  } catch (err) {
    console.error(err);
    loadingEl.style.display = 'none';
    errorEl.textContent =
      err.message || 'Failed to load group. Please refresh the page.';
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

  const contactLibraryOnly = isContactLibraryPage();

  try {
    const ownersHandle = await fetchProfileHandle(email);

    let friendRows = [];
    let contactLibraryRows = [];

    const friendsRes = await fetch(
      '/api/friends?user_id=' + encodeURIComponent(email)
    );
    if (friendsRes.status === 503) {
      loadingEl.style.display = 'none';
      errorEl.textContent =
        'Friends require Supabase. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.';
      errorEl.style.display = 'block';
      return;
    }
    if (!friendsRes.ok) throw new Error('Failed to fetch friends');
    friendRows = await friendsRes.json();

    if (contactLibraryOnly && ownersHandle) {
      try {
        const libraryRowsRes = await fetch(
          '/api/contact-library/by-owner-handle?owner_handle=' +
            encodeURIComponent(ownersHandle)
        );
        if (libraryRowsRes.status === 503) {
          console.warn('contact_library requires Supabase.');
        } else if (libraryRowsRes.ok) {
          const payload = await libraryRowsRes.json();
          contactLibraryRows = Array.isArray(payload) ? payload : [];
        } else {
          console.warn(
            'GET /api/contact-library/by-owner-handle failed:',
            libraryRowsRes.status,
            await libraryRowsRes.text().catch(() => '')
          );
        }
      } catch (e) {
        console.warn(e);
      }
    }

    loadingEl.style.display = 'none';

    const entries = [];

    // Always include connected friends from `friends` DT.
    friendRows.forEach(row => {
      const friendHandle =
        row.other_user != null ? String(row.other_user).trim() : '';
      const displayName =
        row.friend_display_name != null &&
            String(row.friend_display_name).trim() !== ''
          ? String(row.friend_display_name).trim()
          : friendHandle;
      const lookupEmail =
        row.other_user_email != null && String(row.other_user_email).trim() !== ''
          ? String(row.other_user_email).trim()
          : friendHandle;
      if (!friendHandle) return;
      entries.push({
        name: displayName,
        friendHandle: friendHandle || undefined,
        lookupEmail,
        type: 'friend',
        connectionLabel: 'Connected',
        id: String(row.id),
        notes: ''
      });
    });

    // On contact library page, also include contacts from `contact_library` DT.
    if (contactLibraryOnly && contactLibraryRows.length) {
      contactLibraryRows.forEach((row, idx) => {
        const personHandle =
          row.person_handle != null ? String(row.person_handle).trim() : '';
        const displayName = row.name != null ? String(row.name).trim() : '';
        if (!personHandle) return;
        entries.push({
          name: displayName || personHandle,
          friendHandle: personHandle || undefined,
          lookupEmail: personHandle,
          type: 'friend',
          connectionLabel: 'Contact',
          id: 'cl-' + String(idx),
          notes: ''
        });
      });
    }

    // Deduplicate by handle: keep Connected over Contact.
    if (contactLibraryOnly) {
      const byHandle = new Map();
      entries.forEach(e => {
        const h = e.friendHandle ? String(e.friendHandle).trim() : '';
        if (!h) return;
        const key = personHandleKey(h);
        const existing = byHandle.get(key);
        if (!existing) {
          byHandle.set(key, e);
          return;
        }
        const existingConnected = existing.connectionLabel === 'Connected';
        const nextConnected = e.connectionLabel === 'Connected';
        if (!existingConnected && nextConnected) {
          byHandle.set(key, e);
          return;
        }
        if (existingConnected === nextConnected) {
          const en = existing.name ? String(existing.name).trim() : '';
          const nn = e.name ? String(e.name).trim() : '';
          if (!en && nn) byHandle.set(key, e);
        }
      });
      entries.length = 0;
      entries.push(...Array.from(byHandle.values()));
    }

    if (!entries.length) {
      emptyEl.style.display = 'block';
      return;
    }

    entries.sort(comparePersonNamesAsc);

    let mutualByHandle = {};
    const handles = [
      ...new Set(
        entries
          .filter(e => e.type === 'friend' && e.friendHandle)
          .map(e => String(e.friendHandle).trim())
          .filter(Boolean)
      )
    ];
    if (handles.length) {
      const mutualRes = await fetch('/api/groups/mutual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: email, handles })
      });
      if (mutualRes.ok) {
        const data = await mutualRes.json();
        mutualByHandle = data.groupsByHandle || {};
      } else {
        console.warn(
          'POST /api/groups/mutual failed:',
          mutualRes.status,
          await mutualRes.text().catch(() => '')
        );
      }
    }

    friendsListEntriesCache = entries.map(entry => ({
      ...entry,
      groupsList:
        entry.type === 'friend' && entry.friendHandle
          ? mutualByHandle[personHandleKey(entry.friendHandle)] || []
          : []
    }));

    tableEl.style.display = 'table';
    friendsListEntriesCache.forEach((entry, idx) => {
      const tr = document.createElement('tr');
      tr.classList.add('friends-table-row');
      tr.dataset.entryIndex = String(idx);

      const sharedGroups = entry.groupsList;
      let groupsCell = '<span class="text-muted small">—</span>';
      if (sharedGroups.length) {
        groupsCell = sharedGroups
          .map(g => `<span class="badge badge-info mr-1">${escapeHtml(g)}</span>`)
          .join('');
      }

      const photoHtml =
        entry.friendHandle && String(entry.friendHandle).trim() !== ''
          ? `<img src="${LIST_CONTACT_PHOTO_PLACEHOLDER}" width="36" height="36" class="friends-list-contact-photo rounded-circle flex-shrink-0 mr-2" alt="" data-profile-photo-handle="${escapeAttr(entry.friendHandle)}" />`
          : ownersHandle && entry.name && String(entry.name).trim() !== ''
            ? `<img src="${LIST_CONTACT_PHOTO_PLACEHOLDER}" width="36" height="36" class="friends-list-contact-photo rounded-circle flex-shrink-0 mr-2" alt="" data-contact-name="${escapeAttr(entry.name)}" />`
            : '';
      let nameCell;
      if (entry.name && String(entry.name).trim() !== '') {
        const linkTarget =
          entry.type === 'friend' && entry.friendHandle
            ? profilePageUrlFromHandle(entry.friendHandle)
            : contactPageHrefForListName(entry.name, ownersHandle);
        const href = escapeAttr(linkTarget);
        const label = escapeHtml(entry.name);
        nameCell = photoHtml
          ? `<a href="${href}" class="friends-name-link d-inline-flex align-items-center min-w-0 text-body text-decoration-none">${photoHtml}<span class="text-break text-primary">${label}</span></a>`
          : `<a href="${href}" class="friends-name-link">${label}</a>`;
      } else {
        nameCell = `${photoHtml}${escapeHtml(entry.name || '')}`;
      }

      const handlePlain =
        entry.type === 'friend'
          ? entry.friendHandle && String(entry.friendHandle).trim() !== ''
            ? String(entry.friendHandle).trim()
            : ''
          : entry.contactHandle && String(entry.contactHandle).trim() !== ''
            ? String(entry.contactHandle).trim()
            : '';
      const handleCell = handlePlain
        ? escapeHtml(handlePlain)
        : '<span class="text-muted small">—</span>';

      const connectionCell = escapeHtml(
        entry.connectionLabel || (entry.type === 'friend' ? 'Connected' : 'Contact')
      );

      if (contactLibraryOnly) {
        tr.innerHTML = `
        <td>${nameCell}</td>
        <td>${handleCell}</td>
        <td>${connectionCell}</td>
        <td>${groupsCell}</td>
      `;
      } else {
        tr.innerHTML = `
        <td>${nameCell}</td>
        <td>${handleCell}</td>
        <td>${groupsCell}</td>
      `;
      }
      tbodyEl.appendChild(tr);
    });

    hydrateFriendsListContactPhotos(tbodyEl, ownersHandle);
    await hydrateGroupMemberPhotos(tbodyEl);
  } catch (err) {
    console.error(err);
    loadingEl.style.display = 'none';
    errorEl.textContent = 'Failed to load data. Please refresh the page.';
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
      fe.textContent = isGroupPage()
        ? 'Please log in to view this group.'
        : 'Please log in to view your contact library.';
      fe.style.display = 'block';
    }
    return;
  }
  const myHandle = await fetchProfileHandle(email);
  setMyProfileNavHref(myHandle);

  const re = document.getElementById('requests-empty');
  if (re) re.textContent = 'No pending friend requests.';
  const fe = document.getElementById('friends-empty');
  if (fe) {
    fe.textContent = isGroupPage() ? 'No members yet.' : 'No entries yet.';
  }

  if (isGroupPage()) {
    await loadGroupMembersPage();
    return;
  }

  const tasks = [loadFriendsAndContacts(email)];
  if (isContactLibraryPage()) tasks.push(loadIncomingRequests(email));
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
  if (!nameInput) return;
  if (!hFriend || !hContact) {
    if (isGroupPage()) {
      nameInput.setAttribute('type', 'text');
      nameInput.setAttribute('autocomplete', 'off');
    } else if (isContactLibraryPage()) {
      if (status) status.value = 'friend';
      nameInput.setAttribute('type', 'text');
      nameInput.setAttribute('autocomplete', 'username');
      if (groupWrap) groupWrap.classList.add('d-none');
    }
    return;
  }

  if (isGroupPage()) {
    if (status) status.value = 'friend';
    hFriend.classList.remove('d-none');
    hContact.classList.add('d-none');
    nameInput.setAttribute('type', 'email');
    nameInput.setAttribute('autocomplete', 'email');
    if (groupWrap) groupWrap.classList.add('d-none');
    return;
  }
  if (isContactLibraryPage()) {
    if (status) status.value = 'friend';
    hFriend.classList.remove('d-none');
    hContact.classList.add('d-none');
    nameInput.setAttribute('type', 'text');
    nameInput.setAttribute('autocomplete', 'username');
    if (groupWrap) groupWrap.classList.remove('d-none');
    return;
  }

  if (!status) return;
  if (status.value === 'friend') {
    hFriend.classList.remove('d-none');
    hContact.classList.add('d-none');
    nameInput.setAttribute('type', 'text');
    nameInput.setAttribute('autocomplete', 'username');
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
      isContactLibraryPage() ? 'none' : '';
  }
  const label = document.getElementById('addMemberModalLabel');
  if (label) {
    if (isContactLibraryPage()) label.textContent = 'Add contact';
    else if (isGroupPage()) label.textContent = 'Add member';
  }
  const submit = document.getElementById('af-submit');
  if (submit && (isContactLibraryPage() || isGroupPage())) {
    submit.textContent = addModalDefaultSubmitLabel();
  }
}

function resetAddFriendModal() {
  const form = document.getElementById('add-friend-modal-form');
  if (form) form.reset();
  const status = document.getElementById('af-status');
  if (status) {
    if (isContactLibraryPage()) status.value = 'friend';
    else if (isGroupPage()) status.value = 'member';
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
  const status = isGroupPage()
      ? statusEl && statusEl.value
      : statusEl && statusEl.value;
  const notes = notesInput && notesInput.value.trim();
  const groupName =
    groupSel && groupSel.value ? String(groupSel.value).trim() : '';

  if (!name) {
    alert(isGroupPage() ? 'Please enter a handle.' : 'Please enter a name.');
    return;
  }

  const userId = await getLoggedInUserId();
  if (!userId) {
    alert('You must be logged in.');
    return;
  }

  if (isGroupPage()) {
    const role =
      statusEl && statusEl.value
        ? String(statusEl.value).trim().toLowerCase()
        : '';
    if (role !== 'member' && role !== 'admin' && role !== 'blind member') {
      alert('Choose Member, Admin, or Blind Member.');
      return;
    }
    const membershipStatus =
      role === 'blind member' ? 'blind member' : 'invited';
    const ph = String(name).replace(/^@+/, '').trim();
    if (!ph) {
      alert('Please enter a valid handle.');
      return;
    }
    const lastUnderscore = ph.lastIndexOf('_');
    const profileHandle =
      lastUnderscore > 0 ? ph.slice(lastUnderscore + 1) : ph;

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Adding…';
    }
    try {
      const gh = getGroupHandleFromUrl();
      const gRes = await fetch(
        '/api/groups/by-handle?handle=' + encodeURIComponent(gh)
      );
      if (gRes.status === 503) {
        alert(
          'Groups require Supabase. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
        );
        return;
      }
      if (!gRes.ok) {
        const j = await gRes.json().catch(() => ({}));
        throw new Error(j.error || 'Group not found');
      }
      const gRow = await gRes.json();
      const resolvedGroupName =
        gRow.group_name != null ? String(gRow.group_name).trim() : '';
      if (!resolvedGroupName) {
        throw new Error('Could not resolve group name');
      }

      const res = await fetch('/api/groups/invite-by-person-handle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          group_name: resolvedGroupName,
          person_handle: ph,
          profile_handle: profileHandle,
          group_handle: getGroupHandleFromUrl(),
          membership_status: membershipStatus
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Could not invite member');
      }

      resetAddFriendModal();
      if (window.jQuery) window.jQuery('#addMemberModal').modal('hide');
      await loadGroupMembersPage();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not add member.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = addModalDefaultSubmitLabel();
      }
    }
    return;
  }

  try {

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Adding…';
    }

    if (status === 'friend') {
      const raw = String(name).trim();
      const friendToken = raw.replace(/^@+/, '').trim();
      if (!friendToken) {
        alert('Please enter a handle.');
        return;
      }
      const profileRes = await fetch(
        '/api/profile/by-handle?handle=' + encodeURIComponent(friendToken)
      );
      if (profileRes.status === 503) {
        alert('Profiles require Supabase. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
        return;
      }
      if (!profileRes.ok) {
        const j = await profileRes.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to validate handle');
      }
      const profileRow = await profileRes.json();
      if (!profileRow || !profileRow.handle) {
        alert('That handle could not be found');
        return;
      }
      const response = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          friend_id: friendToken
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
            member: friendToken
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
      const ownersHandle = await fetchProfileHandle(userId);
      if (!ownersHandle) {
        alert(
          'Your profile needs a handle before you can add contacts. Update your profile first.'
        );
        return;
      }
      const response = await fetch('/api/contact-details', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          lookup_contact_name: name,
          contact_name: name,
          my_notes: notes != null && String(notes).trim() !== '' ? String(notes).trim() : null
        })
      });
      if (response.status === 503) {
        alert('Contact details require Supabase.');
        return;
      }
      if (!response.ok) {
        const j = await response.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to add contact');
      }
    }

    resetAddFriendModal();
    if (window.jQuery) window.jQuery('#addMemberModal').modal('hide');
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
  const notesWrap = notesEl.closest('.form-group');
  if (notesWrap) {
    notesWrap.classList.toggle('d-none', entry.type === 'friend');
  }
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
      const ownersHandle = await fetchProfileHandle(userId);
      if (!ownersHandle) {
        alert('Your profile needs a handle before you can save.');
        return;
      }
      const name = nameEl.value.trim();
      if (!name) {
        alert('Name cannot be empty.');
        return;
      }
      const lookup = entry.lookupContactName || entry.name;
      const response = await fetch('/api/contact-details', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          owners_handle: ownersHandle,
          lookup_contact_name: lookup,
          contact_name: name,
          my_notes: notesEl.value
        })
      });
      if (response.status === 503) {
        alert('Contact details require Supabase.');
        return;
      }
      if (!response.ok) {
        const j = await response.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to save');
      }
    } else {
      /* Friends: no editable fields; row detail is view-only. */
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

const originalUpdateContentVisibility = updateContentVisibility;
updateContentVisibility = function (isAuthenticated) {
  originalUpdateContentVisibility(isAuthenticated);
  if (isAuthenticated) {
    setTimeout(loadFriendsPage, 100);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const addModal = document.getElementById('addMemberModal');
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
      const removeBtn = e.target.closest('.group-member-remove-btn');
      if (removeBtn && isGroupPage()) {
        e.preventDefault();
        e.stopPropagation();
        void handleGroupMemberRemoveClick(removeBtn, tbody);
        return;
      }
      const groupTr = e.target.closest('tr.group-member-row');
      if (groupTr && groupTr.dataset.personHandle) {
        window.location.assign(
          contactPageHrefForPersonHandle(groupTr.dataset.personHandle)
        );
        return;
      }
      if (e.target.closest('.friends-name-link')) return;
      if (e.target.closest('a.contact-list-group-link')) return;
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
