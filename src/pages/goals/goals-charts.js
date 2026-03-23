/** Goal 1 bar chart (Chart.js). Uses goalToSlug for matching goals_values rows. */
var goal1ChartInstance = null;
/** Weight line chart (goal 3 slot) — uses getGoalIdPrefixForIndex from goals-slugs.js */
var weightLineChartInstance = null;

function normalizeGoalValueDateToYMD(val) {
  if (val == null) return null;
  if (typeof val === 'string') {
    var s = val.trim();
    if (!s) return null;
    if (s.indexOf('T') !== -1) return s.slice(0, 10);
    return s.length >= 10 ? s.slice(0, 10) : null;
  }
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return (
      val.getFullYear() +
      '-' +
      String(val.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(val.getDate()).padStart(2, '0')
    );
  }
  var s2 = String(val).trim();
  if (!s2) return null;
  if (s2.indexOf('T') !== -1) return s2.slice(0, 10);
  return s2.length >= 10 ? s2.slice(0, 10) : null;
}
/** YYYY-MM-DD plus delta calendar days. */
function ymdAddDays(ymd, delta) {
  var p = ymd.split('-');
  var dt = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  dt.setDate(dt.getDate() + delta);
  return (
    dt.getFullYear() +
    '-' +
    String(dt.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(dt.getDate()).padStart(2, '0')
  );
}
/** Mean of byDate values on endYmd and the 6 prior days (only days with a value count). */
function averageWeightLast7Days(byDate, endYmd) {
  var sum = 0;
  var cnt = 0;
  for (var k = 0; k < 7; k++) {
    var key = ymdAddDays(endYmd, k - 6);
    if (byDate[key] != null) {
      sum += byDate[key];
      cnt++;
    }
  }
  return cnt > 0 ? sum / cnt : null;
}
/** X-axis label: e.g. 5-Mar-25 */
function formatAxisDateDMMMYY(date) {
  var dayNum = date.getDate();
  var mmm = date.toLocaleString('en-US', { month: 'short' });
  var yy = String(date.getFullYear()).slice(-2);
  return dayNum + '-' + mmm + '-' + yy;
}
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

/**
 * Weight line chart: uses goal 3 from goals_list, loads goals_values from the API (Supabase),
 * plots a 7-day rolling average (each point = mean of that day and the 6 prior days with data).
 * Requires #weight-line-graph (canvas) and #weight-chart-title; uses getGoalIdPrefixForIndex(goalsRow, 3).
 */
async function loadWeightLineChart() {
  var titleEl = document.getElementById('weight-chart-title');
  var canvas = document.getElementById('weight-line-graph');
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
  } catch (e) {
    return;
  }
  if (!userEmail) {
    titleEl.textContent = 'Weight (log in to load)';
    return;
  }
  try {
    var goalsRes = await fetch('/api/goals?user_id=' + encodeURIComponent(userEmail));
    if (!goalsRes.ok) return;
    var goalsRow = await goalsRes.json();
    var goal3Name =
      goalsRow && goalsRow.goal3 != null && String(goalsRow.goal3).trim() !== ''
        ? String(goalsRow.goal3).trim()
        : null;
    var prefix =
      typeof getGoalIdPrefixForIndex === 'function' ? getGoalIdPrefixForIndex(goalsRow || {}, 3) : '';
    titleEl.textContent = goal3Name
      ? 'Weight (7-day avg)'
      : 'Weight (none set — add goal 3)';
    if (!prefix) {
      if (weightLineChartInstance) {
        weightLineChartInstance.destroy();
        weightLineChartInstance = null;
      }
      return;
    }
    var gvRes = await fetch(
      '/api/goals/values?user_id=' +
        encodeURIComponent(userEmail) +
        '&goal_name=' +
        encodeURIComponent('weight')
    );
    var values = gvRes.ok ? await gvRes.json() : [];
    if (!Array.isArray(values)) values = [];
    var byDate = {};
    values.forEach(function (row) {
      var d = normalizeGoalValueDateToYMD(row.date);
      if (!d) return;
      var v = parseFloat(row.value);
      if (!isNaN(v) && v !== 0) byDate[d] = v;
    });
    var labels = [];
    var dataPoints = [];
    for (var i = values.length - 1; i >= 0; i--) {
      var d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      var key = y + '-' + m + '-' + day;
      labels.push(formatAxisDateDMMMYY(d));
      dataPoints.push(averageWeightLast7Days(byDate, key));
    }
    var yMin = null;
    var yMax = null;
    dataPoints.forEach(function (pt) {
      if (pt != null && !isNaN(pt)) {
        if (yMin === null || pt < yMin) yMin = pt;
        if (yMax === null || pt > yMax) yMax = pt;
      }
    });
    var yScale = { beginAtZero: false };
    if (yMin !== null && yMax !== null) {
      if (yMin === yMax) {
        var spread = Math.max(Math.abs(yMin) * 0.02, 0.5);
        yScale.min = yMin - spread;
        yScale.max = yMax + spread;
      } else {
        yScale.min = yMin;
        yScale.max = yMax;
      }
    }
    if (weightLineChartInstance) {
      weightLineChartInstance.destroy();
      weightLineChartInstance = null;
    }
    if (typeof Chart === 'undefined') {
      titleEl.textContent = 'Weight (Chart.js missing)';
      return;
    }
    weightLineChartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: (goal3Name || 'Weight') + ' (7-day avg)',
            data: dataPoints,
            borderColor: 'rgba(75, 192, 192, 1)',
            backgroundColor: 'rgba(75, 192, 192, 0.15)',
            borderWidth: 2,
            fill: true,
            tension: 0.25,
            spanGaps: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: yScale,
          x: { ticks: { maxRotation: 45, minRotation: 0, autoSkip: true, maxTicksLimit: 10 } }
        },
        plugins: { legend: { display: true } }
      }
    });
  } catch (err) {
    console.error('Error loading weight line chart:', err);
    if (titleEl) titleEl.textContent = 'Weight (error loading)';
  }
}
