/**
 * DOMContentLoaded: module pills, stopwatch, working table, calories, goals table modals and forms.
 */
document.addEventListener('DOMContentLoaded', async () => {
  var saved = await getTemporaryFromSupabase('module_visibility');
  if (saved != null && saved !== '') {
    try {
      var parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        var k;
        for (k in parsed) {
          if (moduleVisibility.hasOwnProperty(k) && (parsed[k] === 'show' || parsed[k] === 'hide')) {
            moduleVisibility[k] = parsed[k];
          }
        }
      }
    } catch (e) { /* ignore */ }
  }
  var pillsContainer = document.getElementById('habit-stacker-nav-pills');
  if (pillsContainer) {
    pillsContainer.addEventListener('click', function (e) {
      var pill = e.target.closest('a.nav-link[id$="-pill"]');
      if (!pill) return;
      e.preventDefault();
      var moduleId = pill.id.slice(0, -5);
      if (moduleVisibility.hasOwnProperty(moduleId)) {
        moduleVisibility[moduleId] = moduleVisibility[moduleId] === 'show' ? 'hide' : 'show';
        applyModuleVisibility();
        saveModuleVisibilityToSupabase();
      }
    });
  }
  applyModuleVisibility();
  await updateCaloriesTableFromLocal();
  var minutesVal = await getTemporaryFromSupabase('minutes_value');
  if (minutesVal == null) {
    var fromLocal = localStorage.getItem('minutes_value');
    if (fromLocal !== null && fromLocal !== '') minutesVal = fromLocal;
    if (minutesVal == null) {
      var workingJson = localStorage.getItem('working_values');
      if (workingJson) try { var w = JSON.parse(workingJson); if (w && w.minutes_value != null) minutesVal = w.minutes_value; } catch (e) {} 
    }
  }
  setMinutesValueCell(minutesVal);
  var workingJson = await getTemporaryFromSupabase('working_values');
  if (workingJson == null) workingJson = localStorage.getItem('working_values');
  if (workingJson) {
    try {
      var working = JSON.parse(workingJson);
      localStorage.setItem('working_values', workingJson);
      if (working.daily_hours_value != null) {
        var hoursTd = document.getElementById('daily-hours-value');
        if (hoursTd) {
          var displayVal = String(working.daily_hours_value);
          if (displayVal.indexOf('.') === -1) displayVal += '.0';
          var box = hoursTd.querySelector('.goals-cell-box');
          if (box) box.textContent = displayVal; else hoursTd.textContent = displayVal;
        }
      }
      if (working.working_start != null) {
        var startTd = document.getElementById('working_start');
        if (startTd) {
          var box = startTd.querySelector('.goals-cell-box');
          if (box) box.textContent = working.working_start; else startTd.textContent = working.working_start;
        }
      }
    } catch (e) { /* ignore parse error */ }
  }
  if (typeof updateExpectedDoneValue === 'function') updateExpectedDoneValue();
  if (typeof setGoalsFormat === 'function') setGoalsFormat();
  if (typeof updateProjectedDoneValue === 'function') updateProjectedDoneValue();
  if (typeof updateDeltaToExpectedDone === 'function') updateDeltaToExpectedDone();
  (async function initStopwatch() {
    var stopwatchElapsed = 0;
    var stopwatchStartTime = null;
    var stopwatchIntervalId = null;
    var displayEl = document.getElementById('stopwatch-display');
    var savedStart = await getTemporaryFromSupabase('stopwatch_start_time');
    if (savedStart != null && savedStart !== '') {
      var ts = parseFloat(String(savedStart).trim());
      if (!isNaN(ts)) {
        stopwatchStartTime = ts;
        stopwatchIntervalId = setInterval(stopwatchTick, 1000);
        stopwatchTick();
      }
    }
    function formatStopwatch(seconds) {
      var h = Math.floor(seconds / 3600);
      var m = Math.floor((seconds % 3600) / 60);
      var s = Math.floor(seconds % 60);
      return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
    function getCurrentElapsedSeconds() {
      if (stopwatchStartTime === null) return stopwatchElapsed;
      return stopwatchElapsed + (Date.now() - stopwatchStartTime) / 1000;
    }
    function stopwatchTick() {
      if (displayEl) displayEl.textContent = formatStopwatch(getCurrentElapsedSeconds());
    }
    document.getElementById('stopwatch-start') && document.getElementById('stopwatch-start').addEventListener('click', function () {
      if (stopwatchIntervalId !== null) return;
      stopwatchStartTime = Date.now();
      saveTemporaryToSupabase('stopwatch_start_time', String(stopwatchStartTime));
      stopwatchIntervalId = setInterval(stopwatchTick, 1000);
      stopwatchTick();
    });
    document.getElementById('stopwatch-pause') && document.getElementById('stopwatch-pause').addEventListener('click', function () {
      if (stopwatchIntervalId !== null) {
        stopwatchElapsed = getCurrentElapsedSeconds();
        stopwatchStartTime = null;
        clearInterval(stopwatchIntervalId);
        stopwatchIntervalId = null;
        if (displayEl) displayEl.textContent = formatStopwatch(stopwatchElapsed);
      }
    });
    document.getElementById('stopwatch-reset') && document.getElementById('stopwatch-reset').addEventListener('click', function () {
      if (stopwatchIntervalId !== null) {
        clearInterval(stopwatchIntervalId);
        stopwatchIntervalId = null;
      }
      stopwatchElapsed = 0;
      stopwatchStartTime = null;
      saveTemporaryToSupabase('stopwatch_start_time', '');
      if (displayEl) displayEl.textContent = formatStopwatch(0);
    });
    document.getElementById('stopwatch-submit') && document.getElementById('stopwatch-submit').addEventListener('click', function () {
      var minutesToAdd = getCurrentElapsedSeconds() / 60;
      var minutesTd = document.getElementById('minutes_value');
      if (!minutesTd) return;
      var box = minutesTd.querySelector('.goals-cell-box');
      var currentStr = (box ? box.textContent : minutesTd.textContent || '').trim().replace(/,/g, '');
      var current = parseFloat(currentStr);
      if (isNaN(current)) current = 0;
      var newVal = Math.round(current + minutesToAdd);
      var newValStr = String(newVal);
      if (box) box.textContent = newValStr; else minutesTd.textContent = newValStr;
      // Persist minutes_value any time it changes
      saveMinutesValueToSupabase();
      if (typeof updateProjectedDoneValue === 'function') updateProjectedDoneValue();
      if (typeof updateDeltaToExpectedDone === 'function') updateDeltaToExpectedDone();
      submitTimeWorked();
      saveTemporaryToSupabase('stopwatch_start_time', '');
    });
  })();
  var caloriesTbody = document.querySelector('#calories-today-table tbody');
  if (caloriesTbody) {
    caloriesTbody.addEventListener('click', function (e) {
      var tr = e.target.closest('tr');
      if (!tr || tr.parentNode !== caloriesTbody) return;
      if (tr === caloriesTbody.lastElementChild) return;
      var tds = tr.querySelectorAll('td');
      if (tds.length < 2) return;
      var mealCell = tds[0];
      var caloriesCell = tds[1];
      if (!mealCell.id || !caloriesCell.id) return;
      currentCaloriesEdit = { mealId: mealCell.id, caloriesId: caloriesCell.id };
      document.getElementById('calories-edit-meal-id-label').textContent = mealCell.id;
      document.getElementById('calories-edit-calories-id-label').textContent = caloriesCell.id;
      document.getElementById('calories-edit-meal-input').value = (mealCell.textContent || '').trim();
      document.getElementById('calories-edit-calories-input').value = (caloriesCell.textContent || '').trim();
      $('#caloriesRowEditModal').modal('show');
    });
  }
  var caloriesRowEditForm = document.getElementById('calories-row-edit-form');
  if (caloriesRowEditForm) {
    caloriesRowEditForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var mealVal = (document.getElementById('calories-edit-meal-input').value || '').trim();
      var caloriesVal = (document.getElementById('calories-edit-calories-input').value || '').trim();
      var json = await getTemporaryFromSupabase('calories_today_local');
      if (json == null) json = localStorage.getItem('calories_today_local');
      var data = json ? JSON.parse(json) : {};
      data[currentCaloriesEdit.mealId] = mealVal;
      data[currentCaloriesEdit.caloriesId] = caloriesVal;
      try {
        var caloriesJson = JSON.stringify(data);
        localStorage.setItem('calories_today_local', caloriesJson);
        // Mirror to Supabase temporary_variables
        saveTemporaryToSupabase('calories_today_local', caloriesJson);
      } catch (err) {
        console.error('Error saving calories_today_local:', err);
      }
      await updateCaloriesTableFromLocal();
      currentCaloriesEdit = { mealId: null, caloriesId: null };
      $('#caloriesRowEditModal').modal('hide');
      submitTodaysCalories();
    });
  }
  var workingTable = document.getElementById('working-table');
  if (workingTable) {
    workingTable.addEventListener('click', function (e) {
      var box = e.target.closest('.goals-cell-box');
      if (!box) return;
      var td = box.closest('td');
      if (!td || !td.id) return;
      if (td.id === 'minutes_value') {
        var minutesInput = document.getElementById('minutes-work-input');
        if (minutesInput) minutesInput.value = (box.textContent || '').trim() || '0';
        $('#minutesWorkModal').modal('show');
      } else if (td.id === 'daily-hours-value') {
        var dailyHoursInput = document.getElementById('daily-hours-input');
        if (dailyHoursInput) dailyHoursInput.value = (box.textContent || '').trim() || '';
        $('#dailyHoursModal').modal('show');
      } else if (td.id === 'working_start') {
        var startInput = document.getElementById('working-start-input');
        if (startInput) startInput.value = (box.textContent || '').trim() || '';
        $('#workingStartModal').modal('show');
      }
    });
  }
  // Persist minutes_value to Supabase temporary_variables whenever it changes
  async function saveMinutesValueToSupabase() {
    var minutesTd = document.getElementById('minutes_value');
    if (!minutesTd) return;
    var box = minutesTd.querySelector('.goals-cell-box');
    var value = (box ? box.textContent : minutesTd.textContent || '').trim();
    saveTemporaryToSupabase('minutes_value', value);
  }

  /// put the cursor in the input field when the modal is shown and highlight value
  $('#minutesWorkModal').on('shown.bs.modal', function () {
    var el = document.getElementById('minutes-work-input');
    if (el) { el.focus(); el.select(); }
  });
  $('#dailyHoursModal').on('shown.bs.modal', function () {
    var el = document.getElementById('daily-hours-input');
    if (el) { el.focus(); el.select(); }
  });
  $('#workingStartModal').on('shown.bs.modal', function () {
    var el = document.getElementById('working-start-input');
    if (el) { el.focus(); el.select(); }
  });
  $('#goalsCellModal').on('shown.bs.modal', function () {
    var el = document.getElementById('goals-cell-value-input');
    if (el) { el.focus(); el.select(); }
  });
  $('#goalEditModal').on('shown.bs.modal', function () {
    var el = document.getElementById('goal-edit-value-input');
    if (el) { el.focus(); el.select(); }
  });
  $('#plusMinusModal').on('shown.bs.modal', function () {
    var el = document.getElementById('plusminus-select');
    if (el) el.focus();
  });
  $('#caloriesRowEditModal').on('shown.bs.modal', function () {
    var el = document.getElementById('calories-edit-calories-input');
    if (el) { el.focus(); el.select(); }
  });
  /// ^^^ end of put the cursor in...
  var minutesWorkForm = document.getElementById('minutes-work-form');
  if (minutesWorkForm) {
    minutesWorkForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var inputEl = document.getElementById('minutes-work-input');
      var minutesTd = document.getElementById('minutes_value');
      if (inputEl && minutesTd) {
        var box = minutesTd.querySelector('.goals-cell-box');
        var val = (inputEl.value || '').trim();
        var finalVal = val !== '' ? val : '0';
        if (box) box.textContent = finalVal; else minutesTd.textContent = finalVal;
        // Persist minutes_value any time it changes
        saveMinutesValueToSupabase();
        submitTimeWorked();
      }
      if (typeof updateProjectedDoneValue === 'function') updateProjectedDoneValue();
      if (typeof updateDeltaToExpectedDone === 'function') updateDeltaToExpectedDone();
      $('#minutesWorkModal').modal('hide');
    });
  }
  var dailyHoursForm = document.getElementById('daily-hours-form');
  if (dailyHoursForm) {
    dailyHoursForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var inputEl = document.getElementById('daily-hours-input');
      var td = document.getElementById('daily-hours-value');
      if (!inputEl || !td) {
        $('#dailyHoursModal').modal('hide');
        return;
      }
      var raw = (inputEl.value || '').trim();
      var num = parseFloat(raw);
      if (raw === '' || isNaN(num) || num < 0) {
        alert('Please enter a number with up to one decimal (e.g. 12.0).');
        inputEl.focus();
        return;
      }
      var val = Math.round(num * 10) / 10;
      var displayVal = String(val);
      if (displayVal.indexOf('.') === -1) displayVal += '.0';
      var box = td.querySelector('.goals-cell-box');
      if (box) box.textContent = displayVal; else td.textContent = displayVal;
      try {
        var workingJson = await getTemporaryFromSupabase('working_values');
        if (workingJson == null) workingJson = localStorage.getItem('working_values');
        var working = workingJson ? JSON.parse(workingJson) : {};
        working['daily_hours_value'] = displayVal;
        var newWorkingJson = JSON.stringify(working);
        localStorage.setItem('working_values', newWorkingJson);
        // Mirror to Supabase temporary_variables
        saveTemporaryToSupabase('working_values', newWorkingJson);
      } catch (err) {
        console.error('Error saving working_values:', err);
      }
      if (typeof updateExpectedDoneValue === 'function') updateExpectedDoneValue();
      if (typeof updateProjectedDoneValue === 'function') updateProjectedDoneValue();
      if (typeof updateDeltaToExpectedDone === 'function') updateDeltaToExpectedDone();
      $('#dailyHoursModal').modal('hide');
    });
  }
  var workingStartForm = document.getElementById('working-start-form');
  if (workingStartForm) {
    workingStartForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var inputEl = document.getElementById('working-start-input');
      var td = document.getElementById('working_start');
      if (!inputEl || !td) {
        $('#workingStartModal').modal('hide');
        return;
      }
      var normalized = normalizeWorkingTime(inputEl.value);
      if (!normalized) {
        alert('Please enter a time in the format H:MM AM or H:MM PM (e.g. 6:30 AM).');
        inputEl.focus();
        return;
      }
      var box = td.querySelector('.goals-cell-box');
      if (box) box.textContent = normalized; else td.textContent = normalized;
      try {
        var workingJson = await getTemporaryFromSupabase('working_values');
        
        if (workingJson == null) workingJson = localStorage.getItem('working_values');
        var working = workingJson ? JSON.parse(workingJson) : {};
        working['working_start'] = normalized;
        var newWorkingJson = JSON.stringify(working);
        localStorage.setItem('working_values', newWorkingJson);
        // Mirror to Supabase temporary_variables
        saveTemporaryToSupabase('working_values', newWorkingJson);
      } catch (err) {
        console.error('Error saving working_values:', err);
      }
      if (typeof updateExpectedDoneValue === 'function') updateExpectedDoneValue();
      if (typeof updateProjectedDoneValue === 'function') updateProjectedDoneValue();
      if (typeof updateDeltaToExpectedDone === 'function') updateDeltaToExpectedDone();
      $('#workingStartModal').modal('hide');
    });
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
  const goalForm = document.getElementById('goal-form');
  if (goalForm) {
    goalForm.addEventListener('submit', addGoalForm);
  }
  const goalsTableDateInput = document.getElementById('goals-table-date-input');
  if (goalsTableDateInput) {
    (function setGoalsDateToRecentSunday() {
      var d = new Date();
      d.setDate(d.getDate() - d.getDay());
      var yyyy = d.getFullYear();
      var mm = String(d.getMonth() + 1).padStart(2, '0');
      var dd = String(d.getDate()).padStart(2, '0');
      goalsTableDateInput.value = yyyy + '-' + mm + '-' + dd;
    })();
    goalsTableDateInput.addEventListener('change', function () {
      var val = this.value;
      if (val) {
        var d = new Date(val + 'T12:00:00');
        if (d.getDay() !== 0) {
          alert('The date should be a Sunday.');
          return;
        }
      }
      loadGoals();
    });
  }
  // Goals table: yellow box click shows cell id in dialog; form submits value into the box
  let currentGoalsCellId = null;
  // Goals table: plusMinus (grey) box
  let currentPlusMinusCellId = null;
  // Goals table: first column (goal name) click opens edit dialog
  let currentGoalEdit = { cellId: null, goalIndex: null, oldValue: null };
  const goalsTable = document.getElementById('goals-table');
  if (goalsTable) {
    function showPlusMinusModal(cell) {
      if (!cell || !cell.id) return;
      currentPlusMinusCellId = cell.id;
      var idEl = document.getElementById('plusminus-cell-id');
      if (idEl) idEl.textContent = cell.id;
      var box = cell.querySelector('.goals-cell-box-plusminus');
      var selectEl = document.getElementById('plusminus-select');
      if (selectEl) selectEl.value = (box && box.textContent.trim() === '>') ? '>' : '<';
      $('#plusMinusModal').modal('show');
    }
    function showGoalsCellModal(cell) {
      if (!cell || !cell.id) return;
      currentGoalsCellId = cell.id;
      const displayEl = document.getElementById('goals-cell-id-display');
      if (displayEl) displayEl.textContent = cell.id;
      const box = cell.querySelector('.goals-cell-box');
      const inputEl = document.getElementById('goals-cell-value-input');
      if (inputEl) inputEl.value = box && box.textContent.trim() !== '' ? box.textContent.trim() : '';
      $('#goalsCellModal').modal('show');
      if (inputEl) inputEl.focus();
    }
    async function showGoalEditModal(cell) {
      if (!cell || !cell.id) return;
      const row = cell.closest('tr');
      const goalIndex = row ? row.dataset.goalIndex : null;
      if (!goalIndex) return;
      currentGoalEdit = { cellId: cell.id, goalIndex: goalIndex, oldValue: (cell.textContent || '').trim() };
      const idEl = document.getElementById('goal-edit-cell-id');
      if (idEl) idEl.textContent = cell.id;
      const inputEl = document.getElementById('goal-edit-value-input');
      if (inputEl) inputEl.value = currentGoalEdit.oldValue;
      var slugFromName = function (name) { var s = String(name).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''); return s || 'goal'; };
      var goalsFormatJson = await getTemporaryFromSupabase('goals_format');
      if (goalsFormatJson == null) goalsFormatJson = localStorage.getItem('goals_format');
      var goalsFormat = goalsFormatJson ? JSON.parse(goalsFormatJson) : {};
      var formatSelect = document.getElementById('goals-cell-format-select');
      if (formatSelect) formatSelect.value = goalsFormat[slugFromName(currentGoalEdit.oldValue)] || 'text';
      $('#goalEditModal').modal('show');
      if (inputEl) inputEl.focus();
    }
    goalsTable.addEventListener('click', async function (e) {
      const goalCell = e.target.closest('.goals-goal-cell');
      if (goalCell) {
        showGoalEditModal(goalCell);
        return;
      }
      const box = e.target.closest('.goals-cell-box');
      if (!box) return;
      if (box.classList.contains('goals-cell-box-plusminus')) {
        showPlusMinusModal(box.closest('td'));
        return;
      }
      showGoalsCellModal(box.closest('td'));
    });
    goalsTable.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const goalCell = e.target.closest('.goals-goal-cell');
      if (goalCell) {
        e.preventDefault();
        showGoalEditModal(goalCell);
        return;
      }
      const box = e.target.closest('.goals-cell-box');
      if (!box) return;
      e.preventDefault();
      if (box.classList.contains('goals-cell-box-plusminus')) {
        showPlusMinusModal(box.closest('td'));
        return;
      }
      showGoalsCellModal(box.closest('td'));
    });
  }
  const plusminusForm = document.getElementById('plusminus-form');
  if (plusminusForm) {
    plusminusForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (currentPlusMinusCellId == null) return;
      var selectEl = document.getElementById('plusminus-select');
      var value = selectEl ? selectEl.value : '<';
      var cell = document.getElementById(currentPlusMinusCellId);
      if (cell) {
        var box = cell.querySelector('.goals-cell-box-plusminus');
        if (box) box.textContent = value;
      }
      var dataJson = await getTemporaryFromSupabase('goals_targets_plusMinus');
      if (dataJson == null) dataJson = localStorage.getItem('goals_targets_plusMinus');
      var data = dataJson ? JSON.parse(dataJson) : {};
      data[currentPlusMinusCellId] = value;
      try {
        var newPlusMinusJson = JSON.stringify(data);
        localStorage.setItem('goals_targets_plusMinus', newPlusMinusJson);
        // Mirror to Supabase temporary_variables
        saveTemporaryToSupabase('goals_targets_plusMinus', newPlusMinusJson);
      } catch (err) {
        console.error('Error saving goals_targets_plusMinus:', err);
      }
      currentPlusMinusCellId = null;
      $('#plusMinusModal').modal('hide');
    });
  }
  const goalsCellValueForm = document.getElementById('goals-cell-value-form');
  if (goalsCellValueForm) {
    goalsCellValueForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (currentGoalsCellId == null) return;
      const inputEl = document.getElementById('goals-cell-value-input');
      const value = inputEl ? inputEl.value.trim() : '';
      const goalName = /-\d{4}-\d{2}-\d{2}$/.test(currentGoalsCellId)
        ? currentGoalsCellId.replace(/-\d{4}-\d{2}-\d{2}$/, '')
        : currentGoalsCellId.replace(/-[^-]+$/, '');
      const cell = document.getElementById(currentGoalsCellId);
      if (currentGoalsCellId.indexOf('-target') !== -1) {
        var localTargetsJson = await getTemporaryFromSupabase('local_goal_targets');
        if (localTargetsJson == null) localTargetsJson = localStorage.getItem('local_goal_targets');
        var localTargets = localTargetsJson ? JSON.parse(localTargetsJson) : {};
        localTargets[currentGoalsCellId] = value;
        try {
          var newLocalTargetsJson = JSON.stringify(localTargets);
          localStorage.setItem('local_goal_targets', newLocalTargetsJson);
          // Mirror to Supabase temporary_variables
          saveTemporaryToSupabase('local_goal_targets', newLocalTargetsJson);
        } catch (err) {
          console.error('Error saving local_goal_targets:', err);
        }
        if (cell) {
          var box = cell.querySelector('.goals-cell-box');
          if (box) box.textContent = value;
        }
        if (typeof setGoalsFormat === 'function') await setGoalsFormat();
        currentGoalsCellId = null;
        $('#goalsCellModal').modal('hide');
        return;
      }
      if (cell) {
        const box = cell.querySelector('.goals-cell-box');
        if (box) box.textContent = value;
        var row = cell.closest('tr');
        if (row) {
          var cells = row.querySelectorAll('td');
          if (cells.length >= 9) {
            var sum = 0;
            for (var c = 1; c <= 7; c++) {
              var b = cells[c].querySelector('.goals-cell-box');
              var t = (b ? b.textContent : (cells[c].textContent || '')).trim().replace(/,/g, '');
              var n = parseFloat(t);
              if (!isNaN(n)) sum += n;
            }
            cells[8].textContent = sum;
          }
        }
      }
      const dateInput = document.getElementById('goals-table-date-input');
      let dateVal = dateInput ? dateInput.value.trim() : '';
      var dateFromId = currentGoalsCellId.match(/-(\d{4}-\d{2}-\d{2})$/);
      if (dateFromId) {
        dateVal = dateFromId[1];
      } else if (dateVal) {
        var cellIdLower = currentGoalsCellId.toLowerCase();
        var daysToAdd = 0;
        if (cellIdLower.includes('mon')) daysToAdd = 1;
        else if (cellIdLower.includes('tue')) daysToAdd = 2;
        else if (cellIdLower.includes('wed')) daysToAdd = 3;
        else if (cellIdLower.includes('thu')) daysToAdd = 4;
        else if (cellIdLower.includes('fri')) daysToAdd = 5;
        else if (cellIdLower.includes('sat')) daysToAdd = 6;
        if (daysToAdd > 0) {
          var d = new Date(dateVal + 'T12:00:00');
          if (!isNaN(d.getTime())) {
            d.setDate(d.getDate() + daysToAdd);
            dateVal = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
          }
        }
      }
      let userEmail = null;
      try {
        if (window.auth0) {
          const isAuth = await window.auth0.isAuthenticated();
          if (isAuth) {
            const user = await window.auth0.getUser();
            userEmail = user?.email || user?.nickname || user?.sub || null;
          }
        }
      } catch (err) {
        console.error('Error getting user for goal value:', err);
      }
      if (userEmail) {
        try {
          const res = await fetch('/api/goals/values', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userEmail, goal_name: goalName, value: value, date: dateVal || null })
          });
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            const msg = errBody.error || res.statusText || 'Failed to save goal value';
            console.error('Goal value save failed:', res.status, msg);
            alert('Could not save: ' + msg);
          }
        } catch (err) {
          console.error('Error saving goal value:', err);
          alert('Could not save goal value. Check console.');
        }
      }
      getDeltaValue();
      if (typeof setGoalsFormat === 'function') setGoalsFormat();
      currentGoalsCellId = null;
      $('#goalsCellModal').modal('hide');
    });
  }
  const goalEditForm = document.getElementById('goal-edit-form');
  if (goalEditForm) {
    goalEditForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!currentGoalEdit.goalIndex) return;
      const inputEl = document.getElementById('goal-edit-value-input');
      const newValue = inputEl ? inputEl.value.trim() : '';
      var slugFromName = function (name) { var s = String(name).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''); return s || 'goal'; };
      var formatSelect = document.getElementById('goals-cell-format-select');
      var formatValue = formatSelect ? formatSelect.value : 'text';
      try {
        var goalsFormatJson = await getTemporaryFromSupabase('goals_format');
        if (goalsFormatJson == null) goalsFormatJson = localStorage.getItem('goals_format');
        var goalsFormat = goalsFormatJson ? JSON.parse(goalsFormatJson) : {};
        goalsFormat[slugFromName(newValue)] = formatValue;
        var newGoalsFormatJson = JSON.stringify(goalsFormat);
        localStorage.setItem('goals_format', newGoalsFormatJson);
        // Mirror to Supabase temporary_variables
        saveTemporaryToSupabase('goals_format', newGoalsFormatJson);
      } catch (err) {
        console.error('Error saving goals_format:', err);
      }
      let userEmail = null;
      try {
        if (window.auth0) {
          const isAuth = await window.auth0.isAuthenticated();
          if (isAuth) {
            const user = await window.auth0.getUser();
            userEmail = user?.email || user?.nickname || user?.sub || null;
          }
        }
      } catch (err) {
        console.error('Error getting user for goal update:', err);
        return;
      }
      if (!userEmail) return;
      try {
        const response = await fetch('/api/goals', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userEmail, goal_index: parseInt(currentGoalEdit.goalIndex, 10), value: newValue })
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to update goal');
        }
        currentGoalEdit = { cellId: null, goalIndex: null, oldValue: null };
        $('#goalEditModal').modal('hide');
        await loadGoals();
        if (typeof setGoalsFormat === 'function') setGoalsFormat();
      } catch (err) {
        console.error('Error updating goal:', err);
        alert(err.message || 'Failed to update goal');
      }
    });
  }
  const goalEditDeleteBtn = document.getElementById('goal-edit-delete-btn');
  if (goalEditDeleteBtn) {
    goalEditDeleteBtn.addEventListener('click', async function () {
      if (!currentGoalEdit.goalIndex) return;
      let userEmail = null;
      try {
        if (window.auth0) {
          const isAuth = await window.auth0.isAuthenticated();
          if (isAuth) {
            const user = await window.auth0.getUser();
            userEmail = user?.email || user?.nickname || user?.sub || null;
          }
        }
      } catch (err) {
        console.error('Error getting user for goal delete:', err);
        return;
      }
      if (!userEmail) return;
      try {
        const response = await fetch('/api/goals', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userEmail, goal_index: parseInt(currentGoalEdit.goalIndex, 10), value: null })
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to delete goal');
        }
        currentGoalEdit = { cellId: null, goalIndex: null, oldValue: null };
        $('#goalEditModal').modal('hide');
        await loadGoals();
      } catch (err) {
        console.error('Error deleting goal:', err);
        alert(err.message || 'Failed to delete goal');
      }
    });
  }
  // Goals table date: click to edit
  (function () {
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let goalsTableDate = new Date(2026, 2, 8); // 8-Mar-2026
    const displayEl = document.getElementById('goals-table-date-display');
    const inputEl = document.getElementById('goals-table-date-input');
    function formatGoalsDate(d) {
      const day = d.getDate();
      const month = MONTHS[d.getMonth()];
      const year = d.getFullYear();
      return day + '-' + month + '-' + year;
    }
    function showDisplay() {
      if (!displayEl || !inputEl) return;
      displayEl.textContent = formatGoalsDate(goalsTableDate);
      displayEl.style.display = '';
      inputEl.style.display = 'none';
    }
    function showInput() {
      if (!displayEl || !inputEl) return;
      displayEl.style.display = 'none';
      inputEl.style.display = 'inline-block';
      inputEl.value = goalsTableDate.getFullYear() + '-' + String(goalsTableDate.getMonth() + 1).padStart(2, '0') + '-' + String(goalsTableDate.getDate()).padStart(2, '0');
      inputEl.focus();
    }
    function commitDate() {
      const val = inputEl.value;
      if (val) {
        goalsTableDate = new Date(val);
        if (!isNaN(goalsTableDate.getTime())) showDisplay();
      } else {
        showDisplay();
      }
    }
    if (displayEl) {
      displayEl.addEventListener('click', showInput);
      displayEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showInput(); } });
    }
    if (inputEl) {
      inputEl.addEventListener('change', commitDate);
      inputEl.addEventListener('blur', commitDate);
    }
  })();
});
