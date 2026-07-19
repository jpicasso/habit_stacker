/**
 * Auth page gate (Supabase): toggle #private-content vs #login-required-message.
 * Loaded before habits.js so that script can wrap updateContentVisibility
 * (e.g. loadTasks after login).
 *
 * window.appAuth is created by /js/supabase-auth.js, which the layout loads
 * after page scripts — so we poll briefly until it exists.
 */

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

async function checkAuthAndDisplayContent() {
  try {
    const isAuthenticated = await window.appAuth.isAuthenticated();
    updateContentVisibility(isAuthenticated);
  } catch (error) {
    console.error('Error checking authentication:', error);
    updateContentVisibility(false);
  }
}

// supabase-auth.js loads after page scripts; poll until window.appAuth exists.
// Afterwards, onAuthStateChange in supabase-auth.js keeps the page in sync.
function waitForAuthAndCheck(maxRetries = 25, retryDelay = 200) {
  let retries = 0;

  const check = () => {
    if (window.appAuth) {
      checkAuthAndDisplayContent();
    } else if (retries < maxRetries) {
      retries++;
      setTimeout(check, retryDelay);
    } else {
      console.warn('Supabase auth initialization timeout - showing login required');
      updateContentVisibility(false);
    }
  };

  check();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    waitForAuthAndCheck();
  });
} else {
  waitForAuthAndCheck();
}

// User returns from logging in from another tab/window
window.addEventListener('focus', () => {
  if (window.appAuth) setTimeout(checkAuthAndDisplayContent, 100);
});
