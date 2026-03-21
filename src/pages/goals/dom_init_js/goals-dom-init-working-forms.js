/**
 * Calories row edit, working table modals, and working/daily-hours/start forms.
 * Depends on goals-dom-submit-helpers.js (saveMinutesValueToSupabase, submitTimeWorked, submitTodaysCalories).
 */
function goalsDomInitWorkingAndCaloriesForms() {
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
}
