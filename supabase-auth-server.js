/**
 * Server-side Supabase Auth verification.
 * Validates the browser's access token (Authorization: Bearer <jwt>) and
 * exposes the user on req.user, so API routes can trust the caller identity
 * instead of a client-supplied user_id.
 *
 * Uses getClaims (JWKS signature verify) instead of getUser when possible.
 * getUser hits GoTrue which rejects tokens with "JWT issued at future" when
 * the client's clock is slightly ahead of the Auth server — common on phones.
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
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    }
  );
  return client;
}

/**
 * Resolve a Supabase user from an access token.
 * Prefers local JWKS verification (tolerates small clock skew) then loads the
 * user via the Admin API. Falls back to getUser for HS256 / legacy tokens.
 */
async function getUserFromToken(token) {
  const supabase = getClient();
  if (!supabase) return null;

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (!claimsError && claimsData?.claims?.sub) {
    const sub = claimsData.claims.sub;
    const { data: adminData, error: adminError } = await supabase.auth.admin.getUserById(sub);
    if (!adminError && adminData?.user) {
      return adminData.user;
    }
    // Signature-verified claims are enough for our email-scoped API checks
    if (claimsData.claims.email) {
      return { id: sub, email: claimsData.claims.email };
    }
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error) {
    console.warn(
      'Auth getUser failed:',
      error.message,
      claimsError ? `(getClaims: ${claimsError.message})` : ''
    );
    return null;
  }
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
        return res.status(401).json({
          error: 'Invalid or expired session. Check that your phone Date & Time is set to Automatic, then log out and log back in.'
        });
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
