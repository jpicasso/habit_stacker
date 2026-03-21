/**
 * DOM helpers used by stopwatch, working table, and calories flows.
 * Load after goals-working-calories.js (and auth-bridge); before goals-dom-init-*.js.
 */
async function saveMinutesValueToSupabase() {
  var minutesTd = document.getElementById('minutes_value');
  if (!minutesTd) return;
  var box = minutesTd.querySelector('.goals-cell-box');
  var value = (box ? box.textContent : minutesTd.textContent || '').trim();
  saveTemporaryToSupabase('minutes_value', value);
}

async function submitTimeWorked() {
  var minutesTd = document.getElementById('minutes_value');
  var minutesBox = minutesTd ? minutesTd.querySelector('.goals-cell-box') : null;
  var minutesStr = (minutesBox ? minutesBox.textContent : (minutesTd && minutesTd.textContent) || '').trim().replace(/,/g, '');
  var minutesNum = parseFloat(minutesStr);
  if (isNaN(minutesNum)) minutesNum = 0;
  var value = (minutesNum * 1.3) / 60;
  var today = new Date();
  var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  var tbody = document.querySelector('#goals-table tbody');
  if (!tbody) return;
  var cells = tbody.querySelectorAll('td[id]');
  var targetCell = null;
  for (var i = 0; i < cells.length; i++) {
    var id = cells[i].id;
    if (id.toLowerCase().indexOf('hours') !== -1 && id.endsWith('-' + todayStr)) {
      targetCell = cells[i];
      break;
    }
  }
  if (!targetCell) {
    alert('No goal cell found for "Hours" and today\'s date (' + todayStr + '). Add a goal whose name contains "Hours" and ensure the goals table shows this week.');
    return;
  }
  var goalName = targetCell.id.replace(/-\d{4}-\d{2}-\d{2}$/, '');
  var box = targetCell.querySelector('.goals-cell-box');
  var displayVal = value % 1 === 0 ? String(value) : value.toFixed(2);
  if (box) box.textContent = displayVal; else targetCell.textContent = displayVal;
  if (typeof setGoalsFormat === 'function') setGoalsFormat();
  var userEmail = null;
  try {
    if (window.auth0) {
      var isAuth = await window.auth0.isAuthenticated();
      if (isAuth) {
        var user = await window.auth0.getUser();
        userEmail = user && (user.email || user.nickname || user.sub) || null;
      }
    }
  } catch (err) {
    console.error('Error getting user for submit time worked:', err);
  }
  if (userEmail) {
    try {
      var res = await fetch('/api/goals/values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userEmail, goal_name: goalName, value: value, date: todayStr })
      });
      if (!res.ok) {
        var errBody = await res.json().catch(function () { return {}; });
        var msg = (errBody && errBody.error) || res.statusText || 'Failed to save';
        alert('Could not save: ' + msg);
      }
    } catch (err) {
      console.error('Error saving goal value:', err);
      alert('Could not save. Check console.');
    }
  }
}

async function submitTodaysCalories() {
  var totalEl = document.getElementById('total-calories');
  var raw = (totalEl && totalEl.textContent ? totalEl.textContent : '').trim().replace(/,/g, '');
  var value = parseFloat(raw);
  if (isNaN(value)) value = 0;
  var today = new Date();
  var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  var tbody = document.querySelector('#goals-table tbody');
  if (!tbody) return;
  var cells = tbody.querySelectorAll('td[id]');
  var targetCell = null;
  for (var i = 0; i < cells.length; i++) {
    var id = cells[i].id;
    if (id.toLowerCase().indexOf('calories') !== -1 && id.endsWith('-' + todayStr)) {
      targetCell = cells[i];
      break;
    }
  }
  if (!targetCell) {
    alert('No goal cell found for "Calories" and today\'s date (' + todayStr + '). Add a goal whose name contains "Calories" and ensure the goals table shows this week.');
    return;
  }
  var goalName = targetCell.id.replace(/-\d{4}-\d{2}-\d{2}$/, '');
  var box = targetCell.querySelector('.goals-cell-box');
  if (box) box.textContent = value;
  if (typeof setGoalsFormat === 'function') setGoalsFormat();
  var userEmail = null;
  try {
    if (window.auth0) {
      var isAuth = await window.auth0.isAuthenticated();
      if (isAuth) {
        var user = await window.auth0.getUser();
        userEmail = user && (user.email || user.nickname || user.sub) || null;
      }
    }
  } catch (err) {
    console.error('Error getting user for submit calories:', err);
  }
  if (userEmail) {
    try {
      var res = await fetch('/api/goals/values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userEmail, goal_name: goalName, value: value, date: todayStr })
      });
      if (!res.ok) {
        var errBody = await res.json().catch(function () { return {}; });
        var msg = (errBody && errBody.error) || res.statusText || 'Failed to save';
        alert('Could not save: ' + msg);
      }
    } catch (err) {
      console.error('Error saving goal value:', err);
      alert('Could not save. Check console.');
    }
  }
  if (typeof getDeltaValue === 'function') getDeltaValue();
}
