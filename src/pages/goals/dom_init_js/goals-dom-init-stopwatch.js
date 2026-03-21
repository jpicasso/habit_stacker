/**
 * Stopwatch controls and submit-to-minutes / time-worked flow.
 * Called from goals-dom-init.js after bootstrap.
 */
async function goalsDomInitStopwatch() {
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
    saveMinutesValueToSupabase();
    if (typeof updateProjectedDoneValue === 'function') updateProjectedDoneValue();
    if (typeof updateDeltaToExpectedDone === 'function') updateDeltaToExpectedDone();
    submitTimeWorked();
    saveTemporaryToSupabase('stopwatch_start_time', '');
  });
}
