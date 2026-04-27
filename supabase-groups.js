/**
 * Groups (Supabase).
 *
 * Flow for /events/groups_list.html:
 *   1. Client resolves viewer email -> person_handle via /api/person-handle
 *   2. GET /api/groups?person_handle=<viewer> -> listGroupsForViewerPersonHandle
 *      - group_members: where person_handle matches viewer and status in ('admin','member')
 *      - groups:        join on group_handle to fetch group_name (+ group_handle, visibility)
 *
 * Tables:
 *   public.group_members(group_handle text, person_handle text, status text, ...)
 *   public.groups(group_name text, group_handle text, visibility text, ...)
 */

const supabaseProfiles = require('./supabase-profiles');

let client = null;

function isConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getClient() {
  if (client) return client;
  if (!isConfigured()) return null;
  const { createClient } = require('@supabase/supabase-js');
  client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return client;
}

/** Strip leading @ and lowercase to match stored handles. */
function normalizePersonHandle(s) {
  return s != null ? String(s).trim().replace(/^@+/, '').toLowerCase() : '';
}

function normalizeGroupHandle(s) {
  return s != null ? String(s).trim().replace(/^@+/, '').toLowerCase() : '';
}

function isAdminStatus(status) {
  return String(status || '')
    .trim()
    .toLowerCase() === 'admin';
}

/**
 * For each group row, load admins from `group_members` and attach `admin_profiles` for the groups list UI.
 * @param {Array<{ group_name: string, group_handle: string, visibility: string }>} rows
 */
async function attachAdminProfilesToGroupRows(rows) {
  if (!rows || !rows.length) return;
  const supabase = getClient();
  if (!supabase) return;

  const groupHandles = [
    ...new Set(rows.map(r => normalizeGroupHandle(r.group_handle)).filter(Boolean))
  ];
  if (!groupHandles.length) return;

  const { data: memberRows, error } = await supabase
    .from('group_members')
    .select('group_handle, person_handle, status')
    .in('group_handle', groupHandles);
  if (error) throw error;

  /** @type {Map<string, string[]>} normalized group_handle -> person_handle[] */
  const adminsByGroup = new Map();
  for (const r of memberRows || []) {
    if (!isAdminStatus(r.status)) continue;
    const gh = normalizeGroupHandle(r.group_handle);
    const ph = normalizePersonHandle(r.person_handle);
    if (!gh || !ph) continue;
    if (!adminsByGroup.has(gh)) adminsByGroup.set(gh, []);
    adminsByGroup.get(gh).push(ph);
  }
  for (const [gh, list] of adminsByGroup) {
    adminsByGroup.set(gh, [...new Set(list)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
  }

  const allAdminPh = [...new Set([].concat(...[...adminsByGroup.values()]))];
  /** @type {Map<string, { name: string|null, handle: string, email: string|null, photo_url: string|null }>} */
  const profileByPh = new Map();
  if (allAdminPh.length && supabaseProfiles.isConfigured()) {
    await Promise.all(
      allAdminPh.map(async ph => {
        try {
          const profile = await supabaseProfiles.getProfileByHandle(ph);
          const photo_url = await supabaseProfiles.getProfilePhotoUrl(ph);
          const nameRaw = profile && profile.name != null ? String(profile.name).trim() : '';
          const handle = profile && profile.handle != null ? String(profile.handle).trim() : ph;
          const email =
            profile && profile.email != null ? String(profile.email).trim().toLowerCase() : null;
          profileByPh.set(ph, {
            name: nameRaw || ph,
            handle: handle || ph,
            email,
            photo_url: photo_url || null
          });
        } catch (_) {
          profileByPh.set(ph, {
            name: ph,
            handle: ph,
            email: null,
            photo_url: null
          });
        }
      })
    );
  } else {
    for (const ph of allAdminPh) {
      profileByPh.set(ph, {
        name: ph,
        handle: ph,
        email: null,
        photo_url: null
      });
    }
  }

  for (const row of rows) {
    const gh = normalizeGroupHandle(row.group_handle);
    const phList = gh ? adminsByGroup.get(gh) || [] : [];
    row.admin_profiles = phList.map(ph => {
      const p = profileByPh.get(ph);
      if (p) {
        return {
          name: p.name,
          handle: p.handle,
          email: p.email,
          photo_url: p.photo_url
        };
      }
      return { name: ph, handle: ph, email: null, photo_url: null };
    });
  }
}

/**
 * Groups the viewer (by person_handle) belongs to as admin or member.
 * @param {string} personHandle Viewer's profile handle (no @, lowercased is fine)
 * @returns {Promise<Array<{ group_name: string, group_handle: string, visibility: string, admin_profiles?: object[] }>>}
 */
async function listGroupsForViewerPersonHandle(personHandle) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');

  const ph = normalizePersonHandle(personHandle);
  if (!ph) return [];

  const { data: memberRows, error: gmErr } = await supabase
    .from('group_members')
    .select('group_handle, status')
    .ilike('person_handle', ph)
    .in('status', ['admin', 'member']);
  if (gmErr) throw gmErr;

  const handles = [
    ...new Set(
      (memberRows || [])
        .map(r => normalizeGroupHandle(r && r.group_handle))
        .filter(Boolean)
    )
  ];
  if (!handles.length) return [];

  const { data: groupRows, error: gErr } = await supabase
    .from('groups')
    .select('group_name, group_handle, visibility')
    .in('group_handle', handles);
  if (gErr) throw gErr;

  const byHandle = new Map();
  for (const g of groupRows || []) {
    const gh = normalizeGroupHandle(g && g.group_handle);
    if (gh) byHandle.set(gh, g);
  }

  const out = [];
  for (const h of handles) {
    const g = byHandle.get(h);
    if (!g) continue;
    out.push({
      group_name: g.group_name != null ? String(g.group_name).trim() : '',
      group_handle: g.group_handle != null ? String(g.group_handle).trim() : h,
      visibility: g.visibility != null ? String(g.visibility).trim() : ''
    });
  }

  out.sort((a, b) =>
    String(a.group_name).localeCompare(String(b.group_name), undefined, {
      sensitivity: 'base',
      numeric: true
    })
  );

  await attachAdminProfilesToGroupRows(out);
  return out;
}

/**
 * Single row from `groups` where `group_handle` matches the URL segment (case-insensitive).
 * @param {string} handleRaw e.g. decoded path after `/events/group/` (may include `@`)
 * @returns {Promise<{ group_name: string, group_handle: string, visibility: string } | null>}
 */
async function getGroupByHandle(handleRaw) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const gh = normalizeGroupHandle(handleRaw);
  if (!gh) return null;

  const { data, error } = await supabase
    .from('groups')
    .select('group_name, group_handle, visibility')
    .eq('group_handle', gh)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    group_name: data.group_name != null ? String(data.group_name).trim() : '',
    group_handle: data.group_handle != null ? String(data.group_handle).trim() : gh,
    visibility: data.visibility != null ? String(data.visibility).trim() : ''
  };
}

/**
 * All `group_members` rows for a group URL slug: matches `group_handle` in the URL to `group_members.group_handle`.
 * Returns `person_handle` (and `status`, `id`) per row; optionally enriches names for the group page table.
 * @param {string} handleRaw Segment from `/events/group/@…` (decoded)
 * @param {string|null} viewerUserId Viewer email (reserved for future contact-name enrichment)
 * @returns {Promise<Array<{ id?: number, person_handle: string, status: string, display_name?: string, display_status?: string }>>}
 */
async function listMembersRowsByGroupHandle(handleRaw, viewerUserId) {
  void viewerUserId;
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const gh = normalizeGroupHandle(handleRaw);
  if (!gh) return [];

  const { data, error } = await supabase
    .from('group_members')
    .select('id, person_handle, status, group_handle')
    .eq('group_handle', gh)
    .order('person_handle', { ascending: true });
  if (error) throw error;

  let rows = (data || []).map(r => ({
    id: r.id,
    person_handle: r.person_handle != null ? String(r.person_handle).trim() : '',
    status: r.status != null ? String(r.status).trim() : '',
    group_handle: r.group_handle != null ? String(r.group_handle).trim() : gh
  }));
  rows = rows.filter(r => r.person_handle);
  if (!rows.length) return [];

  if (supabaseProfiles.isConfigured()) {
    try {
      rows = await supabaseProfiles.enrichGroupMemberRowsWithProfileNames(rows);
      rows = supabaseProfiles.attachGroupMemberDisplayFields(rows);
    } catch (e) {
      console.warn('enrich group members:', e.message || e);
    }
  }

  return rows;
}

/**
 * Insert a `group_members` row from the group page modal (`person_handle` = handle field).
 * @param {{ groupHandleRaw: string, personHandleRaw: string, addAs: string }} addAs `member` | `admin` | `blind member`
 */
async function addGroupMemberFromModal({ groupHandleRaw, personHandleRaw, addAs }) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const gh = normalizeGroupHandle(groupHandleRaw);
  const ph = normalizePersonHandle(personHandleRaw);
  if (!gh || !ph) {
    throw Object.assign(new Error('group_handle and person_handle are required'), { status: 400 });
  }

  const role = String(addAs || '')
    .trim()
    .toLowerCase();
  let status;
  if (role === 'member' || role === 'admin') {
    status = 'invited';
  } else if (role === 'blind member') {
    status = 'blind member';
  } else {
    throw Object.assign(new Error('add_as must be member, admin, or blind member'), { status: 400 });
  }

  const { error } = await supabase.from('group_members').insert({
    group_handle: gh,
    person_handle: ph,
    status
  });
  if (error) {
    if (error.code === '23505') {
      throw Object.assign(
        new Error('That person is already in this group or has a pending invite.'),
        { status: 409 }
      );
    }
    throw error;
  }
  return { ok: true };
}

/**
 * Delete one `group_members` row matching URL `group_handle` and row `person_handle`.
 */
async function removeGroupMemberByGroupHandleAndPersonHandle({
  groupHandleRaw,
  person_handle
}) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const gh = normalizeGroupHandle(groupHandleRaw);
  const ph = normalizePersonHandle(person_handle);
  if (!gh || !ph) {
    throw Object.assign(new Error('group_handle and person_handle are required'), { status: 400 });
  }

  const { data: candidates, error: selErr } = await supabase
    .from('group_members')
    .select('id, person_handle')
    .eq('group_handle', gh);
  if (selErr) throw selErr;
  const row = (candidates || []).find(
    r => normalizePersonHandle(r && r.person_handle) === ph
  );
  if (!row || row.id == null) {
    throw Object.assign(new Error('Membership not found'), { status: 404 });
  }

  const { error: delErr } = await supabase.from('group_members').delete().eq('id', row.id);
  if (delErr) throw delErr;
  return { ok: true };
}

/**
 * Mutual groups for profiles.html.
 *
 *   groups_of_logged_in_user  = group_handle from `group_members` where person_handle = viewer and status in (member, admin)
 *   profile_groups            = { group_handle, status } for URL person_handle (all statuses incl. blind member)
 *   union_group_handles       = intersection of the two handle sets (also logged to server console)
 *   groups                    = [{ group_name, group_handle, status }] for union, `status` from profile_groups
 *
 * @param {string} viewerPersonHandle Logged-in user's person_handle
 * @param {string} profilePersonHandle URL person_handle
 */
async function listProfileMutualGroupsByPersonHandles(viewerPersonHandle, profilePersonHandle) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');

  const viewerPh = normalizePersonHandle(viewerPersonHandle);
  const profilePh = normalizePersonHandle(profilePersonHandle);
  const empty = {
    user_groups: [],
    profile_groups: [],
    mutual_handles: [],
    groups: []
  };
  if (!viewerPh || !profilePh) return empty;

  const { data: viewerRows, error: viewerErr } = await supabase
    .from('group_members')
    .select('group_handle, status')
    .ilike('person_handle', viewerPh);
  if (viewerErr) throw viewerErr;

  const groupsOfLoggedInUser = [
    ...new Set(
      (viewerRows || [])
        .filter(r => {
          const s = String(r.status || '').trim().toLowerCase();
          return s === 'member' || s === 'admin';
        })
        .map(r => normalizeGroupHandle(r.group_handle))
        .filter(Boolean)
    )
  ];

  const { data: profileRows, error: profileErr } = await supabase
    .from('group_members')
    .select('group_handle, status')
    .ilike('person_handle', profilePh);
  if (profileErr) throw profileErr;

  const profileGroups = (profileRows || [])
    .map(r => ({
      group_handle: normalizeGroupHandle(r.group_handle),
      status: r.status != null ? String(r.status).trim() : ''
    }))
    .filter(r => !!r.group_handle);

  const profileHandleSet = new Set(profileGroups.map(r => r.group_handle));
  const unionGroupHandles = groupsOfLoggedInUser.filter(h => profileHandleSet.has(h));
  console.log('[profile-mutual] union_group_handles:', unionGroupHandles);

  let groups = [];
  if (unionGroupHandles.length) {
    const { data: groupRows, error: gErr } = await supabase
      .from('groups')
      .select('group_name, group_handle')
      .in('group_handle', unionGroupHandles);
    if (gErr) throw gErr;

    const statusByHandle = new Map();
    for (const r of profileGroups) {
      if (!statusByHandle.has(r.group_handle)) statusByHandle.set(r.group_handle, r.status);
    }
    for (const g of groupRows || []) {
      const gh = normalizeGroupHandle(g.group_handle);
      if (!gh) continue;
      groups.push({
        group_name: g.group_name != null ? String(g.group_name).trim() : '',
        group_handle: g.group_handle != null ? String(g.group_handle).trim() : gh,
        status: statusByHandle.get(gh) || ''
      });
    }
    groups.sort((a, b) =>
      String(a.group_name).localeCompare(String(b.group_name), undefined, {
        sensitivity: 'base',
        numeric: true
      })
    );
  }

  return {
    user_groups: groupsOfLoggedInUser,
    profile_groups: profileGroups,
    mutual_handles: unionGroupHandles,
    groups
  };
}

/**
 * Batched mutual-groups lookup for contact_library.html's Mutual Groups column.
 * Same rules as profile.html (see `listProfileMutualGroupsByPersonHandles`), applied once per `otherPersonHandles` entry.
 *
 *   viewer handles   = group_handle from `group_members` where person_handle = viewer and status in (member, admin)
 *   contact handles  = { group_handle, status } for each other person_handle (all statuses incl. blind member)
 *   union            = intersection of viewer handles and each contact's handles (logged per contact)
 *
 * @param {string} viewerPersonHandle Logged-in user's person_handle
 * @param {string[]} otherPersonHandles Contact / friend person_handles
 * @returns {Promise<Record<string, Array<{ group_name: string, group_handle: string, status: string }>>>}
 */
async function listMutualGroupsForHandles(viewerPersonHandle, otherPersonHandles) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');

  const viewerPh = normalizePersonHandle(viewerPersonHandle);
  const handleKeys = [
    ...new Set(
      (Array.isArray(otherPersonHandles) ? otherPersonHandles : [])
        .map(h => normalizePersonHandle(h))
        .filter(Boolean)
    )
  ];
  const result = {};
  for (const k of handleKeys) result[k] = [];
  if (!viewerPh || !handleKeys.length) return result;

  const { data: viewerRows, error: viewerErr } = await supabase
    .from('group_members')
    .select('group_handle, status')
    .ilike('person_handle', viewerPh);
  if (viewerErr) throw viewerErr;

  const viewerGroupHandles = new Set(
    (viewerRows || [])
      .filter(r => {
        const s = String(r.status || '').trim().toLowerCase();
        return s === 'member' || s === 'admin';
      })
      .map(r => normalizeGroupHandle(r.group_handle))
      .filter(Boolean)
  );
  if (!viewerGroupHandles.size) return result;

  const { data: contactRows, error: contactErr } = await supabase
    .from('group_members')
    .select('group_handle, person_handle, status')
    .in('person_handle', handleKeys);
  if (contactErr) throw contactErr;

  const byHandle = new Map();
  for (const k of handleKeys) byHandle.set(k, []);
  for (const r of contactRows || []) {
    const ph = normalizePersonHandle(r.person_handle);
    const gh = normalizeGroupHandle(r.group_handle);
    if (!ph || !gh || !byHandle.has(ph)) continue;
    byHandle.get(ph).push({
      group_handle: gh,
      status: r.status != null ? String(r.status).trim() : ''
    });
  }

  const unionByHandle = new Map();
  const allUnionHandles = new Set();
  for (const ph of handleKeys) {
    const rows = byHandle.get(ph) || [];
    const seen = new Set();
    const unionRows = [];
    for (const row of rows) {
      if (!viewerGroupHandles.has(row.group_handle)) continue;
      if (seen.has(row.group_handle)) continue;
      seen.add(row.group_handle);
      unionRows.push(row);
      allUnionHandles.add(row.group_handle);
    }
    unionByHandle.set(ph, unionRows);
    console.log('[mutual]', ph, 'union_group_handles:', unionRows.map(r => r.group_handle));
  }
  if (!allUnionHandles.size) return result;

  const { data: groupRows, error: gErr } = await supabase
    .from('groups')
    .select('group_name, group_handle')
    .in('group_handle', [...allUnionHandles]);
  if (gErr) throw gErr;

  const nameByHandle = new Map();
  const displayHandleByHandle = new Map();
  for (const g of groupRows || []) {
    const gh = normalizeGroupHandle(g.group_handle);
    if (!gh) continue;
    nameByHandle.set(gh, g.group_name != null ? String(g.group_name).trim() : '');
    displayHandleByHandle.set(
      gh,
      g.group_handle != null ? String(g.group_handle).trim() : gh
    );
  }

  for (const ph of handleKeys) {
    const rows = unionByHandle.get(ph) || [];
    const out = rows
      .map(r => ({
        group_name: nameByHandle.get(r.group_handle) || '',
        group_handle: displayHandleByHandle.get(r.group_handle) || r.group_handle,
        status: r.status
      }))
      .filter(r => !!r.group_name)
      .sort((a, b) =>
        String(a.group_name).localeCompare(String(b.group_name), undefined, {
          sensitivity: 'base',
          numeric: true
        })
      );
    result[ph] = out;
  }

  return result;
}

module.exports = {
  isConfigured,
  listGroupsForViewerPersonHandle,
  getGroupByHandle,
  listMembersRowsByGroupHandle,
  addGroupMemberFromModal,
  removeGroupMemberByGroupHandleAndPersonHandle,
  listProfileMutualGroupsByPersonHandles,
  listMutualGroupsForHandles
};
