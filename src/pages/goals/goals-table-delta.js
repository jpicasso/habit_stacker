/** Delta column styling from total, target, and greater-than / less-than cells. */
function getDeltaValue() {
  var tbody = document.querySelector('#goals-table tbody');
  if (!tbody) return;
  var rows = tbody.querySelectorAll('tr[data-goal-index]');
  var lightGreen = '#90ee90';
  var red = '#dc3545';
  for (var r = 0; r < rows.length; r++) {
    var cells = rows[r].querySelectorAll('td');
    if (cells.length < 12) continue;
    var totalCell = cells[8];
    var plusMinusCell = cells[9];
    var targetCell = cells[10];
    var deltaCell = cells[11];
    var plusMinusBox = plusMinusCell ? plusMinusCell.querySelector('.goals-cell-box-plusminus') : null;
    var targetBox = targetCell ? targetCell.querySelector('.goals-cell-box') : null;
    var totalVal = parseFloat((totalCell.textContent || '').trim().replace(/,/g, ''));
    var targetVal = parseFloat((targetBox ? targetBox.textContent : (targetCell.textContent || '')).trim().replace(/,/g, ''));
    if (isNaN(totalVal)) totalVal = 0;
    if (isNaN(targetVal)) targetVal = 0;
    var pmVal = (plusMinusBox ? plusMinusBox.textContent : '').trim();
    var deltaNum;
    if (pmVal === '>') {
      deltaNum = totalVal - targetVal;
    } else if (pmVal === '<') {
      deltaNum = targetVal - totalVal;
    } else {
      deltaNum = null;
    }
    if (deltaNum !== null) {
      var rounded = Math.round(deltaNum * 10) / 10;
      deltaCell.textContent = rounded;
      var good = (pmVal === '>' && rounded > 0) || (pmVal === '<' && rounded > 0);
      deltaCell.style.setProperty('background-color', good ? lightGreen : red, 'important');
      deltaCell.style.setProperty('color', good ? 'black' : 'white', 'important');
    } else {
      deltaCell.textContent = '';
      deltaCell.style.removeProperty('background-color');
      deltaCell.style.removeProperty('color');
    }
  }
}
