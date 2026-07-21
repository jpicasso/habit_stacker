/**
 * Supabase Auth for Habit Stacker (replaces the old Auth0 integration).
 *
 * Exposes:
 *   window.appAuth        – { client, getSession, isAuthenticated, getUser }
 *   window.appAuthReady   – promise that resolves once the client exists
 *   window.handleLogin    – go to the login page
 *   window.handleSignup   – go to the login page, sign-up form
 *   window.handleLogout   – sign out and return to the homepage
 *
 * Requires (loaded first in the layout):
 *   - @supabase/supabase-js v2 UMD build (global `supabase`)
 *   - /js/supabase-config.js (window.SUPABASE_PUBLIC_CONFIG)
 */

(function () {
  const config = window.SUPABASE_PUBLIC_CONFIG || {};
  const configured =
    config.url &&
    config.anonKey &&
    !config.url.includes('YOUR_PROJECT_REF') &&
    !config.anonKey.includes('YOUR_SUPABASE');

  if (!configured) {
    console.error(
      'Supabase is not configured. Fill in src/js/supabase-config.js ' +
        '(see README_SETUP.md).'
    );
  }

  const sbClient = configured
    ? supabase.createClient(config.url, config.anonKey)
    : null;

  window.appAuth = {
    client: sbClient,

    async getSession() {
      if (!sbClient) return null;
      const { data, error } = await sbClient.auth.getSession();
      if (error) {
        console.error('Error getting session:', error);
        return null;
      }
      return data.session || null;
    },

    async isAuthenticated() {
      return !!(await this.getSession());
    },

    /** Returns the Supabase user object ({ id, email, ... }) or null. */
    async getUser() {
      const session = await this.getSession();
      return session ? session.user : null;
    }
  };

  window.appAuthReady = Promise.resolve(window.appAuth);

  // --- Navbar / page chrome ---
  function updateUI(session) {
    const isAuthenticated = !!session;
    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');
    const privateNavItems = document.querySelectorAll('.private-nav-item');
    const homeGuestCtas = document.querySelectorAll('#home-cta-guest, #home-cta-guest-secondary');
    const homeAuthCtas = document.querySelectorAll('#home-cta-auth, #home-cta-auth-secondary');

    if (loginButton) {
      loginButton.style.display = isAuthenticated ? 'none' : 'block';
    }
    if (logoutButton) {
      logoutButton.style.display = isAuthenticated ? 'block' : 'none';
    }
    privateNavItems.forEach(el => {
      el.style.display = isAuthenticated ? 'block' : 'none';
    });
    homeGuestCtas.forEach(el => {
      el.style.display = isAuthenticated ? 'none' : '';
    });
    homeAuthCtas.forEach(el => {
      el.style.display = isAuthenticated ? '' : 'none';
    });
  }

  if (sbClient) {
    // Fires immediately with the current session, then on every change
    sbClient.auth.onAuthStateChange((event, session) => {
      updateUI(session);
      // Skip token refresh — it doesn't change login state and causes page flicker
      if (event === 'TOKEN_REFRESHED') return;
      if (typeof window.updateContentVisibility === 'function') {
        window.updateContentVisibility(!!session);
      }
    });
  } else {
    document.addEventListener('DOMContentLoaded', () => updateUI(null));
  }

  // --- Global handlers used by onclick="" attributes ---
  window.handleLogin = function () {
    window.location.href = '/login.html';
  };

  window.handleSignup = function () {
    window.location.href = '/login.html#signup';
  };

  window.handleLogout = async function () {
    try {
      if (sbClient) await sbClient.auth.signOut();
    } catch (error) {
      console.error('Error during logout:', error);
    }
    window.location.href = '/index.html';
  };
})();
