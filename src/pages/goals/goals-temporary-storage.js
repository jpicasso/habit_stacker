/**
 * Supabase temporary_variables read/write. Load first (after auth_page_load.js).
 * Full script order: goals-temporary-storage → table-delta → slugs → charts →
 * working-calories → table-load → auth-bridge → module-visibility → dom-init.
 */
// Generic helpers for Supabase temporary_variables (must be in scope for updateCaloriesTableFromLocal, setGoalsFormat, loadGoals, etc.)
async function saveTemporaryToSupabase(tempKey, tempValue) {
  try {
    if (!window.auth0) return;
    const isAuthenticated = await window.auth0.isAuthenticated();
    if (!isAuthenticated) return;
    const user = await window.auth0.getUser();
    const userId = user && (user.email || user.nickname || user.sub);
    if (!userId) return;
    await fetch('/api/temporary_variables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        key: tempKey,
        value: tempValue
      })
    });
  } catch (err) {
    console.error('Error saving temporary variable to Supabase:', err);
  }
}
async function getTemporaryFromSupabase(tempKey) {
  try {
    if (!window.auth0) return null;
    const isAuthenticated = await window.auth0.isAuthenticated();
    if (!isAuthenticated) return null;
    const user = await window.auth0.getUser();
    const userId = user && (user.email || user.nickname || user.sub);
    if (!userId) return null;
    const res = await fetch('/api/temporary_variables?user_id=' + encodeURIComponent(userId) + '&key=' + encodeURIComponent(tempKey), { cache: 'no-store' });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || (text.trim().length > 0 && text.trim().charAt(0) === '<')) return null;
    try {
      var data = JSON.parse(text);
    } catch (e) { return null; }
    if (data == null) return null;
    return data.temporary_table_value != null ? data.temporary_table_value : null;
  } catch (err) {
    console.error('Error getting temporary variable from Supabase:', err);
    return null;
  }
}
