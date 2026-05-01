/**
 * Goals table: add form, week date, cell modals, edit/delete goal, optional date display toggle.
 */
function goalsDomInitGoalsTableUi() {
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
    var prevSundayBtn = document.getElementById('goals-table-prev-sunday');
    var nextSundayBtn = document.getElementById('goals-table-next-sunday');
    function shiftGoalsTableWeek(days) {
      var baseVal = goalsTableDateInput.value;
      var baseDate = baseVal ? new Date(baseVal + 'T12:00:00') : new Date();
      if (isNaN(baseDate.getTime())) {
        baseDate = new Date();
        baseDate.setDate(baseDate.getDate() - baseDate.getDay());
      }
      baseDate.setDate(baseDate.getDate() + days);
      var yyyy = baseDate.getFullYear();
      var mm = String(baseDate.getMonth() + 1).padStart(2, '0');
      var dd = String(baseDate.getDate()).padStart(2, '0');
      goalsTableDateInput.value = yyyy + '-' + mm + '-' + dd;
      goalsTableDateInput.dispatchEvent(new Event('change'));
    }
    if (prevSundayBtn) {
      prevSundayBtn.addEventListener('click', function () {
        shiftGoalsTableWeek(-7);
      });
    }
    if (nextSundayBtn) {
      nextSundayBtn.addEventListener('click', function () {
        shiftGoalsTableWeek(7);
      });
    }
  }
  let currentGoalsCellId = null;
  let currentPlusMinusCellId = null;
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
  (function () {
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let goalsTableDate = new Date(2026, 2, 8);
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
}
