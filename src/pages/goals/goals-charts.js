/** Goal 1 & 2 bar charts (Chart.js). Depends on goalToSlug / getGoalIdPrefixForIndex. */
var goal1ChartInstance = null;
function goalToSlug(goalText) {
  var s = String(goalText || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return s || 'goal';
}
/** Same id prefix as goals table for a given goal index (1-based). Handles duplicate names: goal1="Running", goal2="Running" -> "running", "running-1". */
function getGoalIdPrefixForIndex(goalsRow, goalIndex) {
  if (!goalsRow || goalIndex < 1 || goalIndex > 8) return '';
  var slugCount = {};
  for (var i = 1; i <= goalIndex; i++) {
    var raw = goalsRow['goal' + i];
    var goalText = (raw != null && String(raw).trim() !== '') ? String(raw).trim() : null;
    var base = goalText ? goalToSlug(goalText) : '';
    if (base) {
      if (slugCount[base] !== undefined) {
        slugCount[base]++;
        base = base + '-' + slugCount[base];
      } else {
        slugCount[base] = 0;
      }
    }
    if (i === goalIndex) return base;
  }
  return '';
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
var goal2ChartInstance = null;
async function loadGoal2Chart() {
  var titleEl = document.getElementById('goal2-chart-title');
  var canvas = document.getElementById('goal2-bar-chart');
  if (!titleEl || !canvas) {
    console.error('[Goal2 chart] Missing DOM: goal2-chart-title or goal2-bar-chart not found');
    return;
  }
  var userEmail = null;
  try {
    if (window.auth0) {
      var isAuth = await window.auth0.isAuthenticated();
      if (isAuth) {
        var user = await window.auth0.getUser();
        userEmail = user && (user.email || user.nickname || user.sub) || null;
      }
    }
  } catch (e) {
    console.error('[Goal2 chart] Auth check failed:', e);
    return;
  }
  if (!userEmail) {
    titleEl.textContent = 'Goal 2 (log in to load)';
    return;
  }
  try {
    var goalsRes = await fetch('/api/goals?user_id=' + encodeURIComponent(userEmail));
    if (!goalsRes.ok) {
      console.error('[Goal2 chart] GET /api/goals failed:', goalsRes.status, goalsRes.statusText);
      titleEl.textContent = 'Goal 2 (error: goals API ' + goalsRes.status + ')';
      return;
    }
    var goalsRow = await goalsRes.json();
    var goal2Name = (goalsRow && goalsRow.goal2 != null && String(goalsRow.goal2).trim() !== '') ? String(goalsRow.goal2).trim() : null;
    titleEl.textContent = goal2Name ? (goal2Name + ' (last 12 months)') : 'Goal 2 (none set)';
    var prefix = getGoalIdPrefixForIndex(goalsRow || {}, 2);
    if (!prefix) {
      console.warn('[Goal2 chart] No prefix for goal2 — goal2 may be empty or not set. Chart will show zeros.');
    }
    var gvRes = await fetch('/api/goals/values?user_id=' + encodeURIComponent(userEmail));
    if (!gvRes.ok) {
      console.error('[Goal2 chart] GET /api/goals/values failed:', gvRes.status, gvRes.statusText);
      titleEl.textContent = 'Goal 2 (error: values API ' + gvRes.status + ')';
      return;
    }
    var values = (gvRes.ok) ? await gvRes.json() : [];
    if (!Array.isArray(values)) values = [];
    var uniqueGoalNames = [];
    values.forEach(function (r) {
      var gn = r && r.goal_name != null ? String(r.goal_name).trim() : '';
      if (gn && uniqueGoalNames.indexOf(gn) === -1) uniqueGoalNames.push(gn);
    });
    var now = new Date();
    var monthLabels = [];
    var sums = [];
    var matchedRowCount = 0;
    for (var i = 0; i < 12; i++) {
      var d = new Date(now.getFullYear(), now.getMonth() - 12 + i, 1);
      var y = d.getFullYear();
      var m = d.getMonth();
      monthLabels.push(d.toLocaleString('default', { month: 'short' }) + ' ' + y);
      sums.push(0);
    }
    var rowsMatchingPrefix = [];
    var sampleDatesForPrefix = [];
    var nullDateCount = 0;
    var badDateCount = 0;
    values.forEach(function (row) {
      var rowGoal = row.goal_name != null ? String(row.goal_name).trim() : '';
      if (!prefix || rowGoal.toLowerCase() !== prefix.toLowerCase()) return;
      rowsMatchingPrefix.push(row);
      var dateVal = row.date;
      if (dateVal == null || (typeof dateVal === 'string' && dateVal.trim() === '')) {
        nullDateCount++;
        return;
      }
      var dateStr = typeof dateVal === 'string' ? dateVal : String(dateVal);
      if (dateStr.indexOf('T') !== -1) dateStr = dateStr.slice(0, 10);
      else dateStr = dateStr.slice(0, 10);
      if (!dateStr || dateStr.length < 7) {
        badDateCount++;
        return;
      }
      var parts = dateStr.split('-');
      if (parts.length < 2) {
        badDateCount++;
        return;
      }
      var rowYear = parseInt(parts[0], 10);
      var rowMonth = parseInt(parts[1], 10) - 1;
      if (sampleDatesForPrefix.length < 5) sampleDatesForPrefix.push({ raw: row.date, parsed: dateStr, y: rowYear, m: rowMonth });
      for (var j = 0; j < 12; j++) {
        var d2 = new Date(now.getFullYear(), now.getMonth() - 12 + j, 1);
        if (rowYear === d2.getFullYear() && rowMonth === d2.getMonth()) {
          var v = parseFloat(row.value);
          if (!isNaN(v)) {
            sums[j] += v;
            matchedRowCount++;
          }
          break;
        }
      }
    });
    if (matchedRowCount === 0 && values.length > 0 && prefix) {
      if (rowsMatchingPrefix.length === 0) {
        console.warn('[Goal2 chart] No rows matched. Prefix we looked for:', JSON.stringify(prefix), '| goal_name values in API:', uniqueGoalNames);
      } else {
        console.warn('[Goal2 chart] Rows matched prefix but 0 counted. Date range shown above. Check if your data dates fall in range. Rows matching prefix:', rowsMatchingPrefix.length, '| sample dates:', sampleDatesForPrefix);
      }
    }
    if (typeof Chart === 'undefined') {
      console.error('[Goal2 chart] Chart.js not loaded');
      titleEl.textContent = 'Goal 2 (error: Chart.js not loaded)';
      return;
    }
    if (goal2ChartInstance) {
      goal2ChartInstance.destroy();
      goal2ChartInstance = null;
    }
    goal2ChartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: monthLabels,
        datasets: [{
          label: goal2Name || 'Goal 2',
          data: sums,
          backgroundColor: 'rgba(255, 99, 132, 0.6)',
          borderColor: 'rgba(255, 99, 132, 1)',
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
    var errMsg = err && (err.message || String(err));
    console.error('[Goal2 chart] Error:', errMsg, err);
    if (titleEl) titleEl.textContent = 'Goal 2 (error: ' + (errMsg || 'unknown') + ')';
  }
}
