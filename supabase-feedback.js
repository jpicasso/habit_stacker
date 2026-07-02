/**
 * Feedback storage using Supabase `feedback` table.
 * Columns: id, created_at, details, rating
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
 * Insert one feedback row.
 * @param {{ rating: number, details?: string|null }} payload
 */
async function insertFeedback(payload) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');

  const rating = Number(payload.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new Error('rating must be a number from 1 to 5');
  }

  const details =
    payload.details != null && String(payload.details).trim() !== ''
      ? String(payload.details).trim()
      : null;

  const { data, error } = await supabase
    .from('feedback')
    .insert({ rating, details })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

module.exports = {
  isConfigured,
  getClient,
  insertFeedback
};
