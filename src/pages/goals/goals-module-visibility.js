/** Habit-stacker nav pills: show/hide stopwatch, working, calories, goals sections. */
var moduleVisibility = {
  'stopwatch-card': 'hide',
  'working-card': 'hide',
  'calories-today-card': 'hide',
  'goals-section': 'show'
};
function applyModuleVisibility() {
  var key;
  for (key in moduleVisibility) {
    var el = document.getElementById(key);
    if (el) el.style.display = moduleVisibility[key] === 'show' ? '' : 'none';
  }
  var pills = document.querySelectorAll('#habit-stacker-nav-pills .nav-link');
  pills.forEach(function (pill) {
    var id = pill.id;
    if (id && id.endsWith('-pill')) {
      var moduleId = id.slice(0, -5);
      pill.classList.toggle('active', moduleVisibility[moduleId] === 'show');
    }
  });
}
function saveModuleVisibilityToSupabase() {
  saveTemporaryToSupabase('module_visibility', JSON.stringify(moduleVisibility));
}
