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

/** Whether the logged-in user is viewing their own profile page. */
var isOwnProfile = true;

/**
 * Parse the handle out of URLs like /events/@meganpicasso or /events/@meganpicasso/profiles.html.
 * Returns the bare handle string (no @), or null if not present.
 */
function getProfileHandleFromUrl() {
  const match = window.location.pathname.match(/\/events\/@([^\/]+)/);
  return match ? decodeURIComponent(match[1]).replace(/^@+/, '') : null;
}

/**
 * Fetch a profile row by handle from /api/profile/by-handle.
 * @returns {Promise<object|null>}
 */
async function fetchProfileByHandle(handle) {
  if (!handle) return null;
  try {
    const res = await fetch('/api/profile/by-handle?handle=' + encodeURIComponent(handle));
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error('Error loading profile by handle:', e);
    return null;
  }
}

/**
 * Show or hide profile edit controls (pencil icons, photo edit button)
 * based on whether the viewer owns this profile.
 */
function applyProfileEditVisibility(own) {
  const controls = [
    document.getElementById('profile-name-edit-btn'),
    document.getElementById('profile-photo-edit-btn'),
    document.getElementById('work-section-edit-btn'),
    document.getElementById('family-section-edit-btn'),
    document.getElementById('interests-section-edit-btn')
  ];
  controls.forEach(el => {
    if (el) el.style.display = own ? '' : 'none';
  });
}

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
  // When viewing someone else's profile, all display data comes from profileRow.
  // When viewing own profile, fall back to Auth0 user data if profileRow is missing.
  const viewedHandle =
    profileRow && profileRow.handle != null && String(profileRow.handle).trim() !== ''
      ? String(profileRow.handle).trim().replace(/^@+/, '')
      : '';

  const displayName =
    profileRow && profileRow.name != null && String(profileRow.name).trim() !== ''
      ? String(profileRow.name).trim()
      : (isOwnProfile ? profileDisplayNameFromUser(user) || (user.email || '') : '—');

  // Email to display and use for event-filtering is always the profile owner's email.
  // For own profile, prefer the live Auth0 email; fall back to stored row email.
  const viewedEmail =
    isOwnProfile
      ? ((user && user.email) || (profileRow && profileRow.email) || '')
      : ((profileRow && profileRow.email) || '');

  cachedProfileNameForFilter = displayName;
  cachedProfileEmailForFilter = viewedEmail || null;

  if (nameEl) nameEl.textContent = displayName;

  if (handleEl) {
    handleEl.textContent = viewedHandle ? '@' + viewedHandle : '—';
  }

  if (emailEl) emailEl.textContent = viewedEmail;

  if (imgEl) {
    imgEl.src = PROFILE_AVATAR_PLACEHOLDER;
    imgEl.alt = displayName;
    // Photo fallback: own profile can fall back to Auth0 avatar; others get placeholder
    const fallbackPhoto = isOwnProfile ? ((user && user.picture) || PROFILE_AVATAR_PLACEHOLDER) : PROFILE_AVATAR_PLACEHOLDER;
    if (viewedHandle) {
      fetch('/api/profile/photo?handle=' + encodeURIComponent(viewedHandle))
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && data.url) {
            const img = new Image();
            img.onload  = () => { imgEl.src = data.url; };
            img.onerror = () => { imgEl.src = fallbackPhoto; };
            img.src = data.url;
          } else {
            imgEl.src = fallbackPhoto;
          }
        })
        .catch(() => { imgEl.src = fallbackPhoto; });
    } else {
      imgEl.src = fallbackPhoto;
    }
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

    if (!currentUserEmail) {
      cachedUserEmail = null;
      loadingEl.style.display = 'none';
      emptyEl.textContent = 'Please log in to view your events.';
      emptyEl.style.display = 'block';
      applyProfileHeaderFromData(authUser, null);
      return;
    }

    cachedUserEmail = currentUserEmail;

    let profileRow = null;
    if (document.getElementById('profile-display-name')) {
      const urlHandle = getProfileHandleFromUrl();
      if (urlHandle) {
        // Viewing a profile page accessed by handle URL (e.g. /events/@meganpicasso)
        profileRow = await fetchProfileByHandle(urlHandle);
        cachedProfileRow = profileRow;
        // Determine if the logged-in user owns this profile
        if (profileRow && profileRow.email) {
          const normalize = e => {
            const [local, domain] = e.toLowerCase().split('@');
            return (local || '').replace(/\./g, '') + '@' + (domain || '');
          };
          isOwnProfile = normalize(currentUserEmail) === normalize(profileRow.email);
        } else {
          isOwnProfile = false;
        }
      } else {
        profileRow = await fetchProfileForPage(currentUserEmail);
        cachedProfileRow = profileRow;
        isOwnProfile = true;
      }
    } else {
      cachedProfileRow = null;
      isOwnProfile = true;
    }
    applyProfileHeaderFromData(authUser, profileRow);
    applyProfileEditVisibility(isOwnProfile);

    // Fetch and display handle from profiles table (skip if already set from URL handle load)
    if (!getProfileHandleFromUrl()) fetchAndDisplayHandle(currentUserEmail);

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
      const section = btn.dataset.section || 'notes';
      document.body.dataset.profileSection = section;
      showProfileSection(section);
    });
  }
  const profileEditBtn  = document.getElementById('profile-photo-edit-btn');
  const profilePhotoInput = document.getElementById('profile-photo-input');
  if (profileEditBtn && profilePhotoInput) {
    profileEditBtn.addEventListener('click', () => profilePhotoInput.click());

    profilePhotoInput.addEventListener('change', async () => {
      const file = profilePhotoInput.files && profilePhotoInput.files[0];
      if (!file) return;

      const handle = cachedProfileRow && cachedProfileRow.handle
        ? String(cachedProfileRow.handle).trim().replace(/^@+/, '')
        : '';
      if (!handle) {
        alert('Save your profile (name & handle) before uploading a photo.');
        return;
      }

      profileEditBtn.disabled = true;
      profileEditBtn.textContent = '…';

      try {
        const imageBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload  = e => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const res = await fetch('/api/profile/photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            handle,
            imageBase64,
            contentType: file.type || 'image/jpeg'
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Upload failed');

        // Bust the cache so the new image loads
        const imgEl = document.getElementById('profile-user-photo');
        if (imgEl && data.url) imgEl.src = data.url + '?t=' + Date.now();
      } catch (err) {
        console.error('Photo upload error:', err);
        alert('Photo upload failed: ' + err.message);
      } finally {
        profileEditBtn.disabled = false;
        profileEditBtn.textContent = 'Edit';
        profilePhotoInput.value = '';
      }
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

  const editWorkModalEl = document.getElementById('editWorkModal');
  if (editWorkModalEl && window.jQuery) {
    window.jQuery(editWorkModalEl).on('show.bs.modal', function() {
      populateEditWorkModal();
    });
  }
  const editWorkSubmit = document.getElementById('edit-work-submit');
  if (editWorkSubmit) {
    editWorkSubmit.addEventListener('click', function() {
      submitEditWorkForm();
    });
  }

  const editFamilyModalEl = document.getElementById('editFamilyModal');
  if (editFamilyModalEl && window.jQuery) {
    window.jQuery(editFamilyModalEl).on('show.bs.modal', function() {
      populateEditFamilyModal();
    });
  }
  const editFamilySubmit = document.getElementById('edit-family-submit');
  if (editFamilySubmit) {
    editFamilySubmit.addEventListener('click', function() {
      submitEditFamilyForm();
    });
  }

  const editInterestsModalEl = document.getElementById('editInterestsModal');
  if (editInterestsModalEl && window.jQuery) {
    window.jQuery(editInterestsModalEl).on('show.bs.modal', function() {
      populateEditInterestsModal();
    });
  }
  const editInterestsSubmit = document.getElementById('edit-interests-submit');
  if (editInterestsSubmit) {
    editInterestsSubmit.addEventListener('click', function() {
      submitEditInterestsForm();
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

// ── Work & Education section (profiles.html only) ────────────────────────────

let cachedWorkRow = null;
let workSectionLoaded = false;

function showProfileSection(section) {
  const notesEl     = document.getElementById('profile-section-notes');
  const workEl      = document.getElementById('profile-section-work');
  const familyEl    = document.getElementById('profile-section-family');
  const interestsEl = document.getElementById('profile-section-interests');
  if (notesEl)     notesEl.style.display     = section === 'notes'     ? '' : 'none';
  if (workEl)      workEl.style.display      = section === 'work'      ? '' : 'none';
  if (familyEl)    familyEl.style.display    = section === 'family'    ? '' : 'none';
  if (interestsEl) interestsEl.style.display = section === 'interests' ? '' : 'none';
  if (section === 'work'      && !workSectionLoaded)      loadWorkSection();
  if (section === 'family'    && !familySectionLoaded)    loadFamilySection();
  if (section === 'interests' && !interestsSectionLoaded) loadInterestsSection();
}

/** Format a YYYY-MM-DD string as "Mon YYYY". */
function fmtWorkDate(val, nullFallback) {
  if (!val || String(val).trim() === '') return nullFallback != null ? nullFallback : '';
  const parts = String(val).split('-');
  if (parts.length < 2) return val;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
  if (isNaN(d)) return val;
  return d.toLocaleString('default', { month: 'short', year: 'numeric' });
}

function workEntryHtml(company, title, startDate, endDate, isCurrent) {
  if (!company && !title) return '';
  const parts = [
    company ? escapeHtml(company) : '',
    title   ? escapeHtml(title)   : '',
    [fmtWorkDate(startDate, ''), isCurrent && !endDate ? 'Present' : fmtWorkDate(endDate, '')]
      .filter(Boolean).join(' – ')
  ].filter(Boolean).join(' · ');
  return '<div class="small mb-1">' + parts + '</div>';
}

function eduEntryHtml(school, major, startDate, endDate) {
  if (!school && !major) return '';
  const parts = [
    school ? escapeHtml(school) : '',
    major  ? escapeHtml(major)  : '',
    [fmtWorkDate(startDate, ''), fmtWorkDate(endDate, '')].filter(Boolean).join(' – ')
  ].filter(Boolean).join(' · ');
  return '<div class="small mb-1">' + parts + '</div>';
}

function renderWorkSection(row) {
  const contentEl = document.getElementById('work-section-content');
  if (!contentEl) return;
  if (!row) {
    contentEl.innerHTML = '<p class="text-muted small">No work or education info yet. Click the pencil to add.</p>';
    return;
  }
  let html = '';

  const jobs = [
    workEntryHtml(row.current_company, row.current_title, row.current_start_date, row.current_end_date, true),
    ...[1,2,3,4,5,6,7].map(i =>
      workEntryHtml(row['company'+i], row['title'+i], row['start_date'+i], row['end_date'+i], false))
  ].join('');
  if (jobs) {
    html += '<h6 class="text-uppercase text-muted small font-weight-bold mb-2">Work</h6>' + jobs;
  }

  const edu = [1,2,3,4].map(i =>
    eduEntryHtml(row['education'+i], row['major'+i], row['start_date_edu'+i], row['end_date_edu'+i])
  ).join('');
  if (edu) {
    html += '<h6 class="text-uppercase text-muted small font-weight-bold mb-2 mt-3">Education</h6>' + edu;
  }

  contentEl.innerHTML = html ||
    '<p class="text-muted small">No work or education info yet. Click the pencil to add.</p>';
}

async function loadWorkSection() {
  const loadingEl = document.getElementById('work-section-loading');
  const errorEl   = document.getElementById('work-section-error');

  const handle = cachedProfileRow && cachedProfileRow.handle
    ? String(cachedProfileRow.handle).trim().replace(/^@+/, '')
    : '';

  if (!handle) {
    const contentEl = document.getElementById('work-section-content');
    if (contentEl) contentEl.innerHTML = '<p class="text-muted small">No handle set — save your profile first.</p>';
    workSectionLoaded = true;
    return;
  }

  try {
    if (loadingEl) loadingEl.style.display = '';
    if (errorEl)   errorEl.style.display   = 'none';

    const res = await fetch('/api/profile/work?handle=' + encodeURIComponent(handle));
    if (!res.ok) throw new Error('Server error ' + res.status);
    const row = await res.json();
    cachedWorkRow = row;
    renderWorkSection(row);
  } catch (err) {
    console.error('Error loading work section:', err);
    if (errorEl) { errorEl.textContent = 'Failed to load work data.'; errorEl.style.display = ''; }
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
    workSectionLoaded = true;
  }
}

function populateEditWorkModal() {
  const row = cachedWorkRow || {};
  const fields = [
    'current_company','current_title','current_start_date','current_end_date',
    'company1','title1','start_date1','end_date1',
    'company2','title2','start_date2','end_date2',
    'company3','title3','start_date3','end_date3',
    'company4','title4','start_date4','end_date4',
    'company5','title5','start_date5','end_date5',
    'company6','title6','start_date6','end_date6',
    'company7','title7','start_date7','end_date7',
    'education1','major1','start_date_edu1','end_date_edu1',
    'education2','major2','start_date_edu2','end_date_edu2',
    'education3','major3','start_date_edu3','end_date_edu3',
    'education4','major4','start_date_edu4','end_date_edu4'
  ];
  fields.forEach(key => {
    const el = document.getElementById('ew-' + key);
    if (el) el.value = row[key] != null ? String(row[key]) : '';
  });
  const errEl = document.getElementById('edit-work-error');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
}

async function submitEditWorkForm() {
  const errEl     = document.getElementById('edit-work-error');
  const submitBtn = document.getElementById('edit-work-submit');
  if (!cachedUserEmail || !submitBtn) return;

  const keys = [
    'current_company','current_title','current_start_date','current_end_date',
    'company1','title1','start_date1','end_date1',
    'company2','title2','start_date2','end_date2',
    'company3','title3','start_date3','end_date3',
    'company4','title4','start_date4','end_date4',
    'company5','title5','start_date5','end_date5',
    'company6','title6','start_date6','end_date6',
    'company7','title7','start_date7','end_date7',
    'education1','major1','start_date_edu1','end_date_edu1',
    'education2','major2','start_date_edu2','end_date_edu2',
    'education3','major3','start_date_edu3','end_date_edu3',
    'education4','major4','start_date_edu4','end_date_edu4'
  ];
  const workFields = {};
  keys.forEach(key => {
    const el = document.getElementById('ew-' + key);
    workFields[key] = el ? el.value.trim() || null : null;
  });

  if (errEl) errEl.style.display = 'none';
  try {
    submitBtn.disabled = true;
    const res = await fetch('/api/profile/work', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: cachedUserEmail, ...workFields })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to save');
    cachedWorkRow = data;
    workSectionLoaded = false;
    renderWorkSection(data);
    if (window.jQuery) window.jQuery('#editWorkModal').modal('hide');
  } catch (err) {
    console.error('Error saving work:', err);
    if (errEl) { errEl.textContent = err.message || 'Failed to save.'; errEl.style.display = ''; }
  } finally {
    submitBtn.disabled = false;
  }
}

// ── Family section (profiles.html only) ──────────────────────────────────────

let cachedFamilyRow = null;
let familySectionLoaded = false;

function renderFamilySection(row) {
  const contentEl = document.getElementById('family-section-content');
  if (!contentEl) return;
  if (!row) {
    contentEl.innerHTML = '<p class="text-muted small">No family info yet. Click the pencil to add.</p>';
    return;
  }

  let html = '';
  for (let i = 1; i <= 9; i++) {
    const rel  = row['family_relationship' + i];
    const name = row['family_name' + i];
    if (!rel && !name) continue;
    const parts = [
      rel  ? '<span class="text-muted">' + escapeHtml(rel) + '</span>' : '',
      name ? escapeHtml(name) : ''
    ].filter(Boolean).join(' · ');
    html += '<div class="small mb-1">' + parts + '</div>';
  }

  contentEl.innerHTML = html ||
    '<p class="text-muted small">No family info yet. Click the pencil to add.</p>';
}

async function loadFamilySection() {
  const loadingEl = document.getElementById('family-section-loading');
  const errorEl   = document.getElementById('family-section-error');

  const handle = cachedProfileRow && cachedProfileRow.handle
    ? String(cachedProfileRow.handle).trim().replace(/^@+/, '')
    : '';

  if (!handle) {
    const contentEl = document.getElementById('family-section-content');
    if (contentEl) contentEl.innerHTML = '<p class="text-muted small">No handle set — save your profile first.</p>';
    familySectionLoaded = true;
    return;
  }

  try {
    if (loadingEl) loadingEl.style.display = '';
    if (errorEl)   errorEl.style.display   = 'none';

    const res = await fetch('/api/profile/family?handle=' + encodeURIComponent(handle));
    if (!res.ok) throw new Error('Server error ' + res.status);
    const row = await res.json();
    cachedFamilyRow = row;
    renderFamilySection(row);
  } catch (err) {
    console.error('Error loading family section:', err);
    if (errorEl) { errorEl.textContent = 'Failed to load family data.'; errorEl.style.display = ''; }
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
    familySectionLoaded = true;
  }
}

function populateEditFamilyModal() {
  const row = cachedFamilyRow || {};
  for (let i = 1; i <= 9; i++) {
    const relEl  = document.getElementById('ef-family_relationship' + i);
    const nameEl = document.getElementById('ef-family_name' + i);
    if (relEl)  relEl.value  = row['family_relationship' + i] || '';
    if (nameEl) nameEl.value = row['family_name' + i] || '';
  }
  const errEl = document.getElementById('edit-family-error');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
}

async function submitEditFamilyForm() {
  const errEl     = document.getElementById('edit-family-error');
  const submitBtn = document.getElementById('edit-family-submit');
  if (!cachedUserEmail || !submitBtn) return;

  const familyFields = {};
  for (let i = 1; i <= 9; i++) {
    const relEl  = document.getElementById('ef-family_relationship' + i);
    const nameEl = document.getElementById('ef-family_name' + i);
    familyFields['family_relationship' + i] = relEl  ? relEl.value.trim()  || null : null;
    familyFields['family_name'         + i] = nameEl ? nameEl.value.trim() || null : null;
  }

  if (errEl) errEl.style.display = 'none';
  try {
    submitBtn.disabled = true;
    const res = await fetch('/api/profile/family', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: cachedUserEmail, ...familyFields })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to save');
    cachedFamilyRow = data;
    familySectionLoaded = false;
    renderFamilySection(data);
    if (window.jQuery) window.jQuery('#editFamilyModal').modal('hide');
  } catch (err) {
    console.error('Error saving family:', err);
    if (errEl) { errEl.textContent = err.message || 'Failed to save.'; errEl.style.display = ''; }
  } finally {
    submitBtn.disabled = false;
  }
}

// ── Interests section (profiles.html only) ───────────────────────────────────

let cachedInterestsRow = null;
let interestsSectionLoaded = false;

function renderInterestsSection(row) {
  const contentEl = document.getElementById('interests-section-content');
  if (!contentEl) return;
  if (!row) {
    contentEl.innerHTML = '<p class="text-muted small">No interests yet. Click the pencil to add.</p>';
    return;
  }

  let html = '';
  for (let i = 1; i <= 5; i++) {
    const val = row['interest' + i];
    if (!val) continue;
    html += '<div class="small mb-1">' + escapeHtml(val) + '</div>';
  }

  contentEl.innerHTML = html ||
    '<p class="text-muted small">No interests yet. Click the pencil to add.</p>';
}

async function loadInterestsSection() {
  const loadingEl = document.getElementById('interests-section-loading');
  const errorEl   = document.getElementById('interests-section-error');

  const handle = cachedProfileRow && cachedProfileRow.handle
    ? String(cachedProfileRow.handle).trim().replace(/^@+/, '')
    : '';

  if (!handle) {
    const contentEl = document.getElementById('interests-section-content');
    if (contentEl) contentEl.innerHTML = '<p class="text-muted small">No handle set — save your profile first.</p>';
    interestsSectionLoaded = true;
    return;
  }

  try {
    if (loadingEl) loadingEl.style.display = '';
    if (errorEl)   errorEl.style.display   = 'none';

    const res = await fetch('/api/profile/interests?handle=' + encodeURIComponent(handle));
    if (!res.ok) throw new Error('Server error ' + res.status);
    const row = await res.json();
    cachedInterestsRow = row;
    renderInterestsSection(row);
  } catch (err) {
    console.error('Error loading interests:', err);
    if (errorEl) { errorEl.textContent = 'Failed to load interests.'; errorEl.style.display = ''; }
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
    interestsSectionLoaded = true;
  }
}

function populateEditInterestsModal() {
  const row = cachedInterestsRow || {};
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById('ei-interest' + i);
    if (el) el.value = row['interest' + i] || '';
  }
  const errEl = document.getElementById('edit-interests-error');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
}

async function submitEditInterestsForm() {
  const errEl     = document.getElementById('edit-interests-error');
  const submitBtn = document.getElementById('edit-interests-submit');
  if (!cachedUserEmail || !submitBtn) return;

  const interestFields = {};
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById('ei-interest' + i);
    interestFields['interest' + i] = el ? el.value.trim() || null : null;
  }

  if (errEl) errEl.style.display = 'none';
  try {
    submitBtn.disabled = true;
    const res = await fetch('/api/profile/interests', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: cachedUserEmail, ...interestFields })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to save');
    cachedInterestsRow = data;
    interestsSectionLoaded = false;
    renderInterestsSection(data);
    if (window.jQuery) window.jQuery('#editInterestsModal').modal('hide');
  } catch (err) {
    console.error('Error saving interests:', err);
    if (errEl) { errEl.textContent = err.message || 'Failed to save.'; errEl.style.display = ''; }
  } finally {
    submitBtn.disabled = false;
  }
}

// ── Load events when content is visible ──────────────────────────────────────
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
