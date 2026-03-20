/** Working-hours math, calories table, goal number formats, minutes cell; uses getTemporaryFromSupabase. */
function formatCaloriesNumber(n) {
  var num = typeof n === 'number' ? n : parseFloat(String(n).replace(/,/g, ''));
  if (isNaN(num)) return '';
  return num.toLocaleString('en-US', { maximumFractionDigits: 0, minimumFractionDigits: 0 });
}

function normalizeWorkingTime(str) {
  if (!str) return null;
  var s = String(str).trim();
  var m = s.match(/^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i);
  if (!m) return null;
  var h = parseInt(m[1], 10);
  if (h < 1 || h > 12) return null;
  return h + ':' + m[2] + ' ' + (m[3].toUpperCase() === 'AM' ? 'AM' : 'PM');
}

function timeStringToMinutes(str) {
  var normalized = normalizeWorkingTime(str);
  if (!normalized) return null;
  var m = normalized.match(/^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/);
  var h = parseInt(m[1], 10);
  var min = parseInt(m[2], 10);
  var isAm = m[3].toUpperCase() === 'AM';
  if (isAm && h === 12) return min;
  if (isAm) return h * 60 + min;
  if (h === 12) return 12 * 60 + min;
  return (h + 12) * 60 + min;
}

function minutesToTimeString(totalMinutes) {
  var m = Math.round(totalMinutes) % (24 * 60);
  if (m < 0) m += 24 * 60;
  var h = Math.floor(m / 60);
  var min = m % 60;
  var ampm = 'AM';
  if (h === 0) { h = 12; ampm = 'AM'; }
  else if (h < 12) ampm = 'AM';
  else if (h === 12) ampm = 'PM';
  else { h -= 12; ampm = 'PM'; }
  return h + ':' + String(min).padStart(2, '0') + ' ' + ampm;
}

function updateExpectedDoneValue() {
  var startTd = document.getElementById('working_start');
  var hoursTd = document.getElementById('daily-hours-value');
  var expectedTd = document.getElementById('expected-done-value');
  if (!startTd || !hoursTd || !expectedTd) return;
  var startBox = startTd.querySelector('.goals-cell-box');
  var hoursBox = hoursTd.querySelector('.goals-cell-box');
  var startStr = (startBox ? startBox.textContent : startTd.textContent || '').trim();
  var hoursStr = (hoursBox ? hoursBox.textContent : hoursTd.textContent || '').trim().replace(/,/g, '');
  var startMins = timeStringToMinutes(startStr);
  var hoursNum = parseFloat(hoursStr);
  if (startMins == null || isNaN(hoursNum)) return;
  var totalMins = startMins + hoursNum * 60;
  var resultStr = minutesToTimeString(totalMins);
  var expectedBox = expectedTd.querySelector('.goals-cell-box');
  if (expectedBox) expectedBox.textContent = resultStr; else expectedTd.textContent = resultStr;
}

function updateProjectedDoneValue() {
  // Current time from local device in minutes since midnight
  var now = new Date();
  var currentMins = now.getHours() * 60 + now.getMinutes();

  // Grab daily hours and minutes worked
  var hoursTd = document.getElementById('daily-hours-value');
  var minutesTd = document.getElementById('minutes_value');
  var projectedTd = document.getElementById('projected-done-value');
  if (!hoursTd || !minutesTd || !projectedTd) return;

  var hoursBox = hoursTd.querySelector('.goals-cell-box');
  var minutesBox = minutesTd.querySelector('.goals-cell-box');

  var hoursStr = (hoursBox ? hoursBox.textContent : hoursTd.textContent || '').trim().replace(/,/g, '');
  var minutesStr = (minutesBox ? minutesBox.textContent : minutesTd.textContent || '').trim().replace(/,/g, '');

  var hoursNum = parseFloat(hoursStr);
  var minutesNum = parseFloat(minutesStr);
  if (isNaN(hoursNum)) hoursNum = 0;
  if (isNaN(minutesNum)) minutesNum = 0;

  // total = now + hours (in minutes) – 1.3 * minutes_value
  var totalMins = currentMins + (hoursNum * 60) - (1.3 * minutesNum);
  var resultStr = minutesToTimeString(totalMins);

  var projectedBox = projectedTd.querySelector('.goals-cell-box');
  if (projectedBox) projectedBox.textContent = resultStr;
  else projectedTd.textContent = resultStr;
}

function updateDeltaToExpectedDone() {
  var expectedTd = document.getElementById('expected-done-value');
  var projectedTd = document.getElementById('projected-done-value');
  var deltaTd = document.getElementById('delta-to-expected-done-value');
  if (!expectedTd || !projectedTd || !deltaTd) return;

  var expectedStr = (expectedTd.textContent || '').trim();
  var projectedStr = (projectedTd.textContent || '').trim();
  var expectedMins = timeStringToMinutes(expectedStr);
  var projectedMins = timeStringToMinutes(projectedStr);
  if (expectedMins == null || projectedMins == null) return;

  // difference in hours: expected - projected
  var diffMins = expectedMins - projectedMins;
  var diffHours = diffMins / 60;
  // show with one decimal
  var display = (Math.round(diffHours * 10) / 10).toFixed(1);
  deltaTd.textContent = display;

  // color by sign
  if (diffHours > 0) {
    deltaTd.style.backgroundColor = 'green';
    deltaTd.style.color = 'white';
  } else if (diffHours < 0) {
    deltaTd.style.backgroundColor = 'red';
    deltaTd.style.color = 'white';
  } else {
    // zero / no difference
    deltaTd.style.backgroundColor = '';
    deltaTd.style.color = '';
  }
}

async function setGoalsFormat() {
  var goalsFormatJson = await getTemporaryFromSupabase('goals_format');
  if (goalsFormatJson == null) goalsFormatJson = localStorage.getItem('goals_format');
  var goalsFormat = goalsFormatJson ? JSON.parse(goalsFormatJson) : {};
  var tbody = document.querySelector('#goals-table tbody');
  if (!tbody) return;
  var cells = tbody.querySelectorAll('td[id]');
  for (var i = 0; i < cells.length; i++) {
    var td = cells[i];
    var id = td.id;
    var box = td.querySelector('.goals-cell-box');
    var isTotalCell = id.indexOf('total') !== -1;
    if (!box && !isTotalCell) continue;
    var goal = /-\d{4}-\d{2}-\d{2}$/.test(id) ? id.replace(/-\d{4}-\d{2}-\d{2}$/, '') : id.replace(/-[^-]+$/, '');
    var format = goalsFormat[goal];
    if (!format || format === 'text') continue;
    var raw = (box ? box.textContent : td.textContent || '').trim().replace(/,/g, '');
    var num = parseFloat(raw);
    var formatted = '';
    if (format === '#,###' && !isNaN(num)) {
      formatted = num.toLocaleString('en-US', { maximumFractionDigits: 0, minimumFractionDigits: 0 });
    } else if (format === '#.#' && !isNaN(num)) {
      formatted = num.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
    }
    if (formatted !== '') {
      if (box) box.textContent = formatted; else td.textContent = formatted;
    }
  }
}

function updateCaloriesTotal() {
  var total = 0;
  for (var i = 1; i <= 6; i++) {
    var el = document.getElementById('calories' + i);
    if (el) {
      var box = el.querySelector('.goals-cell-box');
      var raw = ((box ? box.textContent : el.textContent) || '').trim().replace(/,/g, '');
      var n = parseFloat(raw);
      if (!isNaN(n)) total += n;
    }
  }
  var totalEl = document.getElementById('total-calories');
  if (totalEl) totalEl.textContent = formatCaloriesNumber(total);
}

async function updateCaloriesTableFromLocal() {
  var table = document.getElementById('calories-today-table');
  if (!table) return;
  var json = await getTemporaryFromSupabase('calories_today_local');
  if (json == null) json = localStorage.getItem('calories_today_local');
  var data = json ? JSON.parse(json) : {};
  var cells = table.querySelectorAll('td[id]');
  for (var i = 0; i < cells.length; i++) {
    var td = cells[i];
    if (data[td.id] == null) continue;
    var val = data[td.id];
    if (/^calories[1-6]$/.test(td.id)) {
      var n = parseFloat(String(val).replace(/,/g, ''));
      var displayVal = isNaN(n) ? val : formatCaloriesNumber(n);
      var box = td.querySelector('.goals-cell-box');
      if (box) box.textContent = displayVal; else td.textContent = displayVal;
    } else {
      td.textContent = val;
    }
  }
  updateCaloriesTotal();
  if (typeof submitTodaysCalories === 'function') submitTodaysCalories();
}

let currentCaloriesEdit = { mealId: null, caloriesId: null };
function setMinutesValueCell(val) {
  if (val == null) return;
  var minutesTd = document.getElementById('minutes_value');
  if (!minutesTd) return;
  var box = minutesTd.querySelector('.goals-cell-box');
  var str = String(val);
  if (box) box.textContent = str; else minutesTd.textContent = str;
  if (typeof updateProjectedDoneValue === 'function') updateProjectedDoneValue();
  if (typeof updateDeltaToExpectedDone === 'function') updateDeltaToExpectedDone();
}

async function loadMinutesValueFromSupabase() {
  var minutesVal = await getTemporaryFromSupabase('minutes_value');
  if (minutesVal != null) setMinutesValueCell(minutesVal);
}
