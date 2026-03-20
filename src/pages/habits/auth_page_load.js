/**
 * Auth0 page gate: resolve client, wait for redirect handling, toggle #private-content vs #login-required-message.
 * Loaded before habits.js so habits.js can wrap updateContentVisibility (e.g. to loadTasks after login).
 */

// --- Auth0: resolve client, wait for redirect handling, then toggle page sections ---
async function checkAuthAndDisplayContent() {
  try {
    let auth0 = null;

    // Prefer sync client; otherwise wait for auth0-config.js to set auth0Promise
    if (window.auth0) {
      auth0 = window.auth0;
    } else if (window.auth0Promise) {
      auth0 = await window.auth0Promise;
    } else {
      setTimeout(checkAuthAndDisplayContent, 200);
      return;
    }

    // After OAuth redirect, auth0-config may still be finishing handleRedirectCallback
    if (window.redirectHandledPromise) {
      await window.redirectHandledPromise;
    }

    if (auth0 && typeof auth0.isAuthenticated === 'function') {
      const isAuthenticated = await auth0.isAuthenticated();
      updateContentVisibility(isAuthenticated);
    } else {
      console.error('Auth0 client is not properly initialized');
      updateContentVisibility(false);
    }
  } catch (error) {
    console.error('Error checking authentication:', error);
    updateContentVisibility(false);
  }
}

function updateContentVisibility(isAuthenticated) {
  const privateContent = document.getElementById('private-content');
  const loginRequiredMessage = document.getElementById('login-required-message');

  if (isAuthenticated) {
    if (privateContent) privateContent.style.display = 'block';
    if (loginRequiredMessage) loginRequiredMessage.style.display = 'none';
  } else {
    if (privateContent) privateContent.style.display = 'none';
    if (loginRequiredMessage) loginRequiredMessage.style.display = 'block';
  }
}

// Poll until auth0 exists or retries exhaust, so we do not race the SDK script
function waitForAuth0AndCheck(maxRetries = 10, retryDelay = 200) {
  let retries = 0;

  const check = () => {
    if (window.auth0 || (window.auth0Promise && retries < maxRetries)) {
      checkAuthAndDisplayContent();
    } else if (retries < maxRetries) {
      retries++;
      setTimeout(check, retryDelay);
    } else {
      console.warn('Auth0 initialization timeout - showing login required');
      updateContentVisibility(false);
    }
  };

  check();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    waitForAuth0AndCheck();
  });
} else {
  waitForAuth0AndCheck();
}

// User returns from login in another tab/window
window.addEventListener('focus', () => {
  setTimeout(checkAuthAndDisplayContent, 100);
});

// URL still has OAuth code/state right after redirect; give the SDK a moment
if (window.location.search.includes('code=') && window.location.search.includes('state=')) {
  setTimeout(checkAuthAndDisplayContent, 500);
}
