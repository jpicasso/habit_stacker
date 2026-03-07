/**
 * Habits storage using Supabase (PostgreSQL).
 * Used when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.
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

async function getAllHabits() {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('habits')
    .select('*')
    .order('id', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function addHabit(task, eventDate = null, userId = null) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('habits')
    .insert({ task, event_date: eventDate, user_id: userId })
    .select('id, task, event_date, user_id')
    .single();
  if (error) throw error;
  return data;
}

async function updateHabit(id, task, eventDate, userId = null) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('habits')
    .update({ task, event_date: eventDate, user_id: userId })
    .eq('id', id)
    .select('id, task, event_date, user_id')
    .single();
  if (error) throw error;
  return data;
}

async function deleteHabit(id) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.from('habits').delete().eq('id', id);
  if (error) throw error;
  return { id };
}

module.exports = {
  isConfigured,
  getClient,
  getAllHabits,
  addHabit,
  updateHabit,
  deleteHabit
};
