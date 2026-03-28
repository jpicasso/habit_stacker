/**
 * Life events table in Supabase (`events`).
 * Expected columns: id, event (text), event_date (date), owner (text), shared (text/json),
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
  return s != null ? String(s).trim() : '';
}

/** True if userId matches owner (exact, or one of comma-separated entries). */
function userInOwnerField(owner, userId) {
  const u = normalizeUserId(userId);
  if (!u) return false;
  const o = normalizeUserId(owner);
  if (!o) return false;
  if (o === u) return true;
  return o.split(',').map((x) => x.trim()).filter(Boolean).includes(u);
}

/** True if userId is included in shared (string, comma list, JSON array, or substring fallback). */
function userInSharedField(shared, userId) {
  const u = normalizeUserId(userId);
  if (!u) return false;
  if (shared == null || shared === '') return false;
  if (typeof shared === 'object' && Array.isArray(shared)) return shared.includes(u);
  const str = String(shared).trim();
  if (str === u) return true;
  if (str.split(',').map((x) => x.trim()).filter(Boolean).includes(u)) return true;
  try {
    const arr = JSON.parse(str);
    if (Array.isArray(arr)) return arr.map(String).includes(u);
  } catch (e) {
    /* ignore */
  }
  return str.includes(u);
}

function rowVisibleForUser(row, userId) {
  return userInOwnerField(row.owner, userId) || userInSharedField(row.shared, userId);
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
 * All events visible to this user (owner or listed in shared).
 * Ordered by event_date descending (most recent first); rows without a date last.
 */
async function getEventsForUser(userId) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.from('events').select('*').order('event_date', { ascending: false, nullsFirst: false });
  if (error) throw error;
  const rows = data || [];
  const visible = rows.filter((row) => rowVisibleForUser(row, userId));
  visible.sort((a, b) => {
    const ta = eventDateSortKey(a);
    const tb = eventDateSortKey(b);
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
  });
  return visible;
}

async function insertEvent({ event, event_date, owner, shared, copied }) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const row = {
    event: event != null ? String(event).trim() : '',
    event_date: event_date || null,
    owner: owner != null ? String(owner).trim() : null,
    shared: shared != null ? shared : null
  };
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

async function updateEvent(id, { event, event_date, owner, shared, copied }) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const patch = {};
  if (event !== undefined) patch.event = String(event).trim();
  if (event_date !== undefined) patch.event_date = event_date;
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
