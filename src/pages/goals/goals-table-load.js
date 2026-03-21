/** Fetch goals_list + goals_values, build #goals-table rows; addGoalForm POSTs new goals. */
async function loadGoals() {
  const tbody = document.querySelector('#goals-table tbody');
  if (!tbody) {
    return;
  }
  let userEmail = null;
  try {
    if (window.auth0) {
      const isAuthenticated = await window.auth0.isAuthenticated();
      if (isAuthenticated) {
        const user = await window.auth0.getUser();
        userEmail = user?.email || user?.nickname || user?.sub || null;
      }
    }
  } catch (err) {
    console.error('Error getting user for goals:', err);
    return;
  }
  if (!userEmail) {
    return;
  }
  try {
    const goalsUrl = '/api/goals?user_id=' + encodeURIComponent(userEmail);
    const response = await fetch(goalsUrl);
    if (!response.ok) {
      return;
    }
    const row = await response.json();
    if (!row) {
      return;
    }
    // Build list of non-empty goal values with column index (goal1 .. goal8)
    const goals = [];
    for (let i = 1; i <= 8; i++) {
      const val = row['goal' + i];
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        goals.push({ value: String(val).trim(), columnIndex: i });
      }
    }
    // Header keys in table order (Goal, Sun, Mon, Tue, Wed, Thu, Fri, Sat, Total, ><, Target, Delta)
    var headerKeys = ['goal', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'total', 'plusMinus', 'target', 'delta'];
    function goalToIdPrefix(goalText) {
      var s = goalText.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      return s || 'goal';
    }
    // Build date strings for Sun..Sat from goals-table-date-input (Sun = base, Mon = +1, ..., Sat = +6)
    var dateInputEl = document.getElementById('goals-table-date-input');
    function getRecentSundayISO() {
      var d = new Date();
      d.setDate(d.getDate() - d.getDay());
      var yyyy = d.getFullYear();
      var mm = String(d.getMonth() + 1).padStart(2, '0');
      var dd = String(d.getDate()).padStart(2, '0');
      return yyyy + '-' + mm + '-' + dd;
    }
    var baseDateVal = dateInputEl && dateInputEl.value ? dateInputEl.value.trim() : getRecentSundayISO();
    var dayDateStrs = [];
    for (var d = 0; d < 7; d++) {
      var dObj = new Date(baseDateVal + 'T12:00:00');
      if (isNaN(dObj.getTime())) {
        dObj = new Date(getRecentSundayISO() + 'T12:00:00');
      }
      dObj.setDate(dObj.getDate() + d);
      dayDateStrs.push(dObj.getFullYear() + '-' + String(dObj.getMonth() + 1).padStart(2, '0') + '-' + String(dObj.getDate()).padStart(2, '0'));
    }
    // Remove existing rows and add one row per goal
    tbody.innerHTML = '';
    if (goals.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>Add your first goal</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>';
      tbody.appendChild(tr);
    } else {
      var slugCount = {};
      var rowSlugDebug = [];
      goals.forEach(function (goal) {
        var goalText = goal.value;
        var base = goalToIdPrefix(goalText);
        if (slugCount[base] !== undefined) {
          slugCount[base]++;
          base = base + '-' + slugCount[base];
        } else {
          slugCount[base] = 0;
        }
        rowSlugDebug.push({ goalColumn: goal.columnIndex, displayName: goalText, idPrefix: base });
        var tr = document.createElement('tr');
        tr.dataset.goalIndex = String(goal.columnIndex);
        var dayOrTargetKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'target'];
        function idSuffixForHeader(headerKey, colIndex) {
          if (headerKey === 'sun') return dayDateStrs[0];
          if (headerKey === 'mon') return dayDateStrs[1];
          if (headerKey === 'tue') return dayDateStrs[2];
          if (headerKey === 'wed') return dayDateStrs[3];
          if (headerKey === 'thu') return dayDateStrs[4];
          if (headerKey === 'fri') return dayDateStrs[5];
          if (headerKey === 'sat') return dayDateStrs[6];
          return headerKey;
        }
        headerKeys.forEach(function (headerKey, colIndex) {
          var td = document.createElement('td');
          if (headerKey === 'plusMinus') {
            td.id = base + '><';
          } else {
            td.id = base + '-' + idSuffixForHeader(headerKey, colIndex);
          }
          if (colIndex === 0) {
            td.textContent = goalText;
            td.classList.add('goals-goal-cell');
            td.setAttribute('role', 'button');
            td.setAttribute('tabindex', '0');
            td.style.cursor = 'pointer';
          } else if (dayOrTargetKeys.indexOf(headerKey) !== -1) {
            var box = document.createElement('span');
            box.className = 'goals-cell-box' + (headerKey === 'target' ? ' goals-cell-box-target' : '');
            box.setAttribute('role', 'button');
            box.setAttribute('tabindex', '0');
            td.appendChild(box);
          } else if (headerKey === 'plusMinus') {
            var box = document.createElement('span');
            box.className = 'goals-cell-box goals-cell-box-plusminus';
            box.setAttribute('role', 'button');
            box.setAttribute('tabindex', '0');
            td.appendChild(box);
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      // Populate day cells from goals_values (user_id + goal_name + date match).
      // API filters to week_start <= date < week_start+8d when week_start is set (matches #goals-table-date-input Sunday).
      try {
        var valuesUrl =
          '/api/goals/values?user_id=' +
          encodeURIComponent(userEmail) +
          '&week_start=' +
          encodeURIComponent(baseDateVal);
        const gvRes = await fetch(valuesUrl);
        console.log('gvRes', gvRes);
        if (gvRes.ok) {
          const goalValues = await gvRes.json();
          console.log('goalValues', goalValues);
          var arr = Array.isArray(goalValues) ? goalValues : [];
          var uniqNames = [];
          for (var u = 0; u < arr.length; u++) {
            var gn = arr[u] && arr[u].goal_name != null ? String(arr[u].goal_name).trim() : '';
            if (gn && uniqNames.indexOf(gn) === -1) uniqNames.push(gn);
          }
          var allTds = tbody.querySelectorAll('td[id]');
          function normalizeGoalValuesDate(val) {
            if (val == null) return null;
            if (typeof val === 'string') {
              var s = val.trim();
              if (!s) return null;
              if (s.indexOf('T') !== -1) return s.slice(0, 10);
              return s;
            }
            if (val instanceof Date) {
              if (isNaN(val.getTime())) return null;
              var yyyy = val.getFullYear();
              var mm = String(val.getMonth() + 1).padStart(2, '0');
              var dd = String(val.getDate()).padStart(2, '0');
              return yyyy + '-' + mm + '-' + dd;
            }
            var s2 = String(val).trim();
            if (!s2) return null;
            if (s2.indexOf('T') !== -1) return s2.slice(0, 10);
            return s2.slice(0, 10);
          }
          var dayCellsChecked = 0;
          var dayCellsFilled = 0;
          var noMatchSamples = [];
          for (var i = 0; i < allTds.length; i++) {
            var td = allTds[i];
            var id = td.id;
            var dateMatch = id.match(/-(\d{4}-\d{2}-\d{2})$/);
            if (!dateMatch) continue;
            dayCellsChecked++;
            var goalName = id.replace(/-\d{4}-\d{2}-\d{2}$/, '');
            var dateStr = dateMatch[1];
            var goalNameNorm = goalName != null ? String(goalName).trim().toLowerCase() : '';
            var r = arr.find(function (row) {
              var rowGoalNorm = row.goal_name != null ? String(row.goal_name).trim().toLowerCase() : '';
              var rDateNorm = normalizeGoalValuesDate(row.date);
              return rowGoalNorm === goalNameNorm && rDateNorm === dateStr;
            });
            if (r && r.value != null) {
              var box = td.querySelector('.goals-cell-box');
              if (box) box.textContent = r.value;
              dayCellsFilled++;
            } else if (noMatchSamples.length < 8) {
              noMatchSamples.push({ cellId: id, expectedGoalName: goalName, expectedDate: dateStr, hint: 'No goals_values row matching goal_name (case-insensitive) + date YYYY-MM-DD; compare idPrefix to unique goal_name list above' });
            }
          }
        } 
      } catch (e) {
        console.error('Error populating goal values:', e);
      }
      // Populate target cells (blue boxes) from local_goal_targets
      try {
        var localTargetsJson = await getTemporaryFromSupabase('local_goal_targets');
        if (localTargetsJson == null) localTargetsJson = localStorage.getItem('local_goal_targets');
        var localTargets = localTargetsJson ? JSON.parse(localTargetsJson) : {};
        var allTdsTarget = tbody.querySelectorAll('td[id$="-target"]');
        for (var i = 0; i < allTdsTarget.length; i++) {
          var td = allTdsTarget[i];
          if (localTargets[td.id] != null) {
            var targetBox = td.querySelector('.goals-cell-box');
            if (targetBox) targetBox.textContent = localTargets[td.id];
          }
        }
      } catch (e) {
        console.error('Error populating local goal targets:', e);
      }
      // Populate plusMinus (grey) boxes from goals_targets_plusMinus
      try {
        var plusMinusJson = await getTemporaryFromSupabase('goals_targets_plusMinus');
        if (plusMinusJson == null) plusMinusJson = localStorage.getItem('goals_targets_plusMinus');
        var plusMinusData = plusMinusJson ? JSON.parse(plusMinusJson) : {};
        var allTdsPlusMinus = tbody.querySelectorAll('td[id$="><"]');
        for (var i = 0; i < allTdsPlusMinus.length; i++) {
          var td = allTdsPlusMinus[i];
          if (plusMinusData[td.id] != null) {
            var pmBox = td.querySelector('.goals-cell-box-plusminus');
            if (pmBox) pmBox.textContent = plusMinusData[td.id];
          }
        }
      } catch (e) {
        console.error('Error populating goals_targets_plusMinus:', e);
      }
      // Set total cell for each row: sum of day cells (strip commas before parse so "1,200" -> 1200)
      var rows = tbody.querySelectorAll('tr[data-goal-index]');
      for (var r = 0; r < rows.length; r++) {
        var cells = rows[r].querySelectorAll('td');
        if (cells.length < 9) continue;
        var sum = 0;
        for (var c = 1; c <= 7; c++) {
          var box = cells[c].querySelector('.goals-cell-box');
          var text = (box ? box.textContent : cells[c].textContent || '').trim().replace(/,/g, '');
          var n = parseFloat(text);
          if (!isNaN(n)) sum += n;
        }
        cells[8].textContent = sum;
      }
        getDeltaValue();
        if (typeof setGoalsFormat === 'function') setGoalsFormat();
        if (typeof loadGoal1Chart === 'function') loadGoal1Chart();
    }
  } catch (err) {
    console.error('Error loading goals:', err);
  }
}

async function addGoalForm(e) {
  e.preventDefault();
  const goalInput = document.getElementById('goal-input');
  const form = document.getElementById('goal-form');
  const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
  const new_goal = goalInput ? goalInput.value.trim() : '';
  if (!new_goal) return;
  let userEmail = null;
  try {
    if (window.auth0) {
      const isAuthenticated = await window.auth0.isAuthenticated();
      if (isAuthenticated) {
        const user = await window.auth0.getUser();
        userEmail = user?.email || user?.nickname || user?.sub || null;
      }
    }
  } catch (err) {
    console.error('Error getting user:', err);
  }
  if (!userEmail) {
    alert('Please log in to add a goal.');
    return;
  }
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
  }
  try {
    const response = await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userEmail, goal: new_goal })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Failed to add goal');
    }
    if (goalInput) goalInput.value = '';
    await loadGoals();
  } catch (error) {
    console.error('Error adding goal:', error);
    alert(error.message || 'Failed to add goal. Please try again.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit';
    }
  }
}
