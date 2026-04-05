// Check authentication and show/hide content accordingly
async function checkAuthAndDisplayContent() {
  try {
    let auth0 = null;

    // First, try to use window.auth0 directly if it's already available
    if (window.auth0) {
      auth0 = window.auth0;
    } else if (window.auth0Promise) {
      // Otherwise, wait for the promise to resolve
      auth0 = await window.auth0Promise;
    } else {
      // If neither exists, wait a bit and try again
      console.log('Auth0 not initialized yet, waiting...');
      setTimeout(checkAuthAndDisplayContent, 200);
      return;
    }

    // Wait for redirect handling to complete if it's in progress
    if (window.redirectHandledPromise) {
      await window.redirectHandledPromise;
    }

    // Now check authentication
    if (auth0 && typeof auth0.isAuthenticated === 'function') {
      const isAuthenticated = await auth0.isAuthenticated();
      updateContentVisibility(isAuthenticated);
    } else {
      console.error('Auth0 client is not properly initialized');
      updateContentVisibility(false);
    }
  } catch (error) {
    console.error('Error checking authentication:', error);
    // On error, show login required message
    updateContentVisibility(false);
  }
}

// Update content visibility based on auth state
function updateContentVisibility(isAuthenticated) {
  const privateContent = document.getElementById('private-content');
  const loginRequiredMessage = document.getElementById('login-required-message');

  if (isAuthenticated) {
    // User is logged in - show protected content
    if (privateContent) privateContent.style.display = 'block';
    if (loginRequiredMessage) loginRequiredMessage.style.display = 'none';
  } else {
    // User is not logged in - show login required message
    if (privateContent) privateContent.style.display = 'none';
    if (loginRequiredMessage) loginRequiredMessage.style.display = 'block';
  }
}

// Wait for Auth0 to be ready with retries
function waitForAuth0AndCheck(maxRetries = 10, retryDelay = 200) {
  let retries = 0;

  const check = () => {
    if (window.auth0 || (window.auth0Promise && retries < maxRetries)) {
      checkAuthAndDisplayContent();
    } else if (retries < maxRetries) {
      retries++;
      setTimeout(check, retryDelay);
    } else {
      console.warn('Auth0 initialization timeout - showing login required');
      updateContentVisibility(false);
    }
  };

  check();
}

// Run check when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    waitForAuth0AndCheck();
  });
} else {
  // DOM is already loaded
  waitForAuth0AndCheck();
}

// Re-check auth state when user returns from login (handles redirect callback)
window.addEventListener('focus', () => {
  setTimeout(checkAuthAndDisplayContent, 100);
});

// Also check after redirect callback (in case we just logged in)
if (window.location.search.includes('code=') && window.location.search.includes('state=')) {
  // Wait a bit longer for redirect handling
  setTimeout(checkAuthAndDisplayContent, 500);
}

/** Max characters before "..." in Who / Shared / Owner columns (e.g. john.p...). */
var SHARED_OWNER_MAX_CHARS = 6;

/** Currently active filter pill: 'all' | 'me' | 'megan' */
var currentEventsFilter = 'all';

/** Cached raw task list and user email from the last fetch */
var cachedTasks = null;
var cachedUserEmail = null;

/** Megan's email used by the Megan filter */
var MEGAN_EMAIL = 'mdonahey@alumni.princeton.edu';

/** Emails of members in the currently selected group (populated on group pill click) */
var currentGroupMembers = [];

/** Date filter state: type = '' | 'before' | 'after' | 'between' */
var activeDateFilter = { type: '', date1: '', date2: '' };

/** Who filter: array of strings the user has added as tags */
var activeWhoFilter = [];

/** Type filter: '' = all, otherwise exact match against event_type */
var activeTypeFilter = '';

/**
 * Display name shown on profiles.html — used to filter events (who column).
 * Set in applyProfileHeaderFromData; null on other pages.
 */
var cachedProfileNameForFilter = null;

/** Profile subject email (profiles page) — used with who + owner branch. */
var cachedProfileEmailForFilter = null;

/** Supabase `profiles` row for the current user (profiles page); null if none / other pages. */
var cachedProfileRow = null;

/** Last Auth0 user object from loadTasks (for profile modal). */
var cachedAuthUser = null;

/**
 * Returns true if the comma/newline-separated `field` value contains `email`.
 */
function fieldContainsEmail(field, email) {
  if (!field || !email) return false;
  return String(field).toLowerCase().split(/[\s,;]+/).some(e => e.trim() === email.toLowerCase());
}

/**
 * True if `who` references the profile name (substring, or email token match when name looks like email).
 */
function whoFieldReferencesProfileName(who, profileName) {
  if (!who || !profileName) return false;
  const p = String(profileName).trim();
  if (!p) return false;
  const w = String(who);
  if (p.includes('@')) {
    return fieldContainsEmail(w, p) || w.toLowerCase().includes(p.toLowerCase());
  }
  return w.toLowerCase().includes(p.toLowerCase());
}

/**
 * Profiles page:
 * - `who` includes profile display name AND `shared` lists the logged-in user, OR
 * - `who` includes the profile person's email AND `owner` is the logged-in user.
 */
function applyProfilePageEventFilter(tasks, profileName, profileEmail, viewerEmail) {
  const viewer = (viewerEmail || '').toLowerCase().trim();
  const name = (profileName || '').trim();
  const profileEm = (profileEmail || '').trim();
  if (!viewer) return [];
  if (!name && !profileEm) return [];

  return tasks.filter(t => {
    const whoHasName = name && whoFieldReferencesProfileName(t.who, name);
    const whoHasProfileEmail =
      profileEm && whoFieldReferencesProfileName(t.who, profileEm);
    const sharedHasViewer = fieldContainsEmail(t.shared, viewer);
    const ownerIsViewer = (t.owner || '').toLowerCase().trim() === viewer;

    return (whoHasName && sharedHasViewer) || (whoHasProfileEmail && ownerIsViewer);
  });
}

/** Auth0 user → single line display name for profile header and who-column matching. */
function profileDisplayNameFromUser(user) {
  if (!user) return '';
  if (user.name && String(user.name).trim()) return String(user.name).trim();
  if (user.nickname && String(user.nickname).trim()) return String(user.nickname).trim();
  const g = user.given_name;
  const f = user.family_name;
  if (g || f) return [g, f].filter(Boolean).join(' ').trim();
  if (user.email) return user.email.split('@')[0] || user.email;
  return '';
}

/**
 * Applies the active filter to the full task list and returns matching tasks.
 *
 * all   – shared includes user  OR  owner === user
 * me    – (who includes user AND shared includes user)
 *          OR (who is blank AND owner === user)
 * megan – who includes MEGAN_EMAIL  AND  (shared includes user OR owner === user)
 */
function applyEventsFilter(tasks, filter, userEmail) {
  const email = (userEmail || '').toLowerCase().trim();

  const sharedHasUser  = t => fieldContainsEmail(t.shared, email);
  const ownerIsUser    = t => (t.owner || '').toLowerCase().trim() === email;
  const whoHasUser     = t => fieldContainsEmail(t.who, email);
  const whoIsBlank     = t => !t.who || String(t.who).trim() === '';
  const whoHasMegan    = t => fieldContainsEmail(t.who, MEGAN_EMAIL);

  if (filter === 'me') {
    return tasks.filter(t =>
      whoHasUser(t) && (sharedHasUser(t) || ownerIsUser(t))
    );
  }
  if (filter === 'megan') {
    return tasks.filter(t =>
      whoHasMegan(t) && (sharedHasUser(t) || ownerIsUser(t))
    );
  }
  if (filter === 'group_members') {
    // Show events where 'who' contains any member of the selected group
    return tasks.filter(t =>
      currentGroupMembers.some(m => fieldContainsEmail(t.who, m))
    );
  }
  // 'all'
  return tasks.filter(t => sharedHasUser(t) || ownerIsUser(t));
}

/**
 * Applies the active date filter to a task list.
 * Compares event_date (YYYY-MM-DD string) against the chosen criteria.
 */
function applyDateFilter(tasks) {
  const { type, date1, date2 } = activeDateFilter;
  if (!type || !date1) return tasks;
  return tasks.filter(t => {
    if (!t.event_date) return false;
    const d = String(t.event_date).slice(0, 10);
    if (type === 'before')  return d < date1;
    if (type === 'after')   return d > date1;
    if (type === 'between') return date2 ? (d >= date1 && d <= date2) : d >= date1;
    return true;
  });
}

/**
 * Applies the active type filter against task.event_type (case-insensitive exact match).
 */
function applyTypeFilter(tasks) {
  if (!activeTypeFilter) return tasks;
  const t = activeTypeFilter.toLowerCase();
  return tasks.filter(task =>
    task.event_type != null && String(task.event_type).trim().toLowerCase() === t
  );
}

/**
 * Applies the active who filter (array of search strings).
 * Shows events where task.who contains ANY of the entered strings (case-insensitive substring).
 */
function applyWhoFilter(tasks) {
  if (!activeWhoFilter.length) return tasks;
  return tasks.filter(t => {
    if (!t.who) return false;
    const who = String(t.who).toLowerCase();
    return activeWhoFilter.some(f => who.includes(f.toLowerCase()));
  });
}

/**
 * Master render: applies pill filter → date filter → who filter → renders rows.
 * Call this instead of renderTaskRows(applyEventsFilter(...)) everywhere.
 */
function renderWithAllFilters() {
  if (!cachedTasks || !cachedUserEmail) return;
  let filtered;
  if (document.getElementById('profile-display-name')) {
    filtered = applyProfilePageEventFilter(
      cachedTasks,
      cachedProfileNameForFilter,
      cachedProfileEmailForFilter,
      cachedUserEmail
    );
  } else {
    filtered = applyEventsFilter(cachedTasks, currentEventsFilter, cachedUserEmail);
  }
  filtered = applyDateFilter(filtered);
  filtered = applyTypeFilter(filtered);
  filtered = applyWhoFilter(filtered);
  renderTaskRows(filtered);
}

/** Renders the who-filter tag chips. */
function renderWhoFilterTags() {
  const tagsEl = document.getElementById('who-filter-tags');
  if (!tagsEl) return;
  if (!activeWhoFilter.length) { tagsEl.innerHTML = ''; return; }
  tagsEl.innerHTML = activeWhoFilter.map((f, i) =>
    `<span class="badge badge-secondary d-inline-flex align-items-center mr-1 mb-1" style="font-size:0.85em;padding:0.35em 0.6em;">` +
    escapeHtml(f) +
    `<button type="button" data-who-index="${i}" class="who-tag-remove ml-1 p-0 border-0 bg-transparent text-white" style="line-height:1;font-size:1em;" aria-label="Remove">&times;</button>` +
    `</span>`
  ).join('');
}

/** Renders a (pre-filtered) task array into the table. */
function renderTaskRows(tasks) {
  const emptyEl  = document.getElementById('tasks-empty');
  const tableEl  = document.getElementById('tasks-table');
  const tbodyEl  = document.getElementById('tasks-tbody');

  tbodyEl.innerHTML = '';

  if (!tasks.length) {
    tableEl.style.display = 'none';
    emptyEl.textContent = 'No events match this filter.';
    emptyEl.style.display = 'block';
    return;
  }

  emptyEl.style.display = 'none';
  tableEl.style.display = 'table';

  tasks.forEach(task => {
    const eventDate  = task.event_date ? formatDateOnly(task.event_date) : 'Not set';
    const name       = task.event != null ? String(task.event) : task.task != null ? String(task.task) : '';
    const sharedPlain = plainTextShared(task.shared);
    const sharedHtml  = sharedPlain === '' ? '—' : truncateEllipsisHtml(sharedPlain, SHARED_OWNER_MAX_CHARS);
    const sharedTitleAttr = sharedPlain !== '' ? ' title="' + escapeAttr(sharedPlain) + '"' : '';
    const ownerPlain  = task.owner != null ? String(task.owner) : '';
    const ownerHtml   = ownerPlain === '' ? '' : truncateEllipsisHtml(ownerPlain, SHARED_OWNER_MAX_CHARS);
    const ownerTitleAttr  = ownerPlain !== '' ? ' title="' + escapeAttr(ownerPlain) + '"' : '';
    const whoPlain    = task.who != null && String(task.who).trim() !== '' ? String(task.who).trim() : '';
    const whoHtml     = whoPlain === '' ? '—' : truncateEllipsisHtml(whoPlain, SHARED_OWNER_MAX_CHARS);
    const whoTitleAttr = whoPlain !== '' ? ' title="' + escapeAttr(whoPlain) + '"' : '';

    const row = document.createElement('tr');
    row.className = 'events-table-row';
    row.style.cursor = 'pointer';
    row.dataset.eventId = String(task.id);
    row.setAttribute('title', 'Click to view or edit');
    const eventType = task.event_type != null && String(task.event_type).trim() !== ''
      ? escapeHtml(String(task.event_type).trim())
      : '<span class="text-muted">—</span>';
    row.innerHTML = `
        <td><strong>${escapeHtml(name)}</strong></td>
        <td><small>${eventDate}</small></td>
        <td><small>${eventType}</small></td>
        <td class="events-col-who"${whoTitleAttr}><small>${whoHtml}</small></td>
        <td class="events-col-shared"${sharedTitleAttr}><small>${sharedHtml}</small></td>
        <td class="events-col-owner"${ownerTitleAttr}><small>${ownerHtml}</small></td>
      `;
    tbodyEl.appendChild(row);
  });
}

/** SVG placeholder when Auth0 user has no picture (profiles page). */
var PROFILE_AVATAR_PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><circle cx="36" cy="36" r="36" fill="#dee2e6"/><circle cx="36" cy="27" r="11" fill="#adb5bd"/><path d="M12 60c4-10 14-16 24-16s20 6 24 16" fill="#adb5bd"/></svg>'
  );

/**
 * Fetch a profile row by email, automatically falling back to the dotless
 * Gmail variant (john.picasso@ → johnpicasso@) if the first lookup returns null.
 * @returns {Promise<object|null>}
 */
async function fetchProfileByEmail(userEmail) {
  if (!userEmail) return null;
  try {
    const res = await fetch('/api/profile?user_id=' + encodeURIComponent(userEmail));
    if (res.status === 503 || !res.ok) return null;
    const row = await res.json();
    if (row) return row;

    // Try dotless variant (Gmail treats john.doe@ and johndoe@ as the same inbox)
    const dotless = userEmail.replace(/\.(?=[^@]*@)/g, '');
    if (dotless === userEmail) return null;
    const res2 = await fetch('/api/profile?user_id=' + encodeURIComponent(dotless));
    if (!res2.ok) return null;
    return await res2.json();
  } catch (e) {
    console.error('Error loading profile:', e);
    return null;
  }
}

/**
 * Fetches `profiles` row for the logged-in user (profiles page only).
 */
async function fetchProfileForPage(userEmail) {
  if (!document.getElementById('profile-display-name') || !userEmail) return null;
  return fetchProfileByEmail(userEmail);
}

/**
 * Fetches the handle from `profiles` by email and writes it to #profile-user-handle.
 */
async function fetchAndDisplayHandle(userEmail) {
  const handleEl = document.getElementById('profile-user-handle');
  if (!handleEl || !userEmail) return;

  const row = await fetchProfileByEmail(userEmail);

    if (!row) {
      handleEl.innerHTML = '<span class="text-warning" style="cursor:pointer;" data-toggle="modal" data-target="#editProfileModal">Set up your profile ›</span>';
      return;
    }
    const handle = row.handle;
    handleEl.textContent = handle ? '@' + String(handle).replace(/^@+/, '') : '';
}

/**
 * Updates profile header from Auth0 user + optional Supabase `profiles` row.
 */
function applyProfileHeaderFromData(user, profileRow) {
  const nameEl = document.getElementById('profile-display-name');
  const handleEl = document.getElementById('profile-user-handle');
  const emailEl = document.getElementById('profile-user-email');
  const imgEl = document.getElementById('profile-user-photo');
  const locEl = document.getElementById('profile-location-line');
  cachedProfileNameForFilter = null;
  cachedProfileEmailForFilter = null;
  if (!nameEl && !emailEl && !imgEl) return;
  if (!user) {
    cachedProfileRow = null;
    if (nameEl) nameEl.textContent = '';
    if (handleEl) handleEl.textContent = '';
    if (emailEl) emailEl.textContent = '';
    if (locEl) locEl.textContent = 'Location: —';
    if (imgEl) {
      imgEl.src = PROFILE_AVATAR_PLACEHOLDER;
      imgEl.alt = '';
    }
    return;
  }
  const displayName =
    profileRow && profileRow.name != null && String(profileRow.name).trim() !== ''
      ? String(profileRow.name).trim()
      : profileDisplayNameFromUser(user) || (user.email || '');
  cachedProfileNameForFilter = displayName;
  cachedProfileEmailForFilter = (user.email || '').trim() || null;
  if (nameEl) nameEl.textContent = displayName;
  if (handleEl) {
    const h =
      profileRow && profileRow.handle != null && String(profileRow.handle).trim() !== ''
        ? String(profileRow.handle).trim()
        : '';
    handleEl.textContent = h ? '@' + h.replace(/^@+/, '') : '—';
  }
  if (emailEl) emailEl.textContent = user.email || '';
  if (imgEl) {
    imgEl.src = user.picture || PROFILE_AVATAR_PLACEHOLDER;
    imgEl.alt = displayName;
  }
  if (locEl) {
    const loc =
      profileRow && profileRow.location != null && String(profileRow.location).trim() !== ''
        ? String(profileRow.location).trim()
        : '—';
    locEl.textContent = 'Location: ' + loc;
  }
}

function populateEditProfileModal() {
  const nameEl = document.getElementById('edit-profile-name');
  const handleEl = document.getElementById('edit-profile-handle');
  const emailEl = document.getElementById('edit-profile-email');
  const locationEl = document.getElementById('edit-profile-location');
  const errEl = document.getElementById('edit-profile-error');
  if (!nameEl || !handleEl || !emailEl || !locationEl || !cachedAuthUser) return;
  if (errEl) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }
  const user = cachedAuthUser;
  const row = cachedProfileRow;
  nameEl.value =
    row && row.name != null && String(row.name).trim() !== ''
      ? String(row.name).trim()
      : profileDisplayNameFromUser(user) || '';
  handleEl.value =
    row && row.handle != null ? String(row.handle).replace(/^@+/, '') : '';
  emailEl.value = cachedUserEmail || user.email || '';
  locationEl.value = row && row.location != null ? String(row.location) : '';
}

async function submitEditProfileForm() {
  const nameEl = document.getElementById('edit-profile-name');
  const handleEl = document.getElementById('edit-profile-handle');
  const locationEl = document.getElementById('edit-profile-location');
  const errEl = document.getElementById('edit-profile-error');
  const submitBtn = document.getElementById('edit-profile-submit');
  if (!nameEl || !cachedUserEmail || !submitBtn) return;
  const n = nameEl.value.trim();
  const h = handleEl.value.trim();
  const l = locationEl.value.trim();
  if (!n || !h || !l) {
    if (errEl) {
      errEl.textContent = 'Name, handle, and location are required.';
      errEl.style.display = 'block';
    }
    return;
  }
  if (errEl) errEl.style.display = 'none';
  try {
    submitBtn.disabled = true;
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: cachedUserEmail,
        name: n,
        handle: h,
        location: l
      })
    });
    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      /* ignore */
    }
    if (res.status === 503) {
      if (errEl) {
        errEl.textContent = data.error || 'Profiles require Supabase.';
        errEl.style.display = 'block';
      }
      return;
    }
    if (!res.ok) {
      if (errEl) {
        errEl.textContent = data.error || 'Failed to save profile.';
        errEl.style.display = 'block';
      }
      return;
    }
    cachedProfileRow = data;
    applyProfileHeaderFromData(cachedAuthUser, cachedProfileRow);
    renderWithAllFilters();
    if (window.jQuery) window.jQuery('#editProfileModal').modal('hide');
  } catch (e) {
    console.error(e);
    if (errEl) {
      errEl.textContent = 'Failed to save profile.';
      errEl.style.display = 'block';
    }
  } finally {
    submitBtn.disabled = false;
  }
}

// Event Management Functions
async function loadTasks() {
  const loadingEl = document.getElementById('tasks-loading');
  const errorEl   = document.getElementById('tasks-error');
  const emptyEl   = document.getElementById('tasks-empty');
  const tableEl   = document.getElementById('tasks-table');

  try {
    loadingEl.style.display = 'block';
    errorEl.style.display   = 'none';
    emptyEl.style.display   = 'none';
    tableEl.style.display   = 'none';

    let currentUserEmail = null;
    let authUser = null;
    try {
      if (window.auth0) {
        const isAuthenticated = await window.auth0.isAuthenticated();
        if (isAuthenticated) {
          authUser = await window.auth0.getUser();
          currentUserEmail = authUser?.email || null;
        }
      }
    } catch (authError) {
      console.error('Error getting current user:', authError);
    }

    cachedAuthUser = authUser || null;
    let profileRow = null;
    if (document.getElementById('profile-display-name') && currentUserEmail) {
      profileRow = await fetchProfileForPage(currentUserEmail);
      cachedProfileRow = profileRow;
    } else {
      cachedProfileRow = null;
    }
    applyProfileHeaderFromData(authUser, profileRow);

    if (!currentUserEmail) {
      cachedUserEmail = null;
      loadingEl.style.display = 'none';
      emptyEl.textContent = 'Please log in to view your events.';
      emptyEl.style.display = 'block';
      return;
    }

    cachedUserEmail = currentUserEmail;

    // Fetch and display handle from profiles table
    fetchAndDisplayHandle(currentUserEmail);

    // Load group pills in parallel — don't block the events fetch
    loadGroupPills(currentUserEmail);

    const response = await fetch(
      '/api/events?user_id=' + encodeURIComponent(currentUserEmail)
    );
    if (response.status === 503) {
      loadingEl.style.display = 'none';
      errorEl.textContent =
        'Events require Supabase. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and create the events table.';
      errorEl.style.display = 'block';
      return;
    }
    if (!response.ok) throw new Error('Failed to fetch events');

    const tasks = await response.json();
    loadingEl.style.display = 'none';

    // Cache for filter re-renders
    cachedTasks = tasks;

    if (!tasks.length) {
      emptyEl.textContent = 'No events yet. Click "+ Add Event" to create one.';
      emptyEl.style.display = 'block';
      return;
    }

    renderWithAllFilters();
  } catch (error) {
    console.error('Error loading events:', error);
    loadingEl.style.display = 'none';
    errorEl.textContent = 'Failed to load events. Please refresh the page.';
    errorEl.style.display = 'block';
  }
}

// Use event delegation on the pills container so dynamically-added group pills work automatically
document.addEventListener('DOMContentLoaded', () => {
  const pillsContainer = document.getElementById('events-filter-pills');
  if (pillsContainer) {
    pillsContainer.addEventListener('click', async e => {
      const btn = e.target.closest('.events-filter-btn');
      if (!btn) return;
      const rawFilter = btn.dataset.filter;

      // Update active styles across all pills
      pillsContainer.querySelectorAll('.events-filter-btn').forEach(b => {
        b.classList.remove('btn-primary', 'btn-secondary');
        b.classList.add(b.classList.contains('events-filter-group-btn') ? 'btn-outline-secondary' : 'btn-outline-primary');
      });
      btn.classList.remove('btn-outline-primary', 'btn-outline-secondary');
      btn.classList.add(btn.classList.contains('events-filter-group-btn') ? 'btn-secondary' : 'btn-primary');

      // Group pills: fetch members first, then filter by 'who' containing any of them
      if (rawFilter && rawFilter.startsWith('group:')) {
        const groupName = rawFilter.slice('group:'.length);
        btn.disabled = true;
        try {
          const res = await fetch('/api/groups/members?group_name=' + encodeURIComponent(groupName));
          currentGroupMembers = res.ok ? await res.json() : [];
        } catch (err) {
          console.error('Error fetching group members:', err);
          currentGroupMembers = [];
        }
        btn.disabled = false;
        currentEventsFilter = 'group_members';
      } else {
        currentGroupMembers = [];
        currentEventsFilter = rawFilter;
      }

      renderWithAllFilters();
    });
  }

  // ── Date filter ──────────────────────────────────────────────────
  const dateTypeEl = document.getElementById('date-filter-type');
  const date1El    = document.getElementById('date-filter-1');
  const date2El    = document.getElementById('date-filter-2');
  const dateAndEl  = document.getElementById('date-filter-and');

  function syncDateFilterUI() {
    const type = dateTypeEl ? dateTypeEl.value : '';
    if (date1El)   date1El.style.display   = type ? 'inline-block' : 'none';
    if (dateAndEl) dateAndEl.style.display  = type === 'between' ? 'inline' : 'none';
    if (date2El)   date2El.style.display    = type === 'between' ? 'inline-block' : 'none';
    if (!type && date1El) date1El.value = '';
    if (type !== 'between' && date2El) date2El.value = '';
  }

  if (dateTypeEl) {
    dateTypeEl.addEventListener('change', () => {
      syncDateFilterUI();
      activeDateFilter.type  = dateTypeEl.value;
      activeDateFilter.date1 = date1El ? date1El.value : '';
      activeDateFilter.date2 = date2El ? date2El.value : '';
      renderWithAllFilters();
    });
  }
  if (date1El) {
    date1El.addEventListener('change', () => {
      activeDateFilter.date1 = date1El.value;
      renderWithAllFilters();
    });
  }
  if (date2El) {
    date2El.addEventListener('change', () => {
      activeDateFilter.date2 = date2El.value;
      renderWithAllFilters();
    });
  }

  // ── Who filter ───────────────────────────────────────────────────
  const whoInputEl = document.getElementById('who-filter-input');
  const whoAddBtn  = document.getElementById('who-filter-add');
  const whoTagsEl  = document.getElementById('who-filter-tags');

  function addWhoTag() {
    const val = whoInputEl ? whoInputEl.value.trim() : '';
    if (!val) return;
    if (!activeWhoFilter.includes(val)) {
      activeWhoFilter.push(val);
      renderWhoFilterTags();
      renderWithAllFilters();
    }
    if (whoInputEl) whoInputEl.value = '';
  }

  if (whoAddBtn) whoAddBtn.addEventListener('click', addWhoTag);
  if (whoInputEl) {
    whoInputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addWhoTag(); }
    });
  }
  if (whoTagsEl) {
    whoTagsEl.addEventListener('click', e => {
      const btn = e.target.closest('.who-tag-remove');
      if (!btn) return;
      const idx = parseInt(btn.dataset.whoIndex, 10);
      if (!isNaN(idx)) {
        activeWhoFilter.splice(idx, 1);
        renderWhoFilterTags();
        renderWithAllFilters();
      }
    });
  }

  // ── Type filter ──────────────────────────────────────────────────
  const typeFilterEl = document.getElementById('type-filter');
  if (typeFilterEl) {
    typeFilterEl.addEventListener('change', () => {
      activeTypeFilter = typeFilterEl.value;
      renderWithAllFilters();
    });
  }

  // ── Profile page: section pills + photo edit (profiles.html only) ─
  const profilePills = document.getElementById('profile-section-pills');
  if (profilePills) {
    profilePills.addEventListener('click', e => {
      const btn = e.target.closest('.profile-section-btn');
      if (!btn) return;
      profilePills.querySelectorAll('.profile-section-btn').forEach(b => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-outline-primary');
      });
      btn.classList.remove('btn-outline-primary');
      btn.classList.add('btn-primary');
      document.body.dataset.profileSection = btn.dataset.section || '';
    });
  }
  const profileEditBtn = document.getElementById('profile-photo-edit-btn');
  if (profileEditBtn) {
    profileEditBtn.addEventListener('click', () => {
      // Hook for future photo upload / account settings
    });
  }

  const editProfileModalEl = document.getElementById('editProfileModal');
  if (editProfileModalEl && window.jQuery) {
    window.jQuery(editProfileModalEl).on('show.bs.modal', function() {
      populateEditProfileModal();
    });
  }
  const editProfileSubmit = document.getElementById('edit-profile-submit');
  if (editProfileSubmit) {
    editProfileSubmit.addEventListener('click', function() {
      submitEditProfileForm();
    });
  }

  // ── Clear all advanced filters ───────────────────────────────────
  const clearBtn = document.getElementById('clear-adv-filters-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      activeDateFilter = { type: '', date1: '', date2: '' };
      activeWhoFilter  = [];
      activeTypeFilter = '';
      if (dateTypeEl)  dateTypeEl.value  = '';
      if (date1El)     date1El.value     = '';
      if (date2El)     date2El.value     = '';
      if (typeFilterEl) typeFilterEl.value = '';
      syncDateFilterUI();
      renderWhoFilterTags();
      renderWithAllFilters();
    });
  }
});

/**
 * Fetches the groups the logged-in user belongs to (member / admin / owner)
 * and appends a pill button for each one.
 */
async function loadGroupPills(userEmail) {
  if (!userEmail) return;
  try {
    const res = await fetch('/api/groups?user_id=' + encodeURIComponent(userEmail));
    if (!res.ok) return;
    const groups = await res.json();
    if (!groups.length) return;

    const pillsContainer = document.getElementById('events-filter-pills');
    if (!pillsContainer) return;

    // Remove any previously added group pills (e.g. on reload)
    pillsContainer.querySelectorAll('.events-filter-group-btn').forEach(b => b.remove());

    groups.forEach(group => {
      const name = group.group_name || '';
      if (!name) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-sm btn-outline-secondary events-filter-btn events-filter-group-btn mr-1';
      btn.style.cssText = 'border-radius: 2rem;';
      btn.dataset.filter = 'group:' + name;
      // 👥 icon signals this is a group pill
      btn.innerHTML = '<span aria-hidden="true" style="opacity:0.7;font-size:0.85em;">👥</span> ' + escapeHtml(name);
      btn.title = 'Group: ' + name;
      pillsContainer.appendChild(btn);
    });
  } catch (e) {
    console.error('Error loading group pills:', e);
  }
}

async function addTaskForm() {
  const taskInput      = document.getElementById('task-input');
  const whoInput       = document.getElementById('who-input');
  const sharedInput    = document.getElementById('shared-input');
  const eventDateInput = document.getElementById('event-date');
  const submitButton   = document.getElementById('add-event-submit');

  const task      = taskInput.value.trim();
  const whoVal    = whoInput && whoInput.value.trim() !== '' ? whoInput.value.trim() : undefined;
  const sharedVal = sharedInput && sharedInput.value.trim() !== '' ? sharedInput.value.trim() : undefined;
  const eventDate = eventDateInput.value;

  if (!task) {
    alert('Please enter an event name');
    return;
  }
  if (!eventDate) {
    alert('Please select an event date');
    return;
  }

  try {
    submitButton.disabled = true;
    submitButton.textContent = 'Adding…';

    let userId = null;
    try {
      if (window.auth0) {
        const isAuthenticated = await window.auth0.isAuthenticated();
        if (isAuthenticated) {
          const user = await window.auth0.getUser();
          userId = user?.email || user?.nickname || user?.sub || null;
        }
      }
    } catch (authError) {
      console.error('Error getting Auth0 user:', authError);
    }

    const postBody = { event: task, event_date: eventDate, user_id: userId };
    if (whoVal !== undefined) postBody.who = whoVal;
    if (sharedVal !== undefined) postBody.shared = sharedVal;

    const response = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postBody)
    });

    if (response.status === 503) {
      alert('Events require Supabase. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
      return;
    }
    if (!response.ok) throw new Error('Failed to add event');

    // Clear form and close modal
    taskInput.value      = '';
    eventDateInput.value = '';
    if (whoInput)    whoInput.value    = '';
    if (sharedInput) sharedInput.value = '';
    if (window.jQuery) window.jQuery('#addEventModal').modal('hide');

    await loadTasks();
  } catch (error) {
    console.error('Error adding event:', error);
    alert('Failed to add event. Please try again.');
  } finally {
    submitButton.disabled    = false;
    submitButton.textContent = 'Add Event';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/\r?\n/g, ' ');
}

function plainTextShared(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'object') return JSON.stringify(raw);
  return String(raw);
}

/** Safe HTML: prefix + "..." when longer than maxChars. */
function truncateEllipsisHtml(text, maxChars) {
  if (text === '') return '';
  if (text.length <= maxChars) return escapeHtml(text);
  return escapeHtml(text.slice(0, maxChars)) + '...';
}

/** Table column display: "d mmm, yyyy" e.g. 5 Mar, 2025 */
function formatDateOnly(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString + 'T00:00:00'); // Add time to avoid timezone issues
  const d = date.getDate();
  const mmm = date.toLocaleString('en-US', { month: 'short' });
  const yyyy = date.getFullYear();
  return d + ' ' + mmm + ', ' + yyyy;
}

function formatCopiedCell(raw) {
  if (raw == null || raw === '') return '—';
  if (raw === true || raw === 'true' || raw === 1) return 'Yes';
  if (raw === false || raw === 'false' || raw === 0) return 'No';
  return escapeHtml(String(raw));
}

function sharedToFormString(shared) {
  if (shared == null || shared === '') return '';
  if (typeof shared === 'object') return JSON.stringify(shared, null, 2);
  return String(shared);
}

function setCopiedSelectEl(el, copied) {
  if (!el) return;
  if (copied === true || copied === 'true' || copied === 1) el.value = 'true';
  else if (copied === false || copied === 'false' || copied === 0) el.value = 'false';
  else el.value = '';
}

function readCopiedFromSelect(el) {
  if (!el) return undefined;
  const v = el.value;
  if (v === '') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
}

/** Open modal with event data (called when a table row is clicked). */
async function openEventModalFromRow(id) {
  try {
    let currentUserEmail = null;
    if (window.auth0) {
      const isAuthenticated = await window.auth0.isAuthenticated();
      if (isAuthenticated) {
        const user = await window.auth0.getUser();
        currentUserEmail = user?.email || null;
      }
    }
    if (!currentUserEmail) {
      alert('You must be logged in to edit.');
      return;
    }

    const response = await fetch(
      '/api/events?user_id=' + encodeURIComponent(currentUserEmail)
    );
    if (!response.ok) {
      throw new Error('Failed to fetch events');
    }

    const tasks = await response.json();
    const task = tasks.find(t => String(t.id) === String(id));

    if (!task) {
      alert('Event not found');
      return;
    }

    document.getElementById('edit-task-id').value = task.id;
    const evName = task.event != null ? task.event : task.task;
    document.getElementById('edit-task-input').value = evName != null ? String(evName) : '';

    if (task.event_date) {
      const date = new Date(task.event_date + 'T00:00:00');
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      document.getElementById('edit-event-date').value = `${year}-${month}-${day}`;
    } else {
      document.getElementById('edit-event-date').value = '';
    }

    document.getElementById('edit-who').value =
      task.who != null && task.who !== '' ? String(task.who) : '';

    document.getElementById('edit-shared').value = sharedToFormString(task.shared);
    document.getElementById('edit-owner').value =
      task.owner != null && task.owner !== '' ? String(task.owner) : '';
    setCopiedSelectEl(document.getElementById('edit-copied'), task.copied);

    $('#editEventModal').modal('show');
  } catch (error) {
    console.error('Error loading event for editing:', error);
    alert('Failed to load event. Please try again.');
  }
}

async function saveEditTask() {
  const taskId = document.getElementById('edit-task-id').value;
  const taskInput = document.getElementById('edit-task-input');
  const eventDateInput = document.getElementById('edit-event-date');
  const whoInput = document.getElementById('edit-who');
  const sharedInput = document.getElementById('edit-shared');
  const ownerInput = document.getElementById('edit-owner');
  const copiedSelect = document.getElementById('edit-copied');
  const submitBtn = document.getElementById('edit-event-submit');

  const task = taskInput.value.trim();
  const eventDate = eventDateInput.value;

  if (!task) {
    alert('Please enter an event name');
    return;
  }

  if (!eventDate) {
    alert('Please select an event date');
    return;
  }

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    let userId = null;
    try {
      if (window.auth0) {
        const isAuthenticated = await window.auth0.isAuthenticated();
        if (isAuthenticated) {
          const user = await window.auth0.getUser();
          userId = user?.email || user?.nickname || user?.sub || null;
        }
      }
    } catch (authError) {
      console.error('Error getting Auth0 user:', authError);
    }

    if (!userId) {
      alert('You must be logged in to save changes.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit';
      return;
    }

    const whoVal = whoInput.value.trim();
    const ownerVal = ownerInput.value.trim();
    const sharedVal = sharedInput.value.trim();
    const payload = {
      event: task,
      event_date: eventDate,
      user_id: userId,
      who: whoVal === '' ? null : whoVal,
      owner: ownerVal === '' ? null : ownerVal,
      shared: sharedVal === '' ? null : sharedVal
    };
    const copiedVal = readCopiedFromSelect(copiedSelect);
    if (copiedVal !== undefined) payload.copied = copiedVal;

    const response = await fetch('/api/events/' + encodeURIComponent(taskId), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error('Failed to update event');
    }

    $('#editEventModal').modal('hide');
    await loadTasks();
  } catch (error) {
    console.error('Error updating event:', error);
    alert('Failed to update event. Please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit';
  }
}

async function deleteEventFromModal() {
  const taskId = document.getElementById('edit-task-id').value;
  if (!taskId) {
    alert('No event selected.');
    return;
  }

  const evName = document.getElementById('edit-task-input').value.trim();
  const label = evName ? '"' + evName + '"' : 'this event';
  if (!confirm('Delete ' + label + '? This cannot be undone.')) {
    return;
  }

  const deleteBtn = document.getElementById('edit-event-delete');
  const submitBtn = document.getElementById('edit-event-submit');

  try {
    if (deleteBtn) {
      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Deleting...';
    }
    if (submitBtn) submitBtn.disabled = true;

    let userId = null;
    try {
      if (window.auth0) {
        const isAuthenticated = await window.auth0.isAuthenticated();
        if (isAuthenticated) {
          const user = await window.auth0.getUser();
          userId = user?.email || user?.nickname || user?.sub || null;
        }
      }
    } catch (authError) {
      console.error('Error getting Auth0 user:', authError);
    }

    if (!userId) {
      alert('You must be logged in to delete an event.');
      return;
    }

    const response = await fetch(
      '/api/events/' + encodeURIComponent(taskId) + '?user_id=' + encodeURIComponent(userId),
      { method: 'DELETE' }
    );

    if (response.status === 403) {
      alert('You do not have permission to delete this event.');
      return;
    }
    if (response.status === 404) {
      alert('Event was not found. It may have already been deleted.');
      $('#editEventModal').modal('hide');
      await loadTasks();
      return;
    }
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete event');
    }

    $('#editEventModal').modal('hide');
    await loadTasks();
  } catch (error) {
    console.error('Error deleting event:', error);
    alert('Failed to delete event. Please try again.');
  } finally {
    if (deleteBtn) {
      deleteBtn.disabled = false;
      deleteBtn.textContent = 'Delete';
    }
    if (submitBtn) submitBtn.disabled = false;
  }
}

// Load events when content is visible
const originalUpdateContentVisibility = updateContentVisibility;
updateContentVisibility = function(isAuthenticated) {
  originalUpdateContentVisibility(isAuthenticated);
  if (isAuthenticated) {
    // Load events when user is authenticated and content is shown
    setTimeout(loadTasks, 100);
  }
};

// Set up form handler
document.addEventListener('DOMContentLoaded', () => {
  const addSubmitBtn = document.getElementById('add-event-submit');
  if (addSubmitBtn) {
    addSubmitBtn.addEventListener('click', addTaskForm);
  }
  const tbody = document.getElementById('tasks-tbody');
  if (tbody) {
    tbody.addEventListener('click', function(e) {
      const tr = e.target.closest('tr');
      if (!tr || !tr.classList.contains('events-table-row')) return;
      const id = tr.dataset.eventId;
      if (id) openEventModalFromRow(id);
    });
  }
  const submitBtn = document.getElementById('edit-event-submit');
  if (submitBtn) {
    submitBtn.addEventListener('click', saveEditTask);
  }
  const deleteBtn = document.getElementById('edit-event-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', deleteEventFromModal);
  }
});
