// Auth0 Configuration
// Replace these values with your Auth0 credentials from your Auth0 Dashboard
const AUTH0_CONFIG = {
  domain: 'dev-t6kyyferxrttpj1o.us.auth0.com', // e.g., 'your-tenant.auth0.com'
  clientId: 'o6u8lOi5D9vHePmiLftTAcZKD6cR3wzh',
  authorizationParams: {
    redirect_uri: window.location.origin,
    // Add audience if you're using an API
    // audience: 'YOUR_API_IDENTIFIER'
  },
  // Use refresh tokens for better session management
  useRefreshTokens: true,
  cacheLocation: 'localstorage'
};

// Initialize Auth0
let auth0Client = null;
let auth0Promise = null;
let redirectHandledPromise = null;

async function initAuth0() {
  try {
    // Check if auth0 library is available
    if (typeof auth0 === 'undefined') {
      console.error('Auth0 library not loaded');
      return null;
    }
    
    auth0Client = await auth0.createAuth0Client(AUTH0_CONFIG);
    
    // Make auth0 available globally immediately
    window.auth0 = auth0Client;
    
    // Handle the redirect callback
    redirectHandledPromise = handleRedirectCallback();
    window.redirectHandledPromise = redirectHandledPromise;
    
    // Set the promise to resolve to the client
    window.auth0Promise = Promise.resolve(auth0Client);
    
    // Create a fetch wrapper that includes auth tokens
    window.auth0Fetch = async (url, options = {}) => {
      try {
        const token = await auth0Client.getTokenSilently();
        const headers = {
          ...options.headers,
          'Authorization': `Bearer ${token}`
        };
        return fetch(url, { ...options, headers });
      } catch (error) {
        console.error('Error getting token for fetch:', error);
        throw error;
      }
    };
    
    // Update UI based on auth state
    updateUI();
    
    return auth0Client;
  } catch (error) {
    console.error('Error initializing Auth0:', error);
    // Set promise to reject so other code can handle it
    window.auth0Promise = Promise.reject(error);
    return null;
  }
}

async function handleRedirectCallback() {
  try {
    const isAuthenticated = await auth0Client.isAuthenticated();
    
    if (window.location.search.includes('code=') && window.location.search.includes('state=')) {
      // Handle the redirect from Auth0
      await auth0Client.handleRedirectCallback();
      // Remove the query parameters from the URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    return isAuthenticated;
  } catch (error) {
    console.error('Error handling redirect callback:', error);
    return false;
  }
}

async function updateUI() {
  try {
    const isAuthenticated = await auth0Client.isAuthenticated();
    
    // Update login/logout button visibility
    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');
    const privateNavItems = document.querySelectorAll('.private-nav-item');
    
    // Login button: visible only when NOT logged in (standard behavior)
    if (loginButton) {
      loginButton.style.display = isAuthenticated ? 'none' : 'block';
    }
    // Logout button: visible when logged in
    if (logoutButton) {
      logoutButton.style.display = isAuthenticated ? 'block' : 'none';
    }
    // Private links: visible only when logged in
    privateNavItems.forEach(el => {
      el.style.display = isAuthenticated ? 'block' : 'none';
    });
    
    // If user is authenticated, you can get user info
    if (isAuthenticated) {
      const user = await auth0Client.getUser();
      console.log('User authenticated:', user);
    }
  } catch (error) {
    console.error('Error updating UI:', error);
  }
}

// Login handler
async function handleLogin() {
  try {
    // Optimistically show private nav items during login flow.
    document.querySelectorAll('.private-nav-item').forEach(el => {
      el.style.display = 'block';
    });

    const auth0 = await auth0Promise;
    const redirectUri = window.location.origin;
    console.log('Attempting login with redirect URI:', redirectUri);
    
    await auth0.loginWithRedirect({
      authorizationParams: {
        redirect_uri: redirectUri
      }
    });
  } catch (error) {
    console.error('Error during login:', error);
    alert('Login error: ' + error.message + '\n\nMake sure your callback URL is configured in Auth0 Dashboard:\n' + window.location.origin);
  }
}

// Logout handler
async function handleLogout() {
  try {
    // Hide private nav items immediately on logout.
    document.querySelectorAll('.private-nav-item').forEach(el => {
      el.style.display = 'none';
    });

    const auth0 = await auth0Promise;
    await auth0.logout({
      logoutParams: {
        returnTo: window.location.origin
      }
    });
  } catch (error) {
    console.error('Error during logout:', error);
  }
}

// Make handlers available globally
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;

// Initialize Auth0 when the page loads
auth0Promise = initAuth0();
