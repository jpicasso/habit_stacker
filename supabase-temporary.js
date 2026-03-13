/**
 * Temporary key/value storage in Supabase (temporary_variables table).
 * Expected columns:
 *   id bigserial primary key,
 *   user_id text,
 *   temporary_table_key text,
 *   temporary_table_value text
 */

let client = null;

function isConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getClient() {
  if (client) return client;
  if (!isConfigured()) return null;
  const { createClient } = require('@supabase/supabase-js');
  client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  return client;
}

/**
 * Get a single variable by user_id and key. Returns { temporary_table_value } or null.
 */
async function getVariable(userId, key) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('temporary_variables')
    .select('temporary_table_value')
    .eq('user_id', userId)
    .eq('temporary_table_key', key)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function upsertVariable(userId, key, value) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');

  // Look for an existing row for this user_id + key
  const { data: existing, error: selectError } = await supabase
    .from('temporary_variables')
    .select('id')
    .eq('user_id', userId)
    .eq('temporary_table_key', key)
    .maybeSingle();
  if (selectError) throw selectError;

  if (existing && existing.id != null) {
    const { data, error } = await supabase
      .from('temporary_variables')
      .update({ temporary_table_value: value })
      .eq('id', existing.id)
      .select('id, user_id, temporary_table_key, temporary_table_value')
      .maybeSingle();
    if (error) throw error;
    return data || { user_id: userId, key, value };
  }

  const { data, error } = await supabase
    .from('temporary_variables')
    .insert({ user_id: userId, temporary_table_key: key, temporary_table_value: value })
    .select('id, user_id, temporary_table_key, temporary_table_value')
    .maybeSingle();
  if (error) throw error;
  return data || { user_id: userId, key, value };
}

module.exports = {
  isConfigured,
  getClient,
  getVariable,
  upsertVariable
};

