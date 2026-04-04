/**
 * User profiles in Supabase (`profiles`).
 *
 *   create table if not exists public.profiles (
 *     email text primary key,
 *     name text not null,
 *     handles text not null,
 *     location text not null
 *   );
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

function normalizeEmail(s) {
  return s != null ? String(s).trim().toLowerCase() : '';
}

/**
 * @returns {Promise<object|null>} Row or null if missing.
 */
async function getProfileByEmail(email) {
  const supabase = getClient();
  if (!supabase) return null;
  const e = normalizeEmail(email);
  if (!e) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('email, name, handles, location')
    .eq('email', e)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/**
 * Insert or update by email without relying on ON CONFLICT (works even if `email`
 * has no UNIQUE/PK in Postgres — avoids "no unique constraint matching ON CONFLICT").
 *
 * @returns {Promise<object>} Saved row
 */
async function upsertProfile(email, { name, handles, location }) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');

  const e = normalizeEmail(email);
  if (!e) throw new Error('email is required');

  const row = {
    email: e,
    name: String(name != null ? name : '').trim(),
    handles: String(handles != null ? handles : '').trim(),
    location: String(location != null ? location : '').trim()
  };

  const existing = await getProfileByEmail(e);

  if (existing) {
    const { data, error } = await supabase
      .from('profiles')
      .update({ name: row.name, handles: row.handles, location: row.location })
      .eq('email', e)
      .select('email, name, handles, location')
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('profiles')
    .insert(row)
    .select('email, name, handles, location')
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  isConfigured,
  getProfileByEmail,
  upsertProfile
};
