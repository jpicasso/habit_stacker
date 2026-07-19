/**
 * Server-side Supabase Auth verification.
 * Validates the browser's access token (Authorization: Bearer <jwt>) and
 * exposes the user on req.user, so API routes can trust the caller identity
 * instead of a client-supplied user_id.
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

async function getUserFromToken(token) {
  const supabase = getClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error) return null;
  return data.user || null;
}

/**
 * Express middleware. When Supabase is configured, requires a valid session
 * token and sets req.user. When not configured (local dev without env vars),
 * passes through unchanged.
 */
function requireAuth() {
  return async (req, res, next) => {
    if (!isConfigured()) return next();

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'You must be logged in' });
    }

    try {
      const user = await getUserFromToken(token);
      if (!user) {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }
      req.user = user;
      next();
    } catch (error) {
      console.error('Auth verification error:', error);
      res.status(500).json({ error: 'Failed to verify session' });
    }
  };
}

/**
 * Permanently delete a user's Auth account and their habit rows.
 * Uses the service-role client (admin API).
 * @param {{ id: string, email?: string }} user
 */
async function deleteUserAccount(user) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  if (!user || !user.id) throw new Error('User id is required');

  const email = (user.email || '').trim();
  if (email) {
    const { error: habitsError } = await supabase
      .from('habits')
      .delete()
      .eq('user_id', email);
    if (habitsError) throw habitsError;
  }

  const { error: authError } = await supabase.auth.admin.deleteUser(user.id);
  if (authError) throw authError;
}

module.exports = { isConfigured, requireAuth, deleteUserAccount };
