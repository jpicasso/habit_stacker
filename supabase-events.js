/**
 * Life events table in Supabase (`events`).
 * Expected columns: id, event (text), event_date (date), who (text), owner (text), shared (text/json),
 * copied (boolean, optional) — create in Supabase SQL if missing.
 * Visibility: a row is returned when the current user_id matches owner (exact or comma-separated)
 * or appears in shared (comma list, JSON array, or substring fallback).
 */

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

function normalizeUserId(s) {
  return s != null ? String(s).trim().toLowerCase() : '';
}

/** True if userId matches owner (exact, or one of comma-separated entries). */
function userInOwnerField(owner, userId) {
  const u = normalizeUserId(userId);
  if (!u) return false;
  const o = normalizeUserId(owner);
  if (!o) return false;
  if (o === u) return true;
  return o.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).includes(u);
}

/** Parse shared field into an array of trimmed tokens (comma or newline separated). */
function parseSharedTokens(shared) {
  if (shared == null || shared === '') return [];
  if (typeof shared === 'object' && Array.isArray(shared)) return shared.map(String).map(s => s.trim()).filter(Boolean);
  const str = String(shared).trim();
  try {
    const arr = JSON.parse(str);
    if (Array.isArray(arr)) return arr.map(String).map(s => s.trim()).filter(Boolean);
  } catch (e) { /* ignore */ }
  return str.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
}

/** True if userId is included in shared (string, comma list, JSON array, or substring fallback). */
function userInSharedField(shared, userId) {
  const u = normalizeUserId(userId);
  if (!u) return false;
  if (shared == null || shared === '') return false;
  const tokens = parseSharedTokens(shared);
  if (tokens.map(t => t.toLowerCase()).includes(u)) return true;
  // substring fallback for legacy data
  return String(shared).toLowerCase().includes(u);
}

function rowVisibleForUser(row, userId) {
  return userInOwnerField(row.owner, userId) || userInSharedField(row.shared, userId);
}

/**
 * Fetch all groups the user is a member/admin of, with their visibility.
 * Returns a Map<groupName (original case), visibility (string|null)>.
 */
async function getUserGroupsMap(userId) {
  const supabase = getClient();
  const uid = normalizeUserId(userId);
  if (!uid || !supabase) return new Map();

  const { data: memberRows, error: e1 } = await supabase
    .from('group_members')
    .select('group_name')
    .ilike('member', uid)
    .in('status', ['member', 'blind member', 'admin']);
  if (e1) throw e1;

  const groupNames = [...new Set((memberRows || []).map(r => r.group_name))];
  if (!groupNames.length) return new Map();

  const { data: groupRows, error: e2 } = await supabase
    .from('groups')
    .select('group_name, visibility')
    .in('group_name', groupNames);
  if (e2) throw e2;

  const map = new Map();
  for (const g of (groupRows || [])) {
    map.set(g.group_name, g.visibility || null);
  }
  return map;
}

/**
 * True if any token in the shared field exactly matches a group the user belongs to
 * (case-insensitive comparison).
 */
function userInSharedViaGroup(shared, groupsMap) {
  if (!groupsMap || groupsMap.size === 0) return false;
  const tokens = parseSharedTokens(shared);
  const lowerGroupNames = new Set([...groupsMap.keys()].map(k => k.toLowerCase()));
  return tokens.some(t => lowerGroupNames.has(t.toLowerCase()));
}

/**
 * Transform the shared field for display:
 *  - Tokens that are a group name with visibility "Only me"  → replaced with the viewer's email
 *  - All other tokens (emails, "Members only" / "Public" group names) → kept as-is
 * Returns the transformed shared string or the original value if no change occurred.
 */
function transformSharedForDisplay(shared, userEmail, groupsMap) {
  if (!groupsMap || groupsMap.size === 0) return shared;
  const tokens = parseSharedTokens(shared);
  if (!tokens.length) return shared;

  // Build lowercase -> { originalKey, visibility } lookup
  const lowerMap = new Map(
    [...groupsMap.entries()].map(([k, v]) => [k.toLowerCase(), { key: k, visibility: v }])
  );

  const uid = normalizeUserId(userEmail);
  let changed = false;
  const transformed = tokens.map(token => {
    const entry = lowerMap.get(token.toLowerCase());
    if (entry && entry.visibility && entry.visibility.toLowerCase() === 'only me') {
      changed = true;
      return uid; // viewer sees their own email, not the private group name
    }
    return token;
  });

  if (!changed) return shared;
  // Deduplicate after substitution (e.g. user email was already in list)
  const deduped = [...new Set(transformed)];
  return deduped.join(', ');
}

/** Parse event_date to UTC ms for sorting; null/invalid → null (sorts last when newest-first). */
function eventDateSortKey(row) {
  const d = row && row.event_date;
  if (d == null || String(d).trim() === '') return null;
  const ymd = String(d).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const t = new Date(ymd + 'T00:00:00').getTime();
  return isNaN(t) ? null : t;
}

/**
 * All events visible to this user:
 *  - owner matches, or user email is in shared (existing behaviour), OR
 *  - shared contains a group name the user is a member/admin of.
 *
 * Before returning, the shared field is transformed for display:
 *  - "Only me" group names → replaced with the viewer's own email.
 *  - "Members only" / "Public" group names → kept as-is.
 *
 * Ordered by event_date descending (most recent first); rows without a date last.
 */
async function getEventsForUser(userId) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');

  // Fetch events and the user's group memberships in parallel
  const [eventsResult, groupsMap] = await Promise.all([
    supabase.from('events').select('*').order('event_date', { ascending: false, nullsFirst: false }),
    getUserGroupsMap(userId)
  ]);
  if (eventsResult.error) throw eventsResult.error;

  const rows = eventsResult.data || [];

  // Filter: visible by email match OR via a shared group
  const visible = rows.filter(row =>
    rowVisibleForUser(row, userId) || userInSharedViaGroup(row.shared, groupsMap)
  );

  // Transform shared field: replace "Only me" group names with viewer's email
  const processed = visible.map(row => ({
    ...row,
    shared: transformSharedForDisplay(row.shared, userId, groupsMap)
  }));

  processed.sort((a, b) => {
    const ta = eventDateSortKey(a);
    const tb = eventDateSortKey(b);
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
  });
  return processed;
}

async function insertEvent({ event, event_date, who, owner, shared, copied }) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const row = {
    event: event != null ? String(event).trim() : '',
    event_date: event_date || null,
    owner: owner != null ? String(owner).trim() : null,
    shared: shared != null ? shared : null
  };
  if (who !== undefined) {
    row.who = who == null || String(who).trim() === '' ? null : String(who).trim();
  }
  if (copied !== undefined) row.copied = copied;
  const { data, error } = await supabase.from('events').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

async function getEventById(id) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function updateEvent(id, { event, event_date, who, owner, shared, copied }) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const patch = {};
  if (event !== undefined) patch.event = String(event).trim();
  if (event_date !== undefined) patch.event_date = event_date;
  if (who !== undefined) {
    patch.who = who == null || String(who).trim() === '' ? null : String(who).trim();
  }
  if (owner !== undefined) patch.owner = owner != null ? String(owner).trim() : null;
  if (shared !== undefined) patch.shared = shared;
  if (copied !== undefined) patch.copied = copied;
  const { data, error } = await supabase.from('events').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

async function deleteEvent(id) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;
  return { id };
}

module.exports = {
  isConfigured,
  getClient,
  getEventsForUser,
  insertEvent,
  getEventById,
  updateEvent,
  deleteEvent,
  rowVisibleForUser
};
