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

/** Gray silhouette before `/api/profile/photo` or `/api/contact-photo` resolves (profiles Who column). */
const PROFILES_EVENTS_WHO_AVATAR_PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 72 72"><circle cx="36" cy="36" r="36" fill="#dee2e6"/><circle cx="36" cy="27" r="11" fill="#adb5bd"/><path d="M12 60c4-10 14-16 24-16s20 6 24 16" fill="#adb5bd"/></svg>'
  );

/** Currently active filter pill: 'all' | 'me' | 'megan' */
var currentEventsFilter = 'all';

/** Cached raw task list and user email from the last fetch */
var cachedTasks = null;
var cachedUserEmail = null;

/** Logged-in user's public handle (normalized, no @) — matches `events.owner` for new rows. */
var cachedViewerHandle = null;

/** life_events Megan pill: `who` must contain this substring (case-insensitive) */
var MEGAN_FILTER_WHO_SUBSTRING = 'meganpicassotest';

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
/** Latest successful `/api/groups/profile-mutual` response (contact `group_members.status` per group in `groups`). */
var cachedProfileMutualGroupsPayload = null;
/** True when current `profiles.html` subject is hydrated from `contact_library`. */
var cachedProfileFromContactLibrary = false;

/** Last Auth0 user object from loadTasks (for profile modal). */
var cachedAuthUser = null;

/**
 * True if comma/newline-separated field contains token (person_handle or legacy email).
 */
function fieldContainsToken(field, token) {
  if (!field || !token) return false;
  const needle = normalizeEventOwnerToken(token);
  if (!needle) return false;
  return String(field)
    .split(/[\s,;\n]+/)
    .map(t => normalizeEventOwnerToken(t))
    .filter(Boolean)
    .some(t => t === needle);
}

/** shared/who can contain person_handle tokens (preferred) or legacy emails. */
function fieldContainsViewerToken(field, viewerEmail, viewerHandle) {
  const h = normalizeEventOwnerToken(viewerHandle);
  const e = normalizeEventOwnerToken(viewerEmail);
  return (h && fieldContainsToken(field, h)) || (e && fieldContainsToken(field, e));
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
    return fieldContainsToken(w, p) || w.toLowerCase().includes(p.toLowerCase());
  }
  return w.toLowerCase().includes(p.toLowerCase());
}

function normalizeEventOwnerToken(s) {
  return s != null ? String(s).trim().replace(/^@+/, '').toLowerCase() : '';
}

/**
 * Distinct person_handle tokens from events.who (comma/whitespace-separated; @ optional).
 */
function splitWhoFieldToDistinctPersonHandles(who) {
  if (who == null || String(who).trim() === '') return [];
  const seen = new Set();
  const out = [];
  String(who)
    .split(/[\s,;\n]+/)
    .forEach(raw => {
      const normalized = normalizeEventOwnerToken(raw);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      const hrefPart = String(raw).trim().replace(/^@+/, '');
      if (!hrefPart) return;
      out.push(hrefPart);
    });
  return out;
}

function buildProfilesEventsWhoCellInnerHtml(whoPlain) {
  const handles = splitWhoFieldToDistinctPersonHandles(whoPlain);
  if (!handles.length) {
    return '<span class="text-muted">—</span>';
  }
  return handles
    .map(h => {
      const href = '/events/@' + encodeURIComponent(h);
      const title = escapeAttr(h);
      const ariaLabel = escapeAttr('Open profile ' + h);
      return (
        '<a href="' +
        href +
        '" class="profiles-events-who-avatar-link d-inline-flex mr-1 mb-1 align-items-center text-decoration-none" title="' +
        title +
        '" aria-label="' +
        ariaLabel +
        '">' +
        '<img src="' +
        PROFILES_EVENTS_WHO_AVATAR_PLACEHOLDER +
        '" width="32" height="32" class="profiles-events-who-avatar rounded-circle border border-light bg-white" alt="" data-events-who-handle="' +
        escapeAttr(h) +
        '" loading="lazy" />' +
        '</a>'
      );
    })
    .join('');
}

async function hydrateProfilesEventsWhoPhotos(container) {
  if (!container) return;
  const imgs = container.querySelectorAll('img.profiles-events-who-avatar[data-events-who-handle]');
  await Promise.all(
    [...imgs].map(async img => {
      const h = img.getAttribute('data-events-who-handle');
      if (!h) return;
      try {
        const pr = await fetch('/api/profile/photo?handle=' + encodeURIComponent(h));
        if (pr.ok) {
          const d = await pr.json();
          if (d && d.url) {
            img.src = d.url;
            return;
          }
        }
      } catch (e) {
        /* try contact photo */
      }
      try {
        const cr = await fetch('/api/contact-photo?person_handle=' + encodeURIComponent(h));
        if (cr.ok) {
          const d = await cr.json();
          if (d && d.url) img.src = d.url;
        }
      } catch (e) {
        /* keep placeholder */
      }
    })
  );
}

/** `events.owner` is handle(s); legacy rows may use email. */
function ownerFieldMatchesViewer(owner, userEmail, viewerHandle) {
  const h = normalizeEventOwnerToken(viewerHandle);
  const e = (userEmail || '').toLowerCase().trim();
  if (owner == null || String(owner).trim() === '') return false;
  const str = String(owner).trim();
  const parts = str.split(',').map(x => normalizeEventOwnerToken(x)).filter(Boolean);
  const tokens = parts.length ? parts : [normalizeEventOwnerToken(str)];
  return tokens.some(t => (h && t === h) || (e && t === e));
}

/**
 * Profiles page (`/events/@person_handle`):
 * - `events.who` contains the URL handle token, and
 * - logged-in viewer handle appears in `owner` or `shared`.
 */
function applyProfilePageEventFilter(tasks, _profileName, _profileEmail, viewerEmail) {
  const viewer = (viewerEmail || '').toLowerCase().trim();
  const viewedHandle = normalizeEventOwnerToken(getProfileHandleFromUrl());
  if (!viewer || !viewedHandle) return [];

  return tasks.filter(t => {
    const whoHasViewedHandle = fieldContainsToken(t.who, viewedHandle);
    const sharedHasViewer = fieldContainsViewerToken(
      t.shared,
      viewer,
      cachedViewerHandle
    );
    const ownerIsViewer = ownerFieldMatchesViewer(
      t.owner,
      viewer,
      cachedViewerHandle
    );
    return whoHasViewedHandle && (ownerIsViewer || sharedHasViewer);
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
 * all   – shared includes user  OR  owner matches viewer handle (or legacy email)
 * me    – (who includes user AND shared includes user)
 *          OR (who is blank AND owner matches viewer)
 * megan – `who` contains MEGAN_FILTER_WHO_SUBSTRING (e.g. handle meganpicassotest)
 */
function applyEventsFilter(tasks, filter, userEmail) {
  const email = (userEmail || '').toLowerCase().trim();

  const sharedHasUser  = t => fieldContainsViewerToken(t.shared, email, cachedViewerHandle);
  const ownerIsUser    = t => ownerFieldMatchesViewer(t.owner, email, cachedViewerHandle);
  const whoHasUser     = t => fieldContainsViewerToken(t.who, email, cachedViewerHandle);
  const whoHasMeganTest = t => {
    if (!t.who || !MEGAN_FILTER_WHO_SUBSTRING) return false;
    return String(t.who).toLowerCase().includes(MEGAN_FILTER_WHO_SUBSTRING.toLowerCase());
  };

  if (filter === 'me') {
    return tasks.filter(t =>
      whoHasUser(t) && (sharedHasUser(t) || ownerIsUser(t))
    );
  }
  if (filter === 'megan') {
    return tasks.filter(t => whoHasMeganTest(t));
  }
  if (filter === 'group_members') {
    // Show events where 'who' contains any member of the selected group
    return tasks.filter(t =>
      currentGroupMembers.some(m => fieldContainsToken(t.who, m))
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
  if (!cachedTasks || !cachedUserEmail) return; // viewer handle may be null; filters still match legacy owner emails
  let filtered;
  if (hasProfileOrContactHeader()) {
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
  if (!tbodyEl || !tableEl || !emptyEl) return;

  tbodyEl.innerHTML = '';

  if (!tasks.length) {
    tableEl.style.display = 'none';
    emptyEl.textContent = 'No events match this filter.';
    emptyEl.style.display = 'block';
    return;
  }

  emptyEl.style.display = 'none';
  tableEl.style.display = 'table';

  const isProfilesEventsTable = !!document.getElementById('profile-events-stack');

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
    if (isProfilesEventsTable) {
      const isLife =
        task.event_type != null &&
        String(task.event_type).trim().toLowerCase() === 'life';
      row.classList.add(isLife ? 'profiles-events-row-life' : 'profiles-events-row-default');
    } else {
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
      return;
    }
    const whoProfilesInner = buildProfilesEventsWhoCellInnerHtml(whoPlain);
    row.innerHTML = `
        <td><strong>${escapeHtml(name)}</strong></td>
        <td><small>${eventDate}</small></td>
        <td class="events-col-who profiles-events-who-cell"><div class="profiles-events-who-avatars d-flex flex-wrap align-items-center">${whoProfilesInner}</div></td>
      `;
    tbodyEl.appendChild(row);
  });

  if (isProfilesEventsTable) {
    hydrateProfilesEventsWhoPhotos(tbodyEl).catch(function() {});
  }
}

/**
 * Read JSON from a fetch Response; on error, include body text when JSON parse fails (e.g. payload too large).
 */
async function readJsonFromFetchResponse(res) {
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!res.ok) {
        throw new Error(
          text.slice(0, 400) || res.statusText || 'Request failed'
        );
      }
    }
  }
  if (!res.ok) {
    const msg =
      data.error ||
      data.message ||
      (text && text.slice(0, 400)) ||
      res.statusText ||
      'Request failed';
    throw new Error(String(msg));
  }
  return data;
}

/**
 * Resize and JPEG-encode an image file so base64 JSON stays under server/proxy limits.
 * @returns {Promise<string>} data URL
 */
function compressImageFileToJpegDataUrl(file, maxDim, jpegQuality) {
  maxDim = maxDim || 1920;
  jpegQuality = jpegQuality == null ? 0.85 : jpegQuality;
  return new Promise(function (resolve, reject) {
    if (!file || !file.type || !/^image\//i.test(file.type)) {
      reject(new Error('Not an image file'));
      return;
    }
    const img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function () {
      URL.revokeObjectURL(url);
      try {
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        if (w < 1 || h < 1) {
          reject(new Error('Invalid image dimensions'));
          return;
        }
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          function (blob) {
            if (!blob) {
              reject(new Error('Could not encode image'));
              return;
            }
            var reader = new FileReader();
            reader.onload = function (e) {
              resolve(e.target.result);
            };
            reader.onerror = function () {
              reject(new Error('Could not read blob'));
            };
            reader.readAsDataURL(blob);
          },
          'image/jpeg',
          jpegQuality
        );
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load image'));
    };
    img.src = url;
  });
}

/**
 * @returns {Promise<{ imageBase64: string, contentType: string }>}
 */
async function photoFileToUploadPayload(file) {
  var readOriginal = function () {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        resolve(e.target.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };
  try {
    var dataUrl = await compressImageFileToJpegDataUrl(file, 1920, 0.85);
    return { imageBase64: dataUrl, contentType: 'image/jpeg' };
  } catch (e) {
    console.warn('Photo compression skipped, using original file:', e);
    return {
      imageBase64: await readOriginal(),
      contentType: file.type || 'image/jpeg'
    };
  }
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
 * True when the URL `person_handle` is a `contact_library` row owned by the viewer (`owner_handle`).
 */
var canEditOwnedContactLibrary = false;

/**
 * profiles.html: viewing another person's `contact_library` row that you own (not your own @ handle).
 */
function isProfileOwnedContactView() {
  return (
    hasProfileOrContactHeader() &&
    !!getProfileHandleFromUrl() &&
    cachedProfileFromContactLibrary &&
    canEditOwnedContactLibrary &&
    !isOwnProfile
  );
}

/** Show My Private Notes + hide events stack; or reverse. */
function applyProfileOwnedContactNotesLayout() {
  const owned = isProfileOwnedContactView();
  const notesWrap = document.getElementById('profile-owned-contact-private-notes');
  const eventsStack = document.getElementById('profile-events-stack');
  const contentEl = document.getElementById('profile-my-private-notes-content');
  const contactDetailsPill = document.getElementById('profile-contact-details-pill');
  if (contactDetailsPill) {
    contactDetailsPill.style.display = owned ? 'none' : '';
  }
  if (notesWrap) notesWrap.style.display = owned ? '' : 'none';
  if (eventsStack) eventsStack.style.display = owned ? 'none' : '';
  if (!contentEl || !owned) return;
  const row = cachedProfileRow || {};
  const raw = row.my_notes != null ? String(row.my_notes) : '';
  if (raw.trim()) {
    contentEl.className = 'small text-body';
    contentEl.style.whiteSpace = 'pre-wrap';
    contentEl.style.wordBreak = 'break-word';
    contentEl.textContent = raw;
  } else {
    contentEl.className = 'small text-muted';
    contentEl.style.whiteSpace = 'normal';
    contentEl.textContent =
      'No private notes yet. Click the pencil to add notes in Contact Details.';
  }
}

/**
 * Parse the handle out of URLs like /events/@meganpicasso or /events/@meganpicasso/profiles.html.
 * Returns the bare handle string (no @), or null if not present.
 */
function getProfileHandleFromUrl() {
  const match = window.location.pathname.match(/\/events\/@([^\/]+)/);
  return match ? decodeURIComponent(match[1]).replace(/^@+/, '') : null;
}

/** Legacy contact-path page (`/events/contact/{pathKey}`) loads work from `contact_details`, not `profiles`. */
function isContactDetailsWorkPage() {
  const p = window.location.pathname;
  return /^\/events\/contact\/[^/]+\/?$/.test(p);
}

/** True if this page uses the profile header (profiles) or legacy contact header. */
function hasProfileOrContactHeader() {
  return !!(
    document.getElementById('profile-display-name') ||
    document.getElementById('contact-display-name')
  );
}

/**
 * Contact name for `contact_details.contact_name` (query `contact_name` or `contact`, or #contact-page-contact-name).
 * After load, uses cached row when URL is `/events/contact/{owners}_{slug}` (no query).
 * Normalized to match server lookup (trim, collapse spaces); `my_notes` and other fields load from that row via `/api/contact-details/work`.
 */
function getContactNameForContactDetailsPage() {
  const q = new URLSearchParams(window.location.search);
  const fromQuery = q.get('contact_name') || q.get('contact');
  if (fromQuery && String(fromQuery).trim()) {
    return String(fromQuery).trim().replace(/\s+/g, ' ');
  }
  const el = document.getElementById('contact-page-contact-name');
  if (el && el.value && String(el.value).trim()) {
    return String(el.value).trim().replace(/\s+/g, ' ');
  }
  if (
    cachedWorkRow &&
    cachedWorkRow.contact_name != null &&
    String(cachedWorkRow.contact_name).trim() !== ''
  ) {
    return String(cachedWorkRow.contact_name).trim().replace(/\s+/g, ' ');
  }
  return '';
}

/** Path segment after `/events/contact/` — `{owners_handle}_{contactNameSlug}` (same as contact_photos stem). */
function getContactPathKeyFromUrl() {
  const m = window.location.pathname.match(/^\/events\/contact\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : '';
}

/**
 * Value stored in `group_members.person_handle`: same as URL segment or `contact_details.handle`
 * (e.g. johnpicasso_aaronchalal), not the public @contact_handle.
 */
function getContactCompositeHandleForGroups(row) {
  const fromUrl = getContactPathKeyFromUrl();
  if (fromUrl && String(fromUrl).trim()) {
    return String(fromUrl).trim();
  }
  if (row && row.handle != null && String(row.handle).trim() !== '') {
    return String(row.handle).trim();
  }
  const oh =
    cachedProfileRow && cachedProfileRow.handle
      ? String(cachedProfileRow.handle).trim().replace(/^@+/, '').toLowerCase()
      : '';
  const cn =
    row && row.contact_name != null && String(row.contact_name).trim() !== ''
      ? String(row.contact_name).trim()
      : getContactNameForContactDetailsPage();
  const slug = contactDisplayNameToUrlSlug(cn);
  if (oh && slug) {
    return oh + '_' + slug;
  }
  return '';
}

/** Public profile handle for inviting (profiles.handle / contact_details.contact_handle), not the composite URL key. */
function getContactProfileHandleForInvite(row) {
  if (!row || row.contact_handle == null || String(row.contact_handle).trim() === '') {
    return '';
  }
  return String(row.contact_handle).trim().replace(/^@+/, '');
}

/** Matches server `contact_details.handle` (owner suffix: letters/digits only, lowercased). */
function contactDisplayNameToUrlSlug(name) {
  return String(name || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function buildContactDetailsWorkApiUrl(ownersHandle) {
  const oh = String(ownersHandle || '').trim().replace(/^@+/, '');
  if (!oh) return '';
  const pathKey = getContactPathKeyFromUrl();
  if (pathKey) {
    return (
      '/api/contact-details/work?path_key=' +
      encodeURIComponent(pathKey) +
      '&owners_handle=' +
      encodeURIComponent(oh)
    );
  }
  const contactName = getContactNameForContactDetailsPage();
  if (!contactName) return '';
  return (
    '/api/contact-details/work?owners_handle=' +
    encodeURIComponent(oh) +
    '&contact_name=' +
    encodeURIComponent(contactName)
  );
}

/** True when the contact page can resolve a `contact_details` row (path key or legacy query). */
function hasContactDetailsPageLookup() {
  if (getContactPathKeyFromUrl()) return true;
  return !!getContactNameForContactDetailsPage();
}

/** After loading with `?contact_name=`, replace the URL with `/events/contact/{owner}_{slug}`. */
function maybeReplaceLegacyContactQueryWithPath(ownersHandle, contactDisplayName) {
  if (getContactPathKeyFromUrl()) return;
  const q = new URLSearchParams(window.location.search);
  if (!q.get('contact_name') && !q.get('contact')) return;
  const oh = String(ownersHandle || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
  const slug = contactDisplayNameToUrlSlug(contactDisplayName);
  if (!oh || !slug) return;
  const url = new URL(window.location.href);
  url.pathname = '/events/contact/' + encodeURIComponent(oh + '_' + slug);
  url.search = '';
  window.history.replaceState({}, '', url);
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
 * Shape a raw `contact_library` API row for profile/work/family/interests renderers.
 * @param {object} row
 * @returns {object|null}
 */
function shapeContactLibraryProfileRow(row) {
  if (!row) return null;
  const personHandle =
    row.person_handle != null ? String(row.person_handle).trim() : '';
  const out = { ...row };
  out.handle = personHandle;
  out.name =
    row.name != null && String(row.name).trim() !== ''
      ? String(row.name).trim()
      : personHandle;
  out.email =
    row.personal_email != null && String(row.personal_email).trim() !== ''
      ? String(row.personal_email).trim()
      : row.work_email != null && String(row.work_email).trim() !== ''
        ? String(row.work_email).trim()
        : '';
  return out;
}

/**
 * Fetch a contact-library-backed profile row by `person_handle` from URL handle.
 * Returns a row shaped for existing profile/work/family/interests renderers.
 * @returns {Promise<object|null>}
 */
async function fetchContactLibraryProfileByPersonHandle(handle) {
  if (!handle) return null;
  try {
    const res = await fetch(
      '/api/contact-library/by-person-handle?person_handle=' +
        encodeURIComponent(handle)
    );
    if (!res.ok) return null;
    const row = await res.json();
    if (!row) return null;
    return shapeContactLibraryProfileRow(row);
  } catch (e) {
    console.error('Error loading contact_library profile by person_handle:', e);
    return null;
  }
}

/**
 * Show or hide profile edit controls (pencil icons, photo edit button)
 * based on whether the viewer owns this profile.
 */
function applyProfileEditVisibility(own) {
  if (isContactDetailsWorkPage()) {
    const show = !!own;
    [
      'contact-name-edit-btn',
      'contact-groups-edit-btn',
      'my-notes-section-edit-btn',
      'work-section-edit-btn',
      'education-section-edit-btn',
      'family-section-edit-btn',
      'interests-section-edit-btn'
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = show ? '' : 'none';
    });
    const contactPhotoBtn = document.getElementById('contact-photo-edit-btn');
    if (contactPhotoBtn) contactPhotoBtn.style.display = show ? '' : 'none';
    return;
  }
  const controls = [
    document.getElementById('profile-name-edit-btn'),
    document.getElementById('profile-photo-edit-btn'),
    document.getElementById('profile-location-edit-btn'),
    document.getElementById('profile-my-notes-edit-btn'),
    document.getElementById('work-section-edit-btn'),
    document.getElementById('education-section-edit-btn'),
    document.getElementById('family-section-edit-btn'),
    document.getElementById('interests-section-edit-btn')
  ];
  controls.forEach(el => {
    if (el) el.style.display = own ? '' : 'none';
  });
}

function setContactHeaderPhoneLines(row, cellEl, otherPhoneEl) {
  const c = row && row.cell != null ? String(row.cell).trim() : '';
  const o = row && row.other_phone != null ? String(row.other_phone).trim() : '';
  if (!c && !o) {
    if (cellEl) cellEl.textContent = 'Cell: TBD';
    if (otherPhoneEl) otherPhoneEl.textContent = '';
    return;
  }
  if (cellEl) cellEl.textContent = c ? 'Cell: ' + c : 'Cell: TBD';
  if (otherPhoneEl) otherPhoneEl.textContent = o ? 'Other phone: ' + o : '';
}

function setContactHeaderEmailLines(row, workEmailEl, personalEmailEl) {
  const w = row && row.work_email != null ? String(row.work_email).trim() : '';
  const p = row && row.personal_email != null ? String(row.personal_email).trim() : '';
  if (!w && !p) {
    if (workEmailEl) workEmailEl.textContent = 'Email: TBD';
    if (personalEmailEl) personalEmailEl.textContent = '';
    return;
  }
  if (workEmailEl) workEmailEl.textContent = w ? 'Work: ' + w : '';
  if (personalEmailEl) personalEmailEl.textContent = p ? 'Personal: ' + p : '';
}

function setContactGroupsSummaryDefault() {
  const el = document.getElementById('contact-groups-summary');
  if (el) el.textContent = 'Groups: —';
}

async function fetchGroupEntriesByPersonHandle(personHandle, userEmail) {
  const ph = personHandle != null ? String(personHandle).trim() : '';
  const uid = userEmail != null ? String(userEmail).trim() : '';
  if (!ph || !uid) return [];
  const res = await fetch('/api/groups/group-names-by-person-handles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: uid, person_handles: [ph] })
  });
  if (!res.ok) return [];
  const data = await res.json();
  const entriesByHandle = data && data.group_entries ? data.group_entries : {};
  const rows = Array.isArray(entriesByHandle[ph]) ? entriesByHandle[ph] : [];
  return rows.filter(r => {
    const name = r && r.group_name != null ? String(r.group_name).trim() : '';
    const gh = r && r.group_handle != null ? String(r.group_handle).trim() : '';
    return !!name && !!gh;
  });
}

function renderContactGroupsSummaryLinks(summaryEl, entries) {
  if (!summaryEl) return;
  summaryEl.innerHTML = '';

  const label = document.createElement('span');
  label.textContent = 'Groups: ';
  summaryEl.appendChild(label);

  if (!entries || !entries.length) {
    summaryEl.appendChild(document.createTextNode('—'));
    return;
  }

  entries.forEach((entry, i) => {
    const name = String(entry.group_name).trim();
    const gh = String(entry.group_handle).trim();
    const href = groupPageUrlFromHandle(gh);
    if (!href) return;
    if (i > 0) summaryEl.appendChild(document.createTextNode(', '));
    const a = document.createElement('a');
    a.href = href;
    a.textContent = name;
    a.className = 'text-muted';
    a.style.textDecoration = 'underline';
    summaryEl.appendChild(a);
  });
}

async function refreshContactGroupsSummaryLine(row) {
  setContactGroupsSummaryDefault();
  const el = document.getElementById('contact-groups-summary');
  if (!el || !row) return;
  const ph = getContactCompositeHandleForGroups(row);
  if (!ph || !cachedUserEmail) return;
  try {
    const entries = await fetchGroupEntriesByPersonHandle(ph, cachedUserEmail);
    console.log(
      'profiles.html group_handles for person_handle',
      ph,
      entries.map(e => e.group_handle)
    );
    renderContactGroupsSummaryLinks(el, entries);
  } catch (e) {
    /* keep TBD */
  }
}

/**
 * profiles.html: fill header from `contact_details` (owner handle + contact_name query).
 * Sets cachedWorkRow (and family/interests caches) when a row is returned so tabs can reuse it.
 */
async function applyContactDetailsPageHeader(authUser, ownerProfileRow) {
  const nameEl = document.getElementById('contact-display-name');
  const cellEl = document.getElementById('contact-cell');
  const otherPhoneEl = document.getElementById('contact-other-phone');
  const workEmailEl = document.getElementById('contact-work-email');
  const personalEmailEl = document.getElementById('contact-personal-email');
  const publicHandleEl = document.getElementById('contact-public-handle');
  const imgEl = document.getElementById('contact-user-photo');

  const ownersHandle =
    ownerProfileRow && ownerProfileRow.handle
      ? String(ownerProfileRow.handle).trim().replace(/^@+/, '')
      : '';
  const contactName = getContactNameForContactDetailsPage();

  cachedProfileNameForFilter = contactName || null;
  cachedProfileEmailForFilter = null;

  if (!ownersHandle) {
    if (nameEl) nameEl.textContent = '—';
    setContactHeaderPhoneLines(null, cellEl, otherPhoneEl);
    setContactHeaderEmailLines(null, workEmailEl, personalEmailEl);
    if (publicHandleEl) publicHandleEl.textContent = '';
    setContactGroupsSummaryDefault();
    if (imgEl) {
      imgEl.src = PROFILE_AVATAR_PLACEHOLDER;
      imgEl.alt = '';
    }
    cachedWorkRow = null;
    cachedFamilyRow = null;
    cachedInterestsRow = null;
    return;
  }

  const workUrl = buildContactDetailsWorkApiUrl(ownersHandle);
  if (!hasContactDetailsPageLookup() || !workUrl) {
    if (nameEl) nameEl.textContent = '—';
    setContactHeaderPhoneLines(null, cellEl, otherPhoneEl);
    setContactHeaderEmailLines(null, workEmailEl, personalEmailEl);
    if (publicHandleEl) publicHandleEl.textContent = '';
    setContactGroupsSummaryDefault();
    if (imgEl) {
      imgEl.src = PROFILE_AVATAR_PLACEHOLDER;
      imgEl.alt = '';
    }
    cachedWorkRow = null;
    cachedFamilyRow = null;
    cachedInterestsRow = null;
    return;
  }

  try {
    const res = await fetch(workUrl);
    const row = res.ok ? await res.json() : null;
    cachedWorkRow = row;
    cachedFamilyRow = row;
    cachedInterestsRow = row;

    const displayName =
      row && row.contact_name != null && String(row.contact_name).trim() !== ''
        ? String(row.contact_name).trim()
        : contactName;
    cachedProfileNameForFilter = displayName || null;
    maybeReplaceLegacyContactQueryWithPath(ownersHandle, displayName);
    if (nameEl) nameEl.textContent = displayName;

    setContactHeaderPhoneLines(row, cellEl, otherPhoneEl);
    setContactHeaderEmailLines(row, workEmailEl, personalEmailEl);

    if (publicHandleEl) {
      const ch =
        row && row.contact_handle != null && String(row.contact_handle).trim() !== ''
          ? String(row.contact_handle).trim().replace(/^@+/, '')
          : '';
      if (!ch) {
        publicHandleEl.textContent = 'Public handle: —';
      } else {
        const profilePath = '/events/@' + encodeURIComponent(ch);
        publicHandleEl.innerHTML =
          'Public handle: <a href="' +
          escapeAttr(profilePath) +
          '" class="text-primary">' +
          '@' +
          escapeHtml(ch) +
          '</a>';
      }
    }

    if (imgEl) {
      imgEl.alt = displayName;
      imgEl.src = PROFILE_AVATAR_PLACEHOLDER;
      const photoContactName =
        row && row.contact_name != null && String(row.contact_name).trim() !== ''
          ? String(row.contact_name).trim()
          : contactName;
      fetch(
        '/api/contact-photo?owners_handle=' +
          encodeURIComponent(ownersHandle) +
          '&contact_name=' +
          encodeURIComponent(photoContactName)
      )
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (data && data.url) {
            const img = new Image();
            img.onload = () => {
              imgEl.src = data.url;
            };
            img.onerror = () => {
              imgEl.src = PROFILE_AVATAR_PLACEHOLDER;
            };
            img.src = data.url;
          }
        })
        .catch(() => {});
    }

    await refreshContactGroupsSummaryLine(row);
  } catch (e) {
    console.error('applyContactDetailsPageHeader:', e);
    if (nameEl) nameEl.textContent = contactName;
    setContactHeaderPhoneLines(null, cellEl, otherPhoneEl);
    setContactHeaderEmailLines(null, workEmailEl, personalEmailEl);
    if (publicHandleEl) publicHandleEl.textContent = '';
    setContactGroupsSummaryDefault();
    cachedWorkRow = null;
    cachedFamilyRow = null;
    cachedInterestsRow = null;
  }
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

async function fetchPersonHandleByEmail(userEmail) {
  if (!userEmail) return null;
  try {
    const res = await fetch('/api/person-handle?user_id=' + encodeURIComponent(userEmail));
    if (!res.ok) return null;
    const row = await res.json();
    if (!row || !row.person_handle) return null;
    return String(row.person_handle).trim().replace(/^@+/, '');
  } catch (e) {
    console.error('Error loading person_handle by email:', e);
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

/**
 * Fetches `profiles` row for the logged-in user (profiles page only).
 */
async function fetchProfileForPage(userEmail) {
  if (!hasProfileOrContactHeader() || !userEmail) return null;
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
  const locValueEl = document.getElementById('profile-location-value');
  const cellLineEl = document.getElementById('profile-cell-line');
  const workEmailLineEl = document.getElementById('profile-work-email-line');
  const personalEmailLineEl = document.getElementById('profile-personal-email-line');
  const homeAddressLineEl = document.getElementById('profile-home-address-line');
  cachedProfileNameForFilter = null;
  cachedProfileEmailForFilter = null;
  if (!nameEl && !emailEl && !imgEl) return;
  if (!user) {
    cachedProfileRow = null;
    if (nameEl) nameEl.textContent = '';
    if (handleEl) handleEl.textContent = '';
    if (emailEl) emailEl.textContent = '';
    if (locValueEl) locValueEl.textContent = 'Location: —';
    else if (locEl) locEl.textContent = 'Location: —';
    if (cellLineEl) cellLineEl.textContent = 'Cell: —';
    if (workEmailLineEl) workEmailLineEl.textContent = 'Work Email: —';
    if (personalEmailLineEl) personalEmailLineEl.textContent = 'Personal Email: —';
    if (homeAddressLineEl) homeAddressLineEl.textContent = 'Home Address: —';
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

  if (locEl || locValueEl) {
    const loc =
      profileRow && profileRow.location != null && String(profileRow.location).trim() !== ''
        ? String(profileRow.location).trim()
        : '—';
    if (locValueEl) locValueEl.textContent = 'Location: ' + loc;
    else if (locEl) locEl.textContent = 'Location: ' + loc;
  }

  const cellVal =
    profileRow && profileRow.cell != null && String(profileRow.cell).trim() !== ''
      ? String(profileRow.cell).trim()
      : '—';
  const workEmailVal =
    profileRow && profileRow.work_email != null && String(profileRow.work_email).trim() !== ''
      ? String(profileRow.work_email).trim()
      : '—';
  const personalEmailVal =
    profileRow && profileRow.personal_email != null && String(profileRow.personal_email).trim() !== ''
      ? String(profileRow.personal_email).trim()
      : '—';
  const homeAddressVal =
    profileRow && profileRow.home_address != null && String(profileRow.home_address).trim() !== ''
      ? String(profileRow.home_address).trim()
      : profileRow && profileRow.address != null && String(profileRow.address).trim() !== ''
        ? String(profileRow.address).trim()
        : '—';

  if (cellLineEl) cellLineEl.textContent = 'Cell: ' + cellVal;
  if (workEmailLineEl) workEmailLineEl.textContent = 'Work Email: ' + workEmailVal;
  if (personalEmailLineEl) personalEmailLineEl.textContent = 'Personal Email: ' + personalEmailVal;
  if (homeAddressLineEl) homeAddressLineEl.textContent = 'Home Address: ' + homeAddressVal;
}

function getEditProfileFormEl(suffix) {
  return document.getElementById('edit-profile-' + suffix) || document.getElementById('edit-contact-' + suffix);
}

function populateEditProfileContactLibraryModal() {
  const row = cachedProfileRow || {};
  const errEl = document.getElementById('pcd-error');
  if (errEl) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }
  const ph =
    row.person_handle != null && String(row.person_handle).trim() !== ''
      ? String(row.person_handle).trim()
      : row.handle != null
        ? String(row.handle).trim().replace(/^@+/, '')
        : '';
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v != null ? String(v) : '';
  };
  set('pcd-person_handle', ph);
  set(
    'pcd-name',
    row.name != null && String(row.name).trim() !== ''
      ? String(row.name).trim()
      : ''
  );
  set(
    'pcd-profile_handle',
    row.profile_handle != null ? String(row.profile_handle).trim().replace(/^@+/, '') : ''
  );
  set('pcd-my_notes', row.my_notes != null ? String(row.my_notes) : '');
  set('pcd-cell', row.cell != null ? String(row.cell).trim() : '');
  set('pcd-other_phone', row.other_phone != null ? String(row.other_phone).trim() : '');
  set('pcd-work_email', row.work_email != null ? String(row.work_email).trim() : '');
  set('pcd-personal_email', row.personal_email != null ? String(row.personal_email).trim() : '');
  set('pcd-location', row.location != null ? String(row.location).trim() : '');
  set(
    'pcd-home_address',
    row.home_address != null
      ? String(row.home_address).trim()
      : row.address != null
        ? String(row.address).trim()
        : ''
  );
}

async function submitEditProfileContactLibraryForm() {
  const errEl = document.getElementById('pcd-error');
  const submitBtn = document.getElementById('edit-profile-contact-library-submit');
  if (!cachedUserEmail || !submitBtn) return;
  if (!cachedProfileFromContactLibrary || (!isOwnProfile && !canEditOwnedContactLibrary)) {
    if (errEl) {
      errEl.textContent = 'You cannot edit this contact.';
      errEl.style.display = 'block';
    }
    return;
  }
  const personHandle = getProfileHandleFromUrl();
  if (!personHandle) return;

  function trimOrNull(id) {
    const el = document.getElementById(id);
    const t = el ? String(el.value).trim() : '';
    return t ? t : null;
  }

  const patch = {
    profile_handle: trimOrNull('pcd-profile_handle'),
    my_notes: trimOrNull('pcd-my_notes'),
    cell: trimOrNull('pcd-cell'),
    other_phone: trimOrNull('pcd-other_phone'),
    work_email: trimOrNull('pcd-work_email'),
    personal_email: trimOrNull('pcd-personal_email'),
    location: trimOrNull('pcd-location'),
    home_address: trimOrNull('pcd-home_address')
  };

  if (errEl) errEl.style.display = 'none';
  try {
    submitBtn.disabled = true;
    const res = await fetch('/api/contact-library/row', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: cachedUserEmail,
        person_handle: personHandle,
        patch: patch
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
        errEl.textContent = data.error || 'Failed to save contact details.';
        errEl.style.display = 'block';
      }
      return;
    }
    cachedProfileRow = shapeContactLibraryProfileRow(data) || cachedProfileRow;
    cachedWorkRow = cachedProfileRow;
    cachedFamilyRow = cachedProfileRow;
    cachedInterestsRow = cachedProfileRow;
    applyProfileHeaderFromData(cachedAuthUser, cachedProfileRow);
    applyProfileOwnedContactNotesLayout();
    renderWithAllFilters();
    if (window.jQuery) window.jQuery('#editProfileContactLibraryModal').modal('hide');
  } catch (e) {
    console.error(e);
    if (errEl) {
      errEl.textContent = 'Failed to save contact details.';
      errEl.style.display = 'block';
    }
  } finally {
    submitBtn.disabled = false;
  }
}

function populateEditProfileModal() {
  const nameEl = getEditProfileFormEl('name');
  const handleEl = getEditProfileFormEl('handle');
  const emailEl = getEditProfileFormEl('email');
  const locationEl = getEditProfileFormEl('location');
  const errEl = getEditProfileFormEl('error');
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
  if (canEditOwnedContactLibrary && !isOwnProfile && row) {
    const pub =
      row.profile_handle != null && String(row.profile_handle).trim() !== ''
        ? String(row.profile_handle).trim().replace(/^@+/, '')
        : '';
    handleEl.value =
      pub ||
      (row.handle != null ? String(row.handle).replace(/^@+/, '') : '');
  } else {
    handleEl.value =
      row && row.handle != null ? String(row.handle).replace(/^@+/, '') : '';
  }
  emailEl.value = cachedUserEmail || user.email || '';
  locationEl.value = row && row.location != null ? String(row.location) : '';
}

async function submitEditProfileForm() {
  const nameEl = getEditProfileFormEl('name');
  const handleEl = getEditProfileFormEl('handle');
  const locationEl = getEditProfileFormEl('location');
  const errEl = getEditProfileFormEl('error');
  const submitBtn = document.getElementById('edit-profile-submit');
  if (!nameEl || !handleEl || !locationEl || !cachedUserEmail || !submitBtn) return;
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
    if (canEditOwnedContactLibrary && !isOwnProfile && getProfileHandleFromUrl()) {
      const res = await fetch('/api/contact-library/row', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: cachedUserEmail,
          person_handle: getProfileHandleFromUrl(),
          patch: {
            name: n,
            location: l,
            profile_handle: h.replace(/^@+/, '').trim() || null
          }
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
      cachedProfileRow = shapeContactLibraryProfileRow(data) || cachedProfileRow;
      cachedWorkRow = cachedProfileRow;
      cachedFamilyRow = cachedProfileRow;
      cachedInterestsRow = cachedProfileRow;
      applyProfileHeaderFromData(cachedAuthUser, cachedProfileRow);
      renderWithAllFilters();
      if (window.jQuery) {
        window.jQuery('#editProfileModal').modal('hide');
        window.jQuery('#editContactDetailsModal').modal('hide');
      }
      return;
    }

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
    if (window.jQuery) {
      window.jQuery('#editProfileModal').modal('hide');
      window.jQuery('#editContactDetailsModal').modal('hide');
    }
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
  const hasEventsUI = !!(loadingEl && errorEl && emptyEl && tableEl);

  try {
    if (hasEventsUI) {
      loadingEl.style.display = 'block';
      errorEl.style.display   = 'none';
      emptyEl.style.display   = 'none';
      tableEl.style.display   = 'none';
    }

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
      cachedViewerHandle = null;
      if (hasEventsUI) {
        loadingEl.style.display = 'none';
        emptyEl.textContent = 'Please log in to view your events.';
        emptyEl.style.display = 'block';
      }
      if (isContactDetailsWorkPage()) {
        [
          'contact-cell',
          'contact-other-phone',
          'contact-work-email',
          'contact-personal-email',
          'contact-public-handle'
        ].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.textContent = '';
        });
        const myGroupsPills = document.getElementById('contact-my-groups-pills');
        const myGroupsWrap = document.getElementById('contact-my-groups-wrap');
        if (myGroupsPills) myGroupsPills.innerHTML = '';
        if (myGroupsWrap) myGroupsWrap.style.display = 'none';
      }
      const profileMutualBlock = document.getElementById('profile-mutual-groups-block');
      const profileMutualPills = document.getElementById('profile-mutual-groups-pills');
      const profileMutualWrap = document.getElementById('profile-mutual-groups-wrap');
      if (profileMutualBlock) profileMutualBlock.style.display = 'none';
      if (profileMutualPills) profileMutualPills.innerHTML = '';
      if (profileMutualWrap) profileMutualWrap.style.display = 'none';
      applyProfileHeaderFromData(authUser, null);
      return;
    }

    cachedUserEmail = currentUserEmail;
    const myPersonHandle = await fetchPersonHandleByEmail(currentUserEmail);
    setMyProfileNavHref(myPersonHandle);

    let profileRow = null;
    canEditOwnedContactLibrary = false;
    if (hasProfileOrContactHeader()) {
      const urlHandle = getProfileHandleFromUrl();
      if (urlHandle) {
        const viewedHandle = String(urlHandle).trim().replace(/^@+/, '').toLowerCase();
        const myHandle = myPersonHandle != null
          ? String(myPersonHandle).trim().replace(/^@+/, '').toLowerCase()
          : '';
        isOwnProfile = !!myHandle && !!viewedHandle && myHandle === viewedHandle;

        // profiles.html handle route prefers `contact_library.person_handle` source.
        profileRow = await fetchContactLibraryProfileByPersonHandle(urlHandle);
        if (profileRow) {
          cachedProfileFromContactLibrary = true;
          cachedProfileRow = profileRow;
          cachedWorkRow = profileRow;
          cachedFamilyRow = profileRow;
          cachedInterestsRow = profileRow;
          const oh =
            profileRow.owner_handle != null
              ? String(profileRow.owner_handle).trim().replace(/^@+/, '').toLowerCase()
              : '';
          const ph =
            profileRow.person_handle != null
              ? String(profileRow.person_handle).trim().replace(/^@+/, '').toLowerCase()
              : '';
          canEditOwnedContactLibrary =
            !!myHandle && !!oh && !!ph && oh === myHandle && ph === viewedHandle;
        } else {
          // Fallback for legacy profile-handle rows from `profiles`.
          cachedProfileFromContactLibrary = false;
          profileRow = await fetchProfileByHandle(urlHandle);
          cachedProfileRow = profileRow;
        }
      } else {
        cachedProfileFromContactLibrary = false;
        profileRow = await fetchProfileForPage(currentUserEmail);
        cachedProfileRow = profileRow;
        isOwnProfile = true;
      }
    } else {
      cachedProfileRow = null;
      isOwnProfile = true;
    }

    cachedViewerHandle = null;
    if (currentUserEmail) {
      if (
        hasProfileOrContactHeader() &&
        !getProfileHandleFromUrl() &&
        profileRow &&
        profileRow.handle
      ) {
        cachedViewerHandle = String(profileRow.handle)
          .trim()
          .replace(/^@+/, '')
          .toLowerCase();
      } else {
        const vp = await fetchProfileByEmail(currentUserEmail);
        cachedViewerHandle =
          vp && vp.handle
            ? String(vp.handle)
                .trim()
                .replace(/^@+/, '')
                .toLowerCase()
            : null;
      }
    }

    if (isContactDetailsWorkPage()) {
      await applyContactDetailsPageHeader(authUser, cachedProfileRow);
      applyProfileEditVisibility(isOwnProfile || canEditOwnedContactLibrary);
    } else {
      applyProfileHeaderFromData(authUser, profileRow);
      applyProfileEditVisibility(isOwnProfile || canEditOwnedContactLibrary);
      applyProfileOwnedContactNotesLayout();
      if (!getProfileHandleFromUrl()) fetchAndDisplayHandle(currentUserEmail);
    }

    if (hasProfileOrContactHeader()) {
      preloadProfileSubsectionsData();
    }

    // Load group pills in parallel — don't block the events fetch
    loadGroupPills(currentUserEmail);
    loadContactPageGroupPills(currentUserEmail);
    loadProfilePageMutualGroups(currentUserEmail);

    if (!hasEventsUI) {
      return;
    }

    if (isProfileOwnedContactView()) {
      loadingEl.style.display = 'none';
      errorEl.style.display = 'none';
      emptyEl.style.display = 'none';
      tableEl.style.display = 'none';
      return;
    }

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
    if (hasEventsUI) {
      loadingEl.style.display = 'none';
      errorEl.textContent = 'Failed to load events. Please refresh the page.';
      errorEl.style.display = 'block';
    }
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

  // ── Profile / contact page: section pills + photo edit ─
  [
    ['profile-section-pills', 'profile-section-btn'],
    ['contact-section-pills', 'contact-section-btn']
  ].forEach(([pillId, btnClass]) => {
    const profilePills = document.getElementById(pillId);
    if (!profilePills) return;
    profilePills.addEventListener('click', e => {
      const btn = e.target.closest('.' + btnClass);
      if (!btn) return;
      profilePills.querySelectorAll('.' + btnClass).forEach(b => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-outline-primary');
      });
      btn.classList.remove('btn-outline-primary');
      btn.classList.add('btn-primary');
      const section = btn.dataset.section || 'notes';
      document.body.dataset.profileSection = section;
      showProfileSection(section);
    });
  });

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
        const { imageBase64, contentType: uploadContentType } =
          await photoFileToUploadPayload(file);

        const res = await fetch('/api/profile/photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            handle,
            imageBase64,
            contentType: uploadContentType
          })
        });
        const data = await readJsonFromFetchResponse(res);

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

  const contactEditBtn = document.getElementById('contact-photo-edit-btn');
  const contactPhotoInput = document.getElementById('contact-photo-input');
  if (contactEditBtn && contactPhotoInput) {
    contactEditBtn.addEventListener('click', () => contactPhotoInput.click());

    contactPhotoInput.addEventListener('change', async () => {
      const file = contactPhotoInput.files && contactPhotoInput.files[0];
      if (!file) return;

      const ownersHandle =
        cachedProfileRow && cachedProfileRow.handle
          ? String(cachedProfileRow.handle).trim().replace(/^@+/, '')
          : '';
      const contactName =
        getContactNameForContactDetailsPage() ||
        (cachedWorkRow && cachedWorkRow.contact_name != null
          ? String(cachedWorkRow.contact_name).trim()
          : '');
      if (!ownersHandle || !contactName) {
        alert('Contact context (owner handle and contact name) is required to upload a photo.');
        return;
      }

      contactEditBtn.disabled = true;
      contactEditBtn.textContent = '…';

      try {
        const { imageBase64, contentType: uploadContentType } =
          await photoFileToUploadPayload(file);

        const res = await fetch('/api/contact-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owners_handle: ownersHandle,
            contact_name: contactName,
            imageBase64,
            contentType: uploadContentType
          })
        });
        const data = await readJsonFromFetchResponse(res);

        const imgEl = document.getElementById('contact-user-photo');
        if (imgEl && data.url) imgEl.src = data.url + '?t=' + Date.now();
      } catch (err) {
        console.error('Contact photo upload error:', err);
        alert('Photo upload failed: ' + err.message);
      } finally {
        contactEditBtn.disabled = false;
        contactEditBtn.textContent = 'Edit';
        contactPhotoInput.value = '';
      }
    });
  }

  ['editProfileModal', 'editContactDetailsModal', 'editProfileContactLibraryModal'].forEach(
    mid => {
      const editProfileModalEl = document.getElementById(mid);
      if (editProfileModalEl && window.jQuery) {
        window.jQuery(editProfileModalEl).on('show.bs.modal', function() {
          if (mid === 'editContactDetailsModal') populateEditContactDetailsModal();
          else if (mid === 'editProfileContactLibraryModal') populateEditProfileContactLibraryModal();
          else populateEditProfileModal();
        });
      }
    }
  );
  const editProfileSubmit = document.getElementById('edit-profile-submit');
  if (editProfileSubmit) {
    editProfileSubmit.addEventListener('click', function() {
      submitEditProfileForm();
    });
  }

  const editProfileContactLibrarySubmit = document.getElementById(
    'edit-profile-contact-library-submit'
  );
  if (editProfileContactLibrarySubmit) {
    editProfileContactLibrarySubmit.addEventListener('click', function() {
      submitEditProfileContactLibraryForm();
    });
  }

  function openProfileContactLibraryEditModal() {
    if (!window.jQuery) return;
    populateEditProfileContactLibraryModal();
    window.jQuery('#editProfileContactLibraryModal').modal('show');
  }

  const profileNameEditBtn = document.getElementById('profile-name-edit-btn');
  if (profileNameEditBtn && window.jQuery) {
    profileNameEditBtn.addEventListener('click', function(e) {
      e.preventDefault();
      if (cachedProfileFromContactLibrary) {
        openProfileContactLibraryEditModal();
      } else if (isOwnProfile) {
        populateEditProfileModal();
        window.jQuery('#editProfileModal').modal('show');
      }
    });
  }

  const profileContactDetailsEditBtn = document.getElementById('profile-location-edit-btn');
  if (profileContactDetailsEditBtn && window.jQuery) {
    profileContactDetailsEditBtn.addEventListener('click', function(e) {
      e.preventDefault();
      if (cachedProfileFromContactLibrary) {
        openProfileContactLibraryEditModal();
      } else if (isOwnProfile) {
        populateEditProfileModal();
        window.jQuery('#editProfileModal').modal('show');
      }
    });
  }

  const profileMyNotesEditBtn = document.getElementById('profile-my-notes-edit-btn');
  if (profileMyNotesEditBtn && window.jQuery) {
    profileMyNotesEditBtn.addEventListener('click', function(e) {
      e.preventDefault();
      if (cachedProfileFromContactLibrary) {
        openProfileContactLibraryEditModal();
      }
    });
  }

  const editContactDetailsSubmit = document.getElementById('edit-contact-details-submit');
  if (editContactDetailsSubmit) {
    editContactDetailsSubmit.addEventListener('click', function() {
      submitEditContactDetailsForm();
    });
  }

  const editMyNotesModalEl = document.getElementById('editMyNotesModal');
  if (editMyNotesModalEl && window.jQuery) {
    window.jQuery(editMyNotesModalEl).on('show.bs.modal', function() {
      populateEditMyNotesModal();
    });
  }
  const editMyNotesSubmit = document.getElementById('edit-my-notes-submit');
  if (editMyNotesSubmit) {
    editMyNotesSubmit.addEventListener('click', function() {
      submitEditMyNotesForm();
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

  const editEducationModalEl = document.getElementById('editEducationModal');
  if (editEducationModalEl && window.jQuery) {
    window.jQuery(editEducationModalEl).on('show.bs.modal', function() {
      populateEditEducationModal();
    });
  }
  const editEducationSubmit = document.getElementById('edit-education-submit');
  if (editEducationSubmit) {
    editEducationSubmit.addEventListener('click', function() {
      submitEditEducationForm();
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
    const personHandle = await fetchPersonHandleByEmail(userEmail);
    if (!personHandle) return;
    const res = await fetch(
      '/api/groups?person_handle=' + encodeURIComponent(personHandle)
    );
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

/** Same URL shape as `groups_list.js` `groupPageUrlFromHandle` — `/events/group/@handle`. */
function groupPageUrlFromHandle(handleRaw) {
  const h = handleRaw != null ? String(handleRaw).trim() : '';
  if (!h) return '';
  const noAt = h.replace(/^@+/, '');
  if (!noAt) return '';
  return '/events/group/@' + encodeURIComponent(noAt);
}

/**
 * profiles.html: mutual groups — contact's `group_members.person_handle` matches the URL composite key
 * and the viewer is `member` or `admin` in the same group; blind member pills omitted for the viewer.
 */
async function loadContactPageGroupPills(userEmail) {
  const wrap = document.getElementById('contact-my-groups-wrap');
  const pillsContainer = document.getElementById('contact-my-groups-pills');
  if (!userEmail || !wrap || !pillsContainer || !isContactDetailsWorkPage()) return;

  pillsContainer.innerHTML = '';
  wrap.style.display = 'none';

  const compositePh = getContactCompositeHandleForGroups(cachedWorkRow);
  if (!compositePh) return;

  try {
    const entries = await fetchGroupEntriesByPersonHandle(compositePh, userEmail);
    if (!entries || !entries.length) return;

    const sorted = [...entries].sort((a, b) => {
      const na = (a.group_name && String(a.group_name)) || '';
      const nb = (b.group_name && String(b.group_name)) || '';
      return na.localeCompare(nb, undefined, { sensitivity: 'base' });
    });

    for (const group of sorted) {
      const name = group.group_name != null ? String(group.group_name).trim() : '';
      const handleRaw = group.group_handle != null ? String(group.group_handle).trim() : '';
      if (!name || !handleRaw) continue;

      const href = groupPageUrlFromHandle(handleRaw);
      if (!href) continue;

      const a = document.createElement('a');
      a.className = 'contact-my-group-pill mr-1 mb-1 contact-my-group-pill--member';
      a.href = href;
      a.textContent = name;
      a.title = 'Group — ' + name;
      pillsContainer.appendChild(a);
    }

    if (pillsContainer.children.length) wrap.style.display = '';
  } catch (e) {
    console.error('Error loading contact page group pills:', e);
  }
}

/**
 * profiles.html (handle URL): `group_members` rows for profile `person_handle` vs viewer `person_handle`
 * (MEMBER_STATUSES), intersection of `group_handle` values; names from `groups`; pills link to group pages.
 */
async function loadProfilePageMutualGroups(userEmail) {
  const block = document.getElementById('profile-mutual-groups-block');
  const summaryEl = document.getElementById('profile-mutual-groups-summary');
  const wrap = document.getElementById('profile-mutual-groups-wrap');
  const pillsContainer = document.getElementById('profile-mutual-groups-pills');
  if (!userEmail || !block || !summaryEl || !wrap || !pillsContainer) return;

  const urlHandle = getProfileHandleFromUrl();
  const onProfileChrome = !!document.getElementById('profile-display-name');
  if (!onProfileChrome || !urlHandle || isOwnProfile) {
    cachedProfileMutualGroupsPayload = null;
    block.style.display = 'none';
    summaryEl.textContent = 'Mutual Groups: —';
    pillsContainer.innerHTML = '';
    wrap.style.display = 'none';
    return;
  }

  block.style.display = '';
  pillsContainer.innerHTML = '';
  wrap.style.display = 'none';

  try {
    const viewerPh = await fetchPersonHandleByEmail(userEmail);
    if (!viewerPh) {
      cachedProfileMutualGroupsPayload = null;
      summaryEl.textContent = 'Mutual Groups: —';
      return;
    }
    const res = await fetch(
      '/api/groups/profile-mutual?user_id=' +
        encodeURIComponent(userEmail) +
        '&person_handle=' +
        encodeURIComponent(viewerPh) +
        '&profile_person_handle=' +
        encodeURIComponent(urlHandle)
    );
    if (!res.ok) {
      cachedProfileMutualGroupsPayload = null;
      return;
    }
    const payload = await res.json();
    cachedProfileMutualGroupsPayload = payload;
    /** `group_members` rows for URL `person_handle`: `{ group_handle, status }[]` */
    const profile_groups = Array.isArray(payload.profile_groups)
      ? payload.profile_groups
      : [];
    /** `group_handle` values where the logged-in user has status `member` or `admin` */
    const user_groups = Array.isArray(payload.user_groups) ? payload.user_groups : [];
    const mutual_handles = Array.isArray(payload.mutual_handles)
      ? payload.mutual_handles
      : [];
    console.log('[profiles] user_groups (viewer person_handle → member or admin only):', user_groups);
    console.log(
      '[profiles] profile_groups (URL person_handle → all group_handle + status):',
      profile_groups
    );
    console.log(
      '[profiles] mutual group_handles (in both user_groups and profile_groups):',
      mutual_handles
    );

    const sorted = Array.isArray(payload.groups) ? payload.groups : [];
    const seenHandles = new Set();
    const uniqueGroups = [];
    for (const g of sorted) {
      const handleRaw =
        g.group_handle != null ? String(g.group_handle).trim() : '';
      const gh = handleRaw.replace(/^@+/, '').toLowerCase();
      if (!gh || seenHandles.has(gh)) continue;
      seenHandles.add(gh);
      uniqueGroups.push(g);
    }

    if (!uniqueGroups.length) {
      summaryEl.textContent = 'Mutual Groups: —';
      return;
    }

    summaryEl.textContent = 'Mutual Groups:';

    for (const group of uniqueGroups) {
      const name = group.group_name != null ? String(group.group_name).trim() : '';
      const handleRaw =
        group.group_handle != null ? String(group.group_handle).trim() : '';
      if (!name || !handleRaw) continue;

      const href = groupPageUrlFromHandle(handleRaw);
      if (!href) continue;

      const st = group.status != null ? String(group.status).trim().toLowerCase() : '';
      const isBlind = st === 'blind member';

      const a = document.createElement('a');
      a.className =
        'contact-my-group-pill mr-1 mb-1 ' +
        (isBlind ? 'contact-my-group-pill--blind' : 'contact-my-group-pill--member');
      a.href = href;
      a.textContent = name;
      a.title = isBlind ? 'Blind member — ' + name : 'Group — ' + name;
      pillsContainer.appendChild(a);
    }

    if (pillsContainer.children.length) wrap.style.display = '';
  } catch (e) {
    cachedProfileMutualGroupsPayload = null;
    console.error('Error loading profile mutual groups:', e);
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
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || 'Failed to add event');
    }

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

const CONTACT_GROUP_TRASH_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.5V14a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.5l-.118-.5H4.118zM2.5 3V2h11v1h-11z"/></svg>';

async function loadContactGroupsModalContent() {
  const tbody = document.getElementById('contact-groups-modal-tbody');
  const errEl = document.getElementById('contact-groups-modal-error');
  const sel = document.getElementById('contact-groups-add-select');
  const addBtn = document.getElementById('contact-groups-add-btn');
  if (errEl) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }

  const row = cachedWorkRow;
  const ph = getContactCompositeHandleForGroups(row);

  if (!ph) {
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="3" class="text-muted small">Add a public handle to this contact to see and manage group memberships.</td></tr>';
    }
    if (sel) {
      sel.innerHTML = '<option value="">—</option>';
      sel.disabled = true;
    }
    const roleSelNoPh = document.getElementById('contact-groups-add-role');
    if (roleSelNoPh) roleSelNoPh.disabled = true;
    if (addBtn) addBtn.disabled = true;
    return;
  }

  if (!cachedUserEmail) {
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="3" class="text-muted small">Log in to manage groups.</td></tr>';
    }
    if (sel) {
      sel.innerHTML = '<option value="">—</option>';
      sel.disabled = true;
    }
    const roleSelNoUser = document.getElementById('contact-groups-add-role');
    if (roleSelNoUser) roleSelNoUser.disabled = true;
    if (addBtn) addBtn.disabled = true;
    return;
  }

  if (sel) sel.disabled = false;
  const roleSelReady = document.getElementById('contact-groups-add-role');
  if (roleSelReady) {
    roleSelReady.disabled = false;
    roleSelReady.value = 'member';
  }
  if (addBtn) addBtn.disabled = false;
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-muted small">Loading…</td></tr>';
  }

  try {
    const [memRes, manageRes] = await Promise.all([
      fetch(
        '/api/groups/memberships-by-person-handle?user_id=' +
          encodeURIComponent(cachedUserEmail) +
          '&person_handle=' +
          encodeURIComponent(ph)
      ),
      fetch('/api/groups/where-i-manage?user_id=' + encodeURIComponent(cachedUserEmail))
    ]);

    if (!memRes.ok) {
      const t = await memRes.text();
      throw new Error(t || memRes.statusText);
    }
    const memberships = await memRes.json();
    const alreadyIn = new Set((memberships || []).map(m => m.group_name).filter(Boolean));

    if (sel && manageRes.ok) {
      const groups = await manageRes.json();
      sel.innerHTML = '<option value="">Choose a group…</option>';
      (groups || []).forEach(g => {
        const gn = g.group_name != null ? String(g.group_name) : '';
        if (!gn || alreadyIn.has(gn)) return;
        const opt = document.createElement('option');
        opt.value = gn;
        opt.textContent = gn;
        sel.appendChild(opt);
      });
    }

    if (tbody) {
      if (!memberships || memberships.length === 0) {
        tbody.innerHTML =
          '<tr><td colspan="3" class="text-muted small">No group memberships yet.</td></tr>';
      } else {
        tbody.innerHTML = (memberships || [])
          .map(m => {
            const gn = m.group_name != null ? String(m.group_name) : '';
            const st = m.status != null ? String(m.status) : '';
            const can = !!m.can_remove;
            const removeCell = can
              ? '<button type="button" class="btn btn-sm btn-link text-danger p-0 contact-groups-remove-btn" data-group-name="' +
                escapeAttr(gn) +
                '" title="Remove from group" aria-label="Remove from group">' +
                CONTACT_GROUP_TRASH_SVG +
                '</button>'
              : '<span class="text-muted small">—</span>';
            return (
              '<tr><td>' +
              escapeHtml(gn) +
              '</td><td>' +
              escapeHtml(st) +
              '</td><td class="text-center">' +
              removeCell +
              '</td></tr>'
            );
          })
          .join('');
      }
    }
  } catch (err) {
    console.error('loadContactGroupsModalContent:', err);
    if (errEl) {
      errEl.textContent =
        err.message ||
        'Could not load groups. Add column person_handle (text) to group_members if missing.';
      errEl.style.display = 'block';
    }
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-danger small">Failed to load.</td></tr>';
    }
  }
}

function initContactGroupsModal() {
  const modal = document.getElementById('contactGroupsModal');
  const tbody = document.getElementById('contact-groups-modal-tbody');
  const addBtn = document.getElementById('contact-groups-add-btn');
  if (!modal || !window.jQuery) return;

  window.jQuery('#contactGroupsModal').on('show.bs.modal', function() {
    loadContactGroupsModalContent();
  });

  if (tbody) {
    tbody.addEventListener('click', async e => {
      const btn = e.target.closest('.contact-groups-remove-btn');
      if (!btn || !cachedUserEmail) return;
      const groupName = btn.getAttribute('data-group-name');
      const row = cachedWorkRow;
      const ph = getContactCompositeHandleForGroups(row);
      if (!groupName || !ph) return;
      if (!window.confirm('Remove this person from “' + groupName + '”?')) return;
      try {
        const res = await fetch('/api/groups/membership-by-person-handle', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: cachedUserEmail,
            group_name: groupName,
            person_handle: ph
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Remove failed');
        await loadContactGroupsModalContent();
        await refreshContactGroupsSummaryLine(cachedWorkRow);
        if (cachedUserEmail) await loadContactPageGroupPills(cachedUserEmail);
      } catch (err) {
        alert(err.message || 'Could not remove.');
      }
    });
  }

  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      const sel = document.getElementById('contact-groups-add-select');
      const roleSel = document.getElementById('contact-groups-add-role');
      const errEl = document.getElementById('contact-groups-modal-error');
      const groupName = sel && sel.value ? String(sel.value).trim() : '';
      const addAsRaw = roleSel && roleSel.value ? String(roleSel.value).trim() : '';
      const addAs = addAsRaw.toLowerCase();
      const row = cachedWorkRow;
      const ph = getContactCompositeHandleForGroups(row);
      const profileHandle = getContactProfileHandleForInvite(row);
      if (!groupName || !ph || !cachedUserEmail) {
        if (errEl) {
          errEl.textContent = 'Choose a group and ensure this contact has a public handle.';
          errEl.style.display = 'block';
        }
        return;
      }
      if (addAs !== 'member' && addAs !== 'admin') {
        if (errEl) {
          errEl.textContent =
            'Choose Member or Admin to send an invite (saved in group_members with status “invited”).';
          errEl.style.display = 'block';
        }
        return;
      }
      if (errEl) {
        errEl.style.display = 'none';
        errEl.textContent = '';
      }
      addBtn.disabled = true;
      try {
        const res = await fetch('/api/groups/invite-by-person-handle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: cachedUserEmail,
            group_name: groupName,
            person_handle: ph,
            profile_handle: profileHandle || undefined
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not add');
        if (sel) sel.value = '';
        await loadContactGroupsModalContent();
        await refreshContactGroupsSummaryLine(cachedWorkRow);
        if (cachedUserEmail) await loadContactPageGroupPills(cachedUserEmail);
      } catch (err) {
        alert(err.message || 'Could not add to group.');
      } finally {
        addBtn.disabled = false;
      }
    });
  }
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

// ── Work & Education sections (profiles.html: two blocks + modals) ───────────

let cachedWorkRow = null;
let workSectionLoaded = false;

/** Load work / family / interests when the profile or contact page shows those sections (all visible; pills scroll). */
function preloadProfileSubsectionsData() {
  if (!document.getElementById('work-section-content')) return;
  if (!workSectionLoaded) loadWorkSection();
  if (!familySectionLoaded) loadFamilySection();
  if (!interestsSectionLoaded) loadInterestsSection();
}

function showProfileSection(section) {
  const p = isContactDetailsWorkPage() ? 'contact' : 'profile';
  const idMap = {
    notes: p + '-section-notes',
    'contact-details': p + '-section-contact-details',
    work: p + '-section-work',
    education: p + '-section-education',
    family: p + '-section-family',
    interests: p + '-section-interests'
  };
  const target = document.getElementById(idMap[section] || idMap.notes);
  if (target && typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (
    (section === 'work' || section === 'education') &&
    !workSectionLoaded
  ) {
    loadWorkSection();
  }
  if (section === 'family'    && !familySectionLoaded) loadFamilySection();
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
  const emptyMsg = isContactDetailsWorkPage()
    ? '<p class="text-muted small">No matching row in <code>contact_details</code> for this owner handle and contact name.</p>'
    : '<p class="text-muted small">No work info yet. Click the pencil to add.</p>';
  if (!row) {
    contentEl.innerHTML = emptyMsg;
    return;
  }
  let html = '';

  const jobs = [
    workEntryHtml(row.current_company, row.current_title, row.current_start_date, row.current_end_date, true),
    ...[1,2,3,4,5,6,7].map(i =>
      workEntryHtml(row['company'+i], row['title'+i], row['start_date'+i], row['end_date'+i], false))
  ].join('');
  if (jobs) {
    html += jobs;
  }

  const bottomEmpty = isContactDetailsWorkPage()
    ? '<p class="text-muted small">No work entries on this contact record.</p>'
    : '<p class="text-muted small">No work info yet. Click the pencil to add.</p>';
  contentEl.innerHTML = html || bottomEmpty;
}

/** Education block; data from same row as work (`contact_library` / `contact_details`). */
function renderEducationSection(row) {
  const contentEl = document.getElementById('education-section-content');
  if (!contentEl) return;
  const emptyNoRow = isContactDetailsWorkPage()
    ? '<p class="text-muted small">No matching row in <code>contact_details</code> for this owner handle and contact name.</p>'
    : '<p class="text-muted small">No education info yet. Click the pencil to add.</p>';
  const emptyNoEntries = isContactDetailsWorkPage()
    ? '<p class="text-muted small">No education entries on this contact record.</p>'
    : '<p class="text-muted small">No education info yet. Click the pencil to add.</p>';
  if (!row) {
    contentEl.innerHTML = emptyNoRow;
    return;
  }
  const edu = [1, 2, 3, 4]
    .map(i =>
      eduEntryHtml(
        row['education' + i],
        row['major' + i],
        row['start_date_edu' + i],
        row['end_date_edu' + i]
      )
    )
    .join('');
  contentEl.innerHTML = edu || emptyNoEntries;
}

/** My Private Notes (`contact_details.my_notes`) on profiles.html only. */
function renderMyNotesSection(row) {
  const contentEl = document.getElementById('my-notes-section-content');
  if (!contentEl) return;
  if (!isContactDetailsWorkPage()) return;
  const emptyNoRow =
    '<p class="text-muted small">No matching row in <code>contact_details</code> for this owner handle and contact name.</p>';
  const emptyNoText = '<p class="text-muted small">No private notes yet. Click the pencil to add.</p>';
  if (!row) {
    contentEl.innerHTML = emptyNoRow;
    return;
  }
  const raw = row.my_notes != null ? String(row.my_notes) : '';
  if (!String(raw).trim()) {
    contentEl.innerHTML = emptyNoText;
    return;
  }
  contentEl.innerHTML =
    '<div class="small text-body" style="white-space:pre-wrap;word-break:break-word;">' +
    escapeHtml(raw) +
    '</div>';
}

async function loadWorkSection() {
  const loadingEl = document.getElementById('work-section-loading');
  const eduLoadingEl = document.getElementById('education-section-loading');
  const errorEl   = document.getElementById('work-section-error');
  const contentEl = document.getElementById('work-section-content');
  const eduContentEl = document.getElementById('education-section-content');
  const myNotesContentEl = document.getElementById('my-notes-section-content');

  if (
    !isContactDetailsWorkPage() &&
    cachedProfileFromContactLibrary &&
    cachedWorkRow
  ) {
    try {
      if (loadingEl) loadingEl.style.display = '';
      if (eduLoadingEl) eduLoadingEl.style.display = '';
      if (errorEl) errorEl.style.display = 'none';
      cachedFamilyRow = cachedWorkRow;
      cachedInterestsRow = cachedWorkRow;
      renderWorkSection(cachedWorkRow);
      renderEducationSection(cachedWorkRow);
      renderMyNotesSection(cachedWorkRow);
    } catch (err) {
      console.error('Error loading work section (contact_library):', err);
      if (errorEl) {
        errorEl.textContent = 'Failed to load work data.';
        errorEl.style.display = '';
      }
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
      if (eduLoadingEl) eduLoadingEl.style.display = 'none';
      workSectionLoaded = true;
    }
    return;
  }

  const ownersHandle = cachedProfileRow && cachedProfileRow.handle
    ? String(cachedProfileRow.handle).trim().replace(/^@+/, '')
    : '';

  if (!ownersHandle) {
    if (contentEl) {
      contentEl.innerHTML = '<p class="text-muted small">No handle set — save your profile first.</p>';
    }
    if (eduContentEl) {
      eduContentEl.innerHTML =
        '<p class="text-muted small">No handle set — save your profile first.</p>';
    }
    if (myNotesContentEl) {
      myNotesContentEl.innerHTML =
        '<p class="text-muted small">No handle set — save your profile first.</p>';
    }
    workSectionLoaded = true;
    return;
  }

  if (isContactDetailsWorkPage()) {
    if (!hasContactDetailsPageLookup()) {
      if (contentEl) {
        contentEl.innerHTML =
          '<p class="text-muted small">Open a contact from your list, or use <code>/events/contact/</code><em>yourhandle</em><code>_</code><em>contactnameslug</em> (same key as contact photos), e.g. <code>/events/contact/johnpicasso_meganpicasso</code>. Legacy: <code>?contact_name=…</code>.</p>';
      }
      if (eduContentEl) {
        eduContentEl.innerHTML =
          '<p class="text-muted small">Add a contact path or <code>contact_name</code> to the URL to load education from <code>contact_details</code>.</p>';
      }
      if (myNotesContentEl) {
        myNotesContentEl.innerHTML =
          '<p class="text-muted small">Add a contact path or <code>contact_name</code> to the URL to load notes from <code>contact_details</code>.</p>';
      }
      workSectionLoaded = true;
      return;
    }

    if (cachedWorkRow) {
      cachedFamilyRow = cachedWorkRow;
      cachedInterestsRow = cachedWorkRow;
      try {
        if (loadingEl) loadingEl.style.display = '';
        if (eduLoadingEl) eduLoadingEl.style.display = '';
        if (errorEl) errorEl.style.display = 'none';
        renderWorkSection(cachedWorkRow);
        renderEducationSection(cachedWorkRow);
        renderMyNotesSection(cachedWorkRow);
      } catch (err) {
        console.error('Error loading work section (contact_details):', err);
        if (errorEl) {
          errorEl.textContent = 'Failed to load work data.';
          errorEl.style.display = '';
        }
        if (eduContentEl) {
          eduContentEl.innerHTML =
            '<p class="text-muted small">Failed to load education data.</p>';
        }
        if (myNotesContentEl) {
          myNotesContentEl.innerHTML =
            '<p class="text-muted small">Failed to load notes.</p>';
        }
      } finally {
        if (loadingEl) loadingEl.style.display = 'none';
        if (eduLoadingEl) eduLoadingEl.style.display = 'none';
        workSectionLoaded = true;
      }
      return;
    }

    try {
      if (loadingEl) loadingEl.style.display = '';
      if (eduLoadingEl) eduLoadingEl.style.display = '';
      if (errorEl)   errorEl.style.display   = 'none';

      const workFetchUrl = buildContactDetailsWorkApiUrl(ownersHandle);
      if (!workFetchUrl) throw new Error('Missing contact lookup');
      const res = await fetch(workFetchUrl);
      if (!res.ok) throw new Error('Server error ' + res.status);
      const row = await res.json();
      cachedWorkRow = row;
      cachedFamilyRow = row;
      cachedInterestsRow = row;
      renderWorkSection(row);
      renderEducationSection(row);
      renderMyNotesSection(row);
    } catch (err) {
      console.error('Error loading work section (contact_details):', err);
      if (errorEl) { errorEl.textContent = 'Failed to load work data.'; errorEl.style.display = ''; }
      if (eduContentEl) {
        eduContentEl.innerHTML =
          '<p class="text-muted small">Failed to load education data.</p>';
      }
      if (myNotesContentEl) {
        myNotesContentEl.innerHTML =
          '<p class="text-muted small">Failed to load notes.</p>';
      }
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
      if (eduLoadingEl) eduLoadingEl.style.display = 'none';
      workSectionLoaded = true;
    }
    return;
  }

  try {
    if (loadingEl) loadingEl.style.display = '';
    if (eduLoadingEl) eduLoadingEl.style.display = '';
    if (errorEl)   errorEl.style.display   = 'none';

    const res = await fetch('/api/profile/work?handle=' + encodeURIComponent(ownersHandle));
    if (!res.ok) throw new Error('Server error ' + res.status);
    const row = await res.json();
    cachedWorkRow = row;
    renderWorkSection(row);
    renderEducationSection(row);
  } catch (err) {
    console.error('Error loading work section:', err);
    if (errorEl) { errorEl.textContent = 'Failed to load work data.'; errorEl.style.display = ''; }
    if (eduContentEl) {
      eduContentEl.innerHTML =
        '<p class="text-muted small">Failed to load education data.</p>';
    }
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
    if (eduLoadingEl) eduLoadingEl.style.display = 'none';
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
    'company7','title7','start_date7','end_date7'
  ];
  fields.forEach(key => {
    const el = document.getElementById('ew-' + key);
    if (el) el.value = row[key] != null ? String(row[key]) : '';
  });
  const errEl = document.getElementById('edit-work-error');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
}

function populateEditEducationModal() {
  const row = cachedWorkRow || {};
  const fields = [
    'education1','major1','start_date_edu1','end_date_edu1',
    'education2','major2','start_date_edu2','end_date_edu2',
    'education3','major3','start_date_edu3','end_date_edu3',
    'education4','major4','start_date_edu4','end_date_edu4'
  ];
  fields.forEach(key => {
    const el = document.getElementById('ee-' + key);
    if (el) el.value = row[key] != null ? String(row[key]) : '';
  });
  const errEl = document.getElementById('edit-education-error');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
}

function buildContactDetailsRequestBody(patch) {
  const ownersHandle =
    cachedProfileRow && cachedProfileRow.handle
      ? String(cachedProfileRow.handle).trim().replace(/^@+/, '')
      : '';
  const lookup = getContactNameForContactDetailsPage();
  return {
    user_id: cachedUserEmail,
    owners_handle: ownersHandle,
    lookup_contact_name: lookup,
    ...patch
  };
}

async function applySavedContactDetailsRow(data) {
  if (!data) return;
  const newCn =
    data.contact_name != null && String(data.contact_name).trim() !== ''
      ? String(data.contact_name).trim()
      : '';
  const prevLookup = getContactNameForContactDetailsPage();
  if (newCn && newCn !== prevLookup) {
    const oh =
      cachedProfileRow && cachedProfileRow.handle
        ? String(cachedProfileRow.handle).trim().replace(/^@+/, '').toLowerCase()
        : '';
    const slug = contactDisplayNameToUrlSlug(newCn);
    if (oh && slug) {
      const url = new URL(window.location.href);
      url.pathname = '/events/contact/' + encodeURIComponent(oh + '_' + slug);
      url.search = '';
      window.history.replaceState({}, '', url);
    } else {
      const u = new URL(window.location.href);
      u.searchParams.set('contact_name', newCn);
      window.history.replaceState({}, '', u);
    }
    const hid = document.getElementById('contact-page-contact-name');
    if (hid) hid.value = newCn;
  }
  await applyContactDetailsPageHeader(cachedAuthUser, cachedProfileRow);
  renderWorkSection(cachedWorkRow);
  renderEducationSection(cachedWorkRow);
  renderMyNotesSection(cachedWorkRow);
  renderFamilySection(cachedFamilyRow);
  renderInterestsSection(cachedInterestsRow);
}

function populateEditContactDetailsModal() {
  const row = cachedWorkRow || {};
  const pairs = [
    ['cd-contact_name', 'contact_name'],
    ['cd-contact_handle', 'contact_handle'],
    ['cd-cell', 'cell'],
    ['cd-other_phone', 'other_phone'],
    ['cd-work_email', 'work_email'],
    ['cd-personal_email', 'personal_email']
  ];
  pairs.forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.value = row[key] != null ? String(row[key]) : '';
  });
  const errEl = document.getElementById('edit-contact-details-error');
  if (errEl) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }
}

function populateEditMyNotesModal() {
  const row = cachedWorkRow || {};
  const ta = document.getElementById('emn-my_notes');
  if (ta) ta.value = row.my_notes != null ? String(row.my_notes) : '';
  const errEl = document.getElementById('edit-my-notes-error');
  if (errEl) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }
}

async function submitEditMyNotesForm() {
  const errEl = document.getElementById('edit-my-notes-error');
  const submitBtn = document.getElementById('edit-my-notes-submit');
  if (!cachedUserEmail || !submitBtn) return;
  if (!isContactDetailsWorkPage()) return;

  const ownersHandle =
    cachedProfileRow && cachedProfileRow.handle
      ? String(cachedProfileRow.handle).trim().replace(/^@+/, '')
      : '';
  const lookup = getContactNameForContactDetailsPage();
  if (!ownersHandle || !lookup) {
    if (errEl) {
      errEl.textContent = 'Owner handle and contact name are required.';
      errEl.style.display = 'block';
    }
    return;
  }

  const ta = document.getElementById('emn-my_notes');
  const my_notes = ta ? ta.value.trim() || null : null;

  if (errEl) errEl.style.display = 'none';
  try {
    submitBtn.disabled = true;
    const res = await fetch('/api/contact-details', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildContactDetailsRequestBody({ my_notes }))
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to save');
    await applySavedContactDetailsRow(data);
    if (window.jQuery) window.jQuery('#editMyNotesModal').modal('hide');
  } catch (err) {
    console.error('Error saving private notes:', err);
    if (errEl) {
      errEl.textContent = err.message || 'Failed to save.';
      errEl.style.display = 'block';
    }
  } finally {
    submitBtn.disabled = false;
  }
}

async function submitEditContactDetailsForm() {
  const errEl = document.getElementById('edit-contact-details-error');
  const submitBtn = document.getElementById('edit-contact-details-submit');
  if (!cachedUserEmail || !submitBtn) return;
  if (!isContactDetailsWorkPage()) return;

  const ownersHandle =
    cachedProfileRow && cachedProfileRow.handle
      ? String(cachedProfileRow.handle).trim().replace(/^@+/, '')
      : '';
  const lookup = getContactNameForContactDetailsPage();
  if (!ownersHandle || !lookup) {
    if (errEl) {
      errEl.textContent = 'Owner handle and contact name are required.';
      errEl.style.display = 'block';
    }
    return;
  }

  const nameInput = document.getElementById('cd-contact_name');
  const n = nameInput ? String(nameInput.value).trim() : '';
  if (!n) {
    if (errEl) {
      errEl.textContent = 'Display name is required.';
      errEl.style.display = 'block';
    }
    return;
  }

  function fieldOrNull(id) {
    const el = document.getElementById(id);
    const v = el ? el.value.trim() : '';
    return v || null;
  }

  const patch = {
    contact_name: n,
    contact_handle: fieldOrNull('cd-contact_handle'),
    cell: fieldOrNull('cd-cell'),
    other_phone: fieldOrNull('cd-other_phone'),
    work_email: fieldOrNull('cd-work_email'),
    personal_email: fieldOrNull('cd-personal_email')
  };

  if (errEl) errEl.style.display = 'none';
  try {
    submitBtn.disabled = true;
    const res = await fetch('/api/contact-details', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildContactDetailsRequestBody(patch))
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to save');
    await applySavedContactDetailsRow(data);
    if (window.jQuery) window.jQuery('#editContactDetailsModal').modal('hide');
  } catch (err) {
    console.error('Error saving contact details:', err);
    if (errEl) {
      errEl.textContent = err.message || 'Failed to save.';
      errEl.style.display = 'block';
    }
  } finally {
    submitBtn.disabled = false;
  }
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
    'company7','title7','start_date7','end_date7'
  ];
  const workFields = {};
  keys.forEach(key => {
    const el = document.getElementById('ew-' + key);
    workFields[key] = el ? el.value.trim() || null : null;
  });

  if (errEl) errEl.style.display = 'none';
  try {
    submitBtn.disabled = true;
    if (isContactDetailsWorkPage()) {
      const ownersHandle =
        cachedProfileRow && cachedProfileRow.handle
          ? String(cachedProfileRow.handle).trim().replace(/^@+/, '')
          : '';
      const lookup = getContactNameForContactDetailsPage();
      if (!ownersHandle || !lookup) {
        throw new Error('Owner handle and contact name are required.');
      }
      const res = await fetch('/api/contact-details', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildContactDetailsRequestBody(workFields))
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      await applySavedContactDetailsRow(data);
      if (window.jQuery) window.jQuery('#editWorkModal').modal('hide');
    } else if (
      cachedProfileFromContactLibrary &&
      canEditOwnedContactLibrary &&
      !isOwnProfile &&
      getProfileHandleFromUrl()
    ) {
      const res = await fetch('/api/contact-library/row', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: cachedUserEmail,
          person_handle: getProfileHandleFromUrl(),
          patch: workFields
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      const shaped = shapeContactLibraryProfileRow(data);
      cachedWorkRow = shaped;
      cachedProfileRow = shaped;
      cachedFamilyRow = shaped;
      cachedInterestsRow = shaped;
      workSectionLoaded = false;
      renderWorkSection(shaped);
      renderEducationSection(shaped);
      if (window.jQuery) window.jQuery('#editWorkModal').modal('hide');
    } else {
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
      renderEducationSection(data);
      if (window.jQuery) window.jQuery('#editWorkModal').modal('hide');
    }
  } catch (err) {
    console.error('Error saving work:', err);
    if (errEl) { errEl.textContent = err.message || 'Failed to save.'; errEl.style.display = ''; }
  } finally {
    submitBtn.disabled = false;
  }
}

async function submitEditEducationForm() {
  const errEl     = document.getElementById('edit-education-error');
  const submitBtn = document.getElementById('edit-education-submit');
  if (!cachedUserEmail || !submitBtn) return;

  const keys = [
    'education1','major1','start_date_edu1','end_date_edu1',
    'education2','major2','start_date_edu2','end_date_edu2',
    'education3','major3','start_date_edu3','end_date_edu3',
    'education4','major4','start_date_edu4','end_date_edu4'
  ];
  const eduFields = {};
  keys.forEach(key => {
    const el = document.getElementById('ee-' + key);
    eduFields[key] = el ? el.value.trim() || null : null;
  });

  if (errEl) errEl.style.display = 'none';
  try {
    submitBtn.disabled = true;
    if (isContactDetailsWorkPage()) {
      const ownersHandle =
        cachedProfileRow && cachedProfileRow.handle
          ? String(cachedProfileRow.handle).trim().replace(/^@+/, '')
          : '';
      const lookup = getContactNameForContactDetailsPage();
      if (!ownersHandle || !lookup) {
        throw new Error('Owner handle and contact name are required.');
      }
      const res = await fetch('/api/contact-details', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildContactDetailsRequestBody(eduFields))
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      await applySavedContactDetailsRow(data);
      if (window.jQuery) window.jQuery('#editEducationModal').modal('hide');
    } else if (
      cachedProfileFromContactLibrary &&
      canEditOwnedContactLibrary &&
      !isOwnProfile &&
      getProfileHandleFromUrl()
    ) {
      const res = await fetch('/api/contact-library/row', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: cachedUserEmail,
          person_handle: getProfileHandleFromUrl(),
          patch: eduFields
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      const shaped = shapeContactLibraryProfileRow(data);
      cachedWorkRow = shaped;
      cachedProfileRow = shaped;
      cachedFamilyRow = shaped;
      cachedInterestsRow = shaped;
      workSectionLoaded = false;
      renderWorkSection(shaped);
      renderEducationSection(shaped);
      if (window.jQuery) window.jQuery('#editEducationModal').modal('hide');
    } else {
      const res = await fetch('/api/profile/work', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: cachedUserEmail, ...eduFields })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      cachedWorkRow = data;
      workSectionLoaded = false;
      renderWorkSection(data);
      renderEducationSection(data);
      if (window.jQuery) window.jQuery('#editEducationModal').modal('hide');
    }
  } catch (err) {
    console.error('Error saving education:', err);
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
  const emptyNoRow = isContactDetailsWorkPage()
    ? '<p class="text-muted small">No family info in <code>contact_details</code> for this contact.</p>'
    : '<p class="text-muted small">No family info yet. Click the pencil to add.</p>';
  if (!row) {
    contentEl.innerHTML = emptyNoRow;
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

  const emptyNoEntries = isContactDetailsWorkPage()
    ? '<p class="text-muted small">No family entries on this contact record.</p>'
    : '<p class="text-muted small">No family info yet. Click the pencil to add.</p>';
  contentEl.innerHTML = html || emptyNoEntries;
}

async function loadFamilySection() {
  const loadingEl = document.getElementById('family-section-loading');
  const errorEl   = document.getElementById('family-section-error');
  const contentEl = document.getElementById('family-section-content');

  if (
    !isContactDetailsWorkPage() &&
    cachedProfileFromContactLibrary &&
    cachedWorkRow
  ) {
    try {
      if (loadingEl) loadingEl.style.display = '';
      if (errorEl) errorEl.style.display = 'none';
      cachedFamilyRow = cachedWorkRow;
      renderFamilySection(cachedWorkRow);
    } catch (err) {
      console.error('Error loading family section (contact_library):', err);
      if (errorEl) {
        errorEl.textContent = 'Failed to load family data.';
        errorEl.style.display = '';
      }
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
      familySectionLoaded = true;
    }
    return;
  }

  const ownersHandle = cachedProfileRow && cachedProfileRow.handle
    ? String(cachedProfileRow.handle).trim().replace(/^@+/, '')
    : '';

  if (!ownersHandle) {
    if (contentEl) {
      contentEl.innerHTML = '<p class="text-muted small">No handle set — save your profile first.</p>';
    }
    familySectionLoaded = true;
    return;
  }

  if (isContactDetailsWorkPage()) {
    if (!hasContactDetailsPageLookup()) {
      if (contentEl) {
        contentEl.innerHTML =
          '<p class="text-muted small">Add a contact path or <code>contact_name</code> to the URL to load family from <code>contact_details</code>.</p>';
      }
      familySectionLoaded = true;
      return;
    }

    if (cachedWorkRow) {
      cachedFamilyRow = cachedWorkRow;
      cachedInterestsRow = cachedWorkRow;
      try {
        if (loadingEl) loadingEl.style.display = '';
        if (errorEl) errorEl.style.display = 'none';
        renderFamilySection(cachedWorkRow);
      } catch (err) {
        console.error('Error loading family section (contact_details):', err);
        if (errorEl) {
          errorEl.textContent = 'Failed to load family data.';
          errorEl.style.display = '';
        }
      } finally {
        if (loadingEl) loadingEl.style.display = 'none';
        familySectionLoaded = true;
      }
      return;
    }

    try {
      if (loadingEl) loadingEl.style.display = '';
      if (errorEl) errorEl.style.display = 'none';

      const workFetchUrl = buildContactDetailsWorkApiUrl(ownersHandle);
      if (!workFetchUrl) throw new Error('Missing contact lookup');
      const res = await fetch(workFetchUrl);
      if (!res.ok) throw new Error('Server error ' + res.status);
      const row = await res.json();
      cachedWorkRow = row;
      cachedFamilyRow = row;
      cachedInterestsRow = row;
      renderFamilySection(row);
    } catch (err) {
      console.error('Error loading family section (contact_details):', err);
      if (errorEl) {
        errorEl.textContent = 'Failed to load family data.';
        errorEl.style.display = '';
      }
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
      familySectionLoaded = true;
    }
    return;
  }

  try {
    if (loadingEl) loadingEl.style.display = '';
    if (errorEl) errorEl.style.display = 'none';

    const res = await fetch('/api/profile/family?handle=' + encodeURIComponent(ownersHandle));
    if (!res.ok) throw new Error('Server error ' + res.status);
    const row = await res.json();
    cachedFamilyRow = row;
    renderFamilySection(row);
  } catch (err) {
    console.error('Error loading family section:', err);
    if (errorEl) {
      errorEl.textContent = 'Failed to load family data.';
      errorEl.style.display = '';
    }
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
    if (isContactDetailsWorkPage()) {
      const ownersHandle =
        cachedProfileRow && cachedProfileRow.handle
          ? String(cachedProfileRow.handle).trim().replace(/^@+/, '')
          : '';
      const lookup = getContactNameForContactDetailsPage();
      if (!ownersHandle || !lookup) {
        throw new Error('Owner handle and contact name are required.');
      }
      const res = await fetch('/api/contact-details', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildContactDetailsRequestBody(familyFields))
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      await applySavedContactDetailsRow(data);
      if (window.jQuery) window.jQuery('#editFamilyModal').modal('hide');
    } else if (
      cachedProfileFromContactLibrary &&
      canEditOwnedContactLibrary &&
      !isOwnProfile &&
      getProfileHandleFromUrl()
    ) {
      const res = await fetch('/api/contact-library/row', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: cachedUserEmail,
          person_handle: getProfileHandleFromUrl(),
          patch: familyFields
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      const shaped = shapeContactLibraryProfileRow(data);
      cachedFamilyRow = shaped;
      cachedProfileRow = shaped;
      cachedWorkRow = shaped;
      cachedInterestsRow = shaped;
      familySectionLoaded = false;
      renderFamilySection(shaped);
      if (window.jQuery) window.jQuery('#editFamilyModal').modal('hide');
    } else {
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
    }
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
  const emptyNoRow = isContactDetailsWorkPage()
    ? '<p class="text-muted small">No interests in <code>contact_details</code> for this contact.</p>'
    : '<p class="text-muted small">No interests yet. Click the pencil to add.</p>';
  if (!row) {
    contentEl.innerHTML = emptyNoRow;
    return;
  }

  let html = '';
  for (let i = 1; i <= 5; i++) {
    const val = row['interest' + i];
    if (!val) continue;
    html += '<div class="small mb-1">' + escapeHtml(val) + '</div>';
  }

  const emptyNoEntries = isContactDetailsWorkPage()
    ? '<p class="text-muted small">No interests on this contact record.</p>'
    : '<p class="text-muted small">No interests yet. Click the pencil to add.</p>';
  contentEl.innerHTML = html || emptyNoEntries;
}

async function loadInterestsSection() {
  const loadingEl = document.getElementById('interests-section-loading');
  const errorEl   = document.getElementById('interests-section-error');
  const contentEl = document.getElementById('interests-section-content');

  if (
    !isContactDetailsWorkPage() &&
    cachedProfileFromContactLibrary &&
    cachedWorkRow
  ) {
    try {
      if (loadingEl) loadingEl.style.display = '';
      if (errorEl) errorEl.style.display = 'none';
      cachedInterestsRow = cachedWorkRow;
      renderInterestsSection(cachedWorkRow);
    } catch (err) {
      console.error('Error loading interests section (contact_library):', err);
      if (errorEl) {
        errorEl.textContent = 'Failed to load interests.';
        errorEl.style.display = '';
      }
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
      interestsSectionLoaded = true;
    }
    return;
  }

  const ownersHandle = cachedProfileRow && cachedProfileRow.handle
    ? String(cachedProfileRow.handle).trim().replace(/^@+/, '')
    : '';

  if (!ownersHandle) {
    if (contentEl) {
      contentEl.innerHTML = '<p class="text-muted small">No handle set — save your profile first.</p>';
    }
    interestsSectionLoaded = true;
    return;
  }

  if (isContactDetailsWorkPage()) {
    if (!hasContactDetailsPageLookup()) {
      if (contentEl) {
        contentEl.innerHTML =
          '<p class="text-muted small">Add a contact path or <code>contact_name</code> to the URL to load interests from <code>contact_details</code>.</p>';
      }
      interestsSectionLoaded = true;
      return;
    }

    if (cachedWorkRow) {
      cachedInterestsRow = cachedWorkRow;
      try {
        if (loadingEl) loadingEl.style.display = '';
        if (errorEl) errorEl.style.display = 'none';
        renderInterestsSection(cachedWorkRow);
      } catch (err) {
        console.error('Error loading interests section (contact_details):', err);
        if (errorEl) {
          errorEl.textContent = 'Failed to load interests.';
          errorEl.style.display = '';
        }
      } finally {
        if (loadingEl) loadingEl.style.display = 'none';
        interestsSectionLoaded = true;
      }
      return;
    }

    try {
      if (loadingEl) loadingEl.style.display = '';
      if (errorEl) errorEl.style.display = 'none';

      const workFetchUrl = buildContactDetailsWorkApiUrl(ownersHandle);
      if (!workFetchUrl) throw new Error('Missing contact lookup');
      const res = await fetch(workFetchUrl);
      if (!res.ok) throw new Error('Server error ' + res.status);
      const row = await res.json();
      cachedWorkRow = row;
      cachedFamilyRow = row;
      cachedInterestsRow = row;
      renderInterestsSection(row);
    } catch (err) {
      console.error('Error loading interests section (contact_details):', err);
      if (errorEl) {
        errorEl.textContent = 'Failed to load interests.';
        errorEl.style.display = '';
      }
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
      interestsSectionLoaded = true;
    }
    return;
  }

  try {
    if (loadingEl) loadingEl.style.display = '';
    if (errorEl) errorEl.style.display = 'none';

    const res = await fetch('/api/profile/interests?handle=' + encodeURIComponent(ownersHandle));
    if (!res.ok) throw new Error('Server error ' + res.status);
    const row = await res.json();
    cachedInterestsRow = row;
    renderInterestsSection(row);
  } catch (err) {
    console.error('Error loading interests:', err);
    if (errorEl) {
      errorEl.textContent = 'Failed to load interests.';
      errorEl.style.display = '';
    }
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
    if (isContactDetailsWorkPage()) {
      const ownersHandle =
        cachedProfileRow && cachedProfileRow.handle
          ? String(cachedProfileRow.handle).trim().replace(/^@+/, '')
          : '';
      const lookup = getContactNameForContactDetailsPage();
      if (!ownersHandle || !lookup) {
        throw new Error('Owner handle and contact name are required.');
      }
      const res = await fetch('/api/contact-details', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildContactDetailsRequestBody(interestFields))
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      await applySavedContactDetailsRow(data);
      if (window.jQuery) window.jQuery('#editInterestsModal').modal('hide');
    } else if (
      cachedProfileFromContactLibrary &&
      canEditOwnedContactLibrary &&
      !isOwnProfile &&
      getProfileHandleFromUrl()
    ) {
      const res = await fetch('/api/contact-library/row', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: cachedUserEmail,
          person_handle: getProfileHandleFromUrl(),
          patch: interestFields
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      const shaped = shapeContactLibraryProfileRow(data);
      cachedInterestsRow = shaped;
      cachedProfileRow = shaped;
      cachedWorkRow = shaped;
      cachedFamilyRow = shaped;
      interestsSectionLoaded = false;
      renderInterestsSection(shaped);
      if (window.jQuery) window.jQuery('#editInterestsModal').modal('hide');
    } else {
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
    }
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
      if (e.target.closest('.profiles-events-who-avatar-link')) return;
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
  initContactGroupsModal();
});
