/**
 * First DOMContentLoaded phase: restore module visibility, calories/minutes/working from storage.
 * Called from goals-dom-init.js.
 */
async function goalsDomInitBootstrap() {
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
}
