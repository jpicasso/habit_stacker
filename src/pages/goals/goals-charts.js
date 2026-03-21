/** Goal 1 bar chart (Chart.js). Uses goalToSlug for matching goals_values rows. */
var goal1ChartInstance = null;
function goalToSlug(goalText) {
  var s = String(goalText || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return s || 'goal';
}
async function loadGoal1Chart() {
  var titleEl = document.getElementById('goal1-chart-title');
  var canvas = document.getElementById('goal1-bar-chart');
  if (!titleEl || !canvas) return;
  var userEmail = null;
  try {
    if (window.auth0) {
      var isAuth = await window.auth0.isAuthenticated();
      if (isAuth) {
        var user = await window.auth0.getUser();
        userEmail = user && (user.email || user.nickname || user.sub) || null;
      }
    }
  } catch (e) { return; }
  if (!userEmail) {
    titleEl.textContent = 'Goal 1 (log in to load)';
    return;
  }
  try {
    var goalsRes = await fetch('/api/goals?user_id=' + encodeURIComponent(userEmail));
    if (!goalsRes.ok) return;
    var goalsRow = await goalsRes.json();
    var goal1Name = (goalsRow && goalsRow.goal1 != null && String(goalsRow.goal1).trim() !== '') ? String(goalsRow.goal1).trim() : null;
    titleEl.textContent = goal1Name ? (goal1Name + ' (last 12 months)') : 'Goal 1 (none set)';
    var slug = goal1Name ? goalToSlug(goal1Name) : '';
    var gvRes = await fetch('/api/goals/values?user_id=' + encodeURIComponent(userEmail));
    var values = (gvRes.ok) ? await gvRes.json() : [];
    if (!Array.isArray(values)) values = [];
    var now = new Date();
    var monthLabels = [];
    var sums = [];
    for (var i = 0; i < 12; i++) {
      var d = new Date(now.getFullYear(), now.getMonth() - 12 + i, 1);
      var y = d.getFullYear();
      var m = d.getMonth();
      monthLabels.push(d.toLocaleString('default', { month: 'short' }) + ' ' + y);
      var sum = 0;
      values.forEach(function (row) {
        if (slug && (row.goal_name == null ? '' : String(row.goal_name).trim().toLowerCase()) !== slug.toLowerCase()) return;
        var dateVal = row.date;
        var dateStr = dateVal != null ? (typeof dateVal === 'string' ? dateVal : String(dateVal)) : '';
        if (dateStr.indexOf('T') !== -1) dateStr = dateStr.slice(0, 10);
        else if (dateStr) dateStr = dateStr.slice(0, 10);
        if (!dateStr || dateStr.length < 7) return;
        var parts = dateStr.split('-');
        if (parts.length < 2) return;
        var rowYear = parseInt(parts[0], 10);
        var rowMonth = parseInt(parts[1], 10) - 1;
        if (rowYear === y && rowMonth === m) {
          var v = parseFloat(row.value);
          if (!isNaN(v)) sum += v;
        }
      });
      sums.push(sum);
    }
    if (goal1ChartInstance) {
      goal1ChartInstance.destroy();
      goal1ChartInstance = null;
    }
    if (typeof Chart === 'undefined') return;
    goal1ChartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: monthLabels,
        datasets: [{
          label: goal1Name || 'Goal 1',
          data: sums,
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } }
      }
    });
  } catch (err) {
    console.error('Error loading goal1 chart:', err);
    if (titleEl) titleEl.textContent = 'Goal 1 (error loading)';
  }
}
