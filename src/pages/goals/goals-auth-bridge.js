/** Extends auth_page_load updateContentVisibility to reload goals + charts when signed in. */
const originalUpdateContentVisibility = updateContentVisibility;
updateContentVisibility = function(isAuthenticated) {
  originalUpdateContentVisibility(isAuthenticated);
  if (isAuthenticated) {
    setTimeout(function() {
      (async function() {
        await loadGoals();
        if (typeof loadGoal1Chart === 'function') loadGoal1Chart();
      })();
    }, 100);
    loadMinutesValueFromSupabase();
  }
};
