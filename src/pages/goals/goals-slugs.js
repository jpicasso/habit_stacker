/** Table id prefixes and slug helpers shared with charts. */
function goalToSlug(goalText) {
  var s = String(goalText || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return s || 'goal';
}
/** Same id prefix as goals table for a given goal index (1-based). Handles duplicate names: goal1="Running", goal2="Running" -> "running", "running-1". */
function getGoalIdPrefixForIndex(goalsRow, goalIndex) {
  if (!goalsRow || goalIndex < 1 || goalIndex > 8) return '';
  var slugCount = {};
  for (var i = 1; i <= goalIndex; i++) {
    var raw = goalsRow['goal' + i];
    var goalText = (raw != null && String(raw).trim() !== '') ? String(raw).trim() : null;
    var base = goalText ? goalToSlug(goalText) : '';
    if (base) {
      if (slugCount[base] !== undefined) {
        slugCount[base]++;
        base = base + '-' + slugCount[base];
      } else {
        slugCount[base] = 0;
      }
    }
    if (i === goalIndex) return base;
  }
  return '';
}
