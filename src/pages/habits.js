// Check authentication and show/hide content accordingly

// Authentication modules ------------------------ Authentication modules ------------------------
// Authentication modules ------------------------ Authentication modules ------------------------
// Authentication modules ------------------------ Authentication modules ------------------------
// Authentication modules ------------------------ Authentication modules ------------------------

async function checkAuthAndDisplayContent() {
  try {
    let auth0 = null;

    // First, try to use window.auth0 directly if it's already available
    if (window.auth0) {
      auth0 = window.auth0;
    } else if (window.auth0Promise) {
      // Otherwise, wait for the promise to resolve
      auth0 = await window.auth0Promise;
    } else {
      // If neither exists, wait a bit and try again
      setTimeout(checkAuthAndDisplayContent, 200);
      return;
    }

    // Wait for redirect handling to complete if it's in progress
    if (window.redirectHandledPromise) {
      await window.redirectHandledPromise;
    }

    // Now check authentication
    if (auth0 && typeof auth0.isAuthenticated === 'function') {
      const isAuthenticated = await auth0.isAuthenticated();
      updateContentVisibility(isAuthenticated);
    } else {
      console.error('Auth0 client is not properly initialized');
      updateContentVisibility(false);
    }
  } catch (error) {
    console.error('Error checking authentication:', error);
    // On error, show login required message
    updateContentVisibility(false);
  }
}

// Update content visibility based on auth state
function updateContentVisibility(isAuthenticated) {
  const privateContent = document.getElementById('private-content');
  const loginRequiredMessage = document.getElementById('login-required-message');

  if (isAuthenticated) {
    // User is logged in - show protected content
    if (privateContent) privateContent.style.display = 'block';
    if (loginRequiredMessage) loginRequiredMessage.style.display = 'none';
  } else {
    // User is not logged in - show login required message
    if (privateContent) privateContent.style.display = 'none';
    if (loginRequiredMessage) loginRequiredMessage.style.display = 'block';
  }
}

// Wait for Auth0 to be ready with retries
function waitForAuth0AndCheck(maxRetries = 10, retryDelay = 200) {
  let retries = 0;

  const check = () => {
    if (window.auth0 || (window.auth0Promise && retries < maxRetries)) {
      checkAuthAndDisplayContent();
    } else if (retries < maxRetries) {
      retries++;
      setTimeout(check, retryDelay);
    } else {
      console.warn('Auth0 initialization timeout - showing login required');
      updateContentVisibility(false);
    }
  };

  check();
}

// Run check when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    waitForAuth0AndCheck();
  });
} else {
  // DOM is already loaded
  waitForAuth0AndCheck();
}

// Re-check auth state when user returns from login (handles redirect callback)
window.addEventListener('focus', () => {
  setTimeout(checkAuthAndDisplayContent, 100);
});

// Also check after redirect callback (in case we just logged in)
if (window.location.search.includes('code=') && window.location.search.includes('state=')) {
  // Wait a bit longer for redirect handling
  setTimeout(checkAuthAndDisplayContent, 500);
}

// Event Management Functions
async function loadTasks() {
  const loadingEl = document.getElementById('tasks-loading');
  const errorEl = document.getElementById('tasks-error');
  const emptyEl = document.getElementById('tasks-empty');
  const tableEl = document.getElementById('tasks-table');
  const tbodyEl = document.getElementById('tasks-tbody');

  try {
    loadingEl.style.display = 'block';
    errorEl.style.display = 'none';
    emptyEl.style.display = 'none';
    tableEl.style.display = 'none';

    // Get the current logged-in user's email
    let currentUserEmail = null;
    try {
      if (window.auth0) {
        const isAuthenticated = await window.auth0.isAuthenticated();
        if (isAuthenticated) {
          const user = await window.auth0.getUser();
          currentUserEmail = user?.email || null;
        }
      }
    } catch (authError) {
      console.error('Error getting current user:', authError);
    }

    // If user is not authenticated, don't show any habits
    if (!currentUserEmail) {
      loadingEl.style.display = 'none';
      emptyEl.textContent = 'Please log in to view your habits.';
      emptyEl.style.display = 'block';
      return;
    }

    const response = await fetch('/api/habits');
    const responseData = await response.json().catch(() => ({}));
    if (!response.ok) {
      const details = responseData.details || responseData.error || '';
      console.error('Habits API error:', response.status, details);
      throw new Error(details ? `Failed to fetch habits: ${details}` : 'Failed to fetch habits');
    }

    const allTasks = responseData;

    // Filter to only show habits where user_id matches current user's email
    const tasks = allTasks.filter(task => {
      return task.user_id === currentUserEmail;
    });
    // Sort by start date descending (newest first)
    tasks.sort((a, b) => {
      const dateA = a.event_date ? new Date(a.event_date + 'T00:00:00') : new Date(0);
      const dateB = b.event_date ? new Date(b.event_date + 'T00:00:00') : new Date(0);
      return dateB - dateA;
    });

    loadingEl.style.display = 'none';

    if (tasks.length === 0) {
      emptyEl.textContent = 'No habits yet. Add one above!';
      emptyEl.style.display = 'block';
      return;
    }

    tableEl.style.display = 'table';
    tbodyEl.innerHTML = '';

    tasks.forEach(task => {
      const startDateDisplay = formatDateShort(task.event_date);
      const daysKeptNum = task.event_date ? daysSince(task.event_date) : 0;
      const daysKeptDisplay = task.event_date ? daysKeptNum : '—';
      const row = document.createElement('tr');
      row.setAttribute('data-habit-id', task.id);
      if (daysKeptNum >= 365) {
        row.style.backgroundColor = '#000000';
        row.style.color = 'white';
      } else if (daysKeptNum >= 100) {
        row.style.backgroundColor = '#006600';
        row.style.color = 'white';
      } else if (daysKeptNum >= 21) {
        row.style.backgroundColor = '#00b300';
        row.style.color = 'white';
      } else if (daysKeptNum >= 1) {
        row.style.backgroundColor = '#80ff80';
        row.style.color = 'black';
      } else {
        row.style.backgroundColor = 'white';
        row.style.color = 'black';
      }
      row.innerHTML = `
          <td><strong>${escapeHtml(task.task)}</strong></td>
          <td><small>${daysKeptDisplay}</small></td>
          <td><small>${startDateDisplay}</small></td>
        `;
      tbodyEl.appendChild(row);
    });
  } catch (error) {
    console.error('Error loading habits:', error);
    loadingEl.style.display = 'none';
    errorEl.textContent = error.message || 'Failed to load habits. Please refresh the page.';
    errorEl.style.display = 'block';
  }
}

async function addTaskForm(event) {
  event.preventDefault();

  const taskInput = document.getElementById('task-input');
  const eventDateInput = document.getElementById('event-date');
  const submitButton = event.target.querySelector('button[type="submit"]');

  const task = taskInput.value.trim();
  const eventDate = eventDateInput.value;

  if (!task) {
    alert('Please enter a habit');
    return;
  }

  if (!eventDate) {
    alert('Please select a start date');
    return;
  }

  try {
    submitButton.disabled = true;
    submitButton.textContent = 'Adding...';

    // Get the Auth0 user
    let userId = null;
    try {
      if (window.auth0) {
        const isAuthenticated = await window.auth0.isAuthenticated();
        if (isAuthenticated) {
          const user = await window.auth0.getUser();
          // Use email as user_id, fallback to nickname or sub if email is not available
          userId = user?.email || user?.nickname || user?.sub || null;
        }
      }
    } catch (authError) {
      console.error('Error getting Auth0 user:', authError);
      // Continue without user_id if there's an error
    }

    const response = await fetch('/api/habits', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ task, event_date: eventDate, user_id: userId })
    });

    if (!response.ok) {
      throw new Error('Failed to add habit');
    }

    // Clear form
    taskInput.value = '';
    eventDateInput.value = '';

    // Reload habits
    await loadTasks();
  } catch (error) {
    console.error('Error adding habit:', error);
    alert('Failed to add habit. Please try again.');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Add New Habit';
  }
}

async function deleteTask(id) {
  if (!confirm('Are you sure you want to delete this habit?')) {
    return;
  }

  try {
    const response = await fetch(`/api/habits/${id}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Failed to delete habit');
    }

    await loadTasks();
  } catch (error) {
    console.error('Error deleting habit:', error);
    alert('Failed to delete habit. Please try again.');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDateOnly(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString + 'T00:00:00'); // Add time to avoid timezone issues
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Format as D-MMM-YY (e.g. 15-Feb-25) */
function formatDateShort(dateString) {
  if (!dateString) return 'Not set';
  const date = new Date(dateString + 'T00:00:00');
  const d = date.getDate();
  const mmm = date.toLocaleDateString('en-US', { month: 'short' });
  const yy = String(date.getFullYear()).slice(-2);
  return `${d}-${mmm}-${yy}`;
}

function daysSince(dateString) {
  if (!dateString) return '—';
  const start = new Date(dateString + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  const diff = Math.floor((today - start) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : 0;
}

// Edit task function
async function editTask(id) {
  try {
    // Fetch the current task data
    const response = await fetch(`/api/habits`);
    if (!response.ok) {
      throw new Error('Failed to fetch tasks');
    }

    const tasks = await response.json();
    const task = tasks.find(t => t.id === id);

    if (!task) {
      alert('Habit not found');
      return;
    }

    // Populate the edit form
    document.getElementById('edit-task-id').value = task.id;
    document.getElementById('edit-task-input').value = task.task;

    // Format date for input (YYYY-MM-DD)
    if (task.event_date) {
      const date = new Date(task.event_date + 'T00:00:00');
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      document.getElementById('edit-event-date').value = `${year}-${month}-${day}`;
    } else {
      document.getElementById('edit-event-date').value = '';
    }

    // Show the modal using jQuery/Bootstrap 4
    $('#editEventModal').modal('show');
  } catch (error) {
    console.error('Error loading habit for editing:', error);
    alert('Failed to load habit. Please try again.');
  }
}

// Save edited task
async function saveEditTask() {
  const taskId = document.getElementById('edit-task-id').value;
  const taskInput = document.getElementById('edit-task-input');
  const eventDateInput = document.getElementById('edit-event-date');
  const saveButton = document.querySelector('#editEventModal .btn-primary');

  const task = taskInput.value.trim();
  const eventDate = eventDateInput.value;

  if (!task) {
    alert('Please enter a habit');
    return;
  }

  if (!eventDate) {
    alert('Please select a start date');
    return;
  }

  try {
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';

    // Get the Auth0 user to preserve user_id
    let userId = null;
    try {
      if (window.auth0) {
        const isAuthenticated = await window.auth0.isAuthenticated();
        if (isAuthenticated) {
          const user = await window.auth0.getUser();
          // Use email as user_id, fallback to nickname or sub if email is not available
          userId = user?.email || user?.nickname || user?.sub || null;
        }
      }
    } catch (authError) {
      console.error('Error getting Auth0 user:', authError);
      // Continue without user_id if there's an error
    }

    const response = await fetch(`/api/habits/${taskId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        task,
        event_date: eventDate,
        user_id: userId
      })
    });

    if (!response.ok) {
      throw new Error('Failed to update habit');
    }

    // Close modal
    $('#editEventModal').modal('hide');

    // Reload habits
    await loadTasks();
  } catch (error) {
    console.error('Error updating habit:', error);
    alert('Failed to update habit. Please try again.');
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Save Changes';
  }
}

// Make functions globally available
window.deleteTask = deleteTask;
window.editTask = editTask;
window.saveEditTask = saveEditTask;

// Load habits and goals when content is visible
const originalUpdateContentVisibility = updateContentVisibility;
async function loadMinutesValueFromSupabase() {
  var minutesVal = await getTemporaryFromSupabase('minutes_value');
  if (minutesVal != null) setMinutesValueCell(minutesVal);
}
updateContentVisibility = function(isAuthenticated) {
  originalUpdateContentVisibility(isAuthenticated);
  if (isAuthenticated) {
    setTimeout(loadTasks, 100);
    loadMinutesValueFromSupabase();
  }
};

// Generic helpers for Supabase temporary_variables (must be in scope for updateCaloriesTableFromLocal, setGoalsFormat, loadGoals, etc.)
async function saveTemporaryToSupabase(tempKey, tempValue) {
  try {
    if (!window.auth0) return;
    const isAuthenticated = await window.auth0.isAuthenticated();
    if (!isAuthenticated) return;
    const user = await window.auth0.getUser();
    const userId = user && (user.email || user.nickname || user.sub);
    if (!userId) return;
    await fetch('/api/temporary_variables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        key: tempKey,
        value: tempValue
      })
    });
  } catch (err) {
    console.error('Error saving temporary variable to Supabase:', err);
  }
}
async function getTemporaryFromSupabase(tempKey) {
  try {
    if (!window.auth0) return null;
    const isAuthenticated = await window.auth0.isAuthenticated();
    if (!isAuthenticated) return null;
    const user = await window.auth0.getUser();
    const userId = user && (user.email || user.nickname || user.sub);
    if (!userId) return null;
    const res = await fetch('/api/temporary_variables?user_id=' + encodeURIComponent(userId) + '&key=' + encodeURIComponent(tempKey), { cache: 'no-store' });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || (text.trim().length > 0 && text.trim().charAt(0) === '<')) return null;
    try {
      var data = JSON.parse(text);
    } catch (e) { return null; }
    if (data == null) return null;
    return data.temporary_table_value != null ? data.temporary_table_value : null;
  } catch (err) {
    console.error('Error getting temporary variable from Supabase:', err);
    return null;
  }
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

// Row click: show Edit/Delete modal (unless user clicked Edit or Delete button)
let rowActionHabitId = null;
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
var moduleVisibility = {
  'stopwatch-card': 'hide',
  'working-card': 'hide',
  'calories-today-card': 'hide',
  'goals-section': 'hide',
  'habits-section': 'show'
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

  const taskForm = document.getElementById('task-form');
  if (taskForm) {
    taskForm.addEventListener('submit', addTaskForm);
  }

  const tbody = document.getElementById('tasks-tbody');
  if (tbody) {
    tbody.addEventListener('click', (e) => {
      const row = e.target.closest('tr[data-habit-id]');
      if (!row) return;
      if (e.target.closest('button')) return;
      rowActionHabitId = row.getAttribute('data-habit-id');
      const habitNameEl = document.getElementById('row-action-habit-name');
      if (habitNameEl) {
        const firstCell = row.querySelector('td:first-child');
        habitNameEl.textContent = firstCell ? firstCell.textContent.trim() : '';
      }
      if (rowActionHabitId) {
        $('#rowActionModal').modal('show');
      }
    });
  }
  document.getElementById('row-action-edit-btn').addEventListener('click', () => {
    if (rowActionHabitId) {
      $('#rowActionModal').modal('hide');
      editTask(parseInt(rowActionHabitId, 10));
      rowActionHabitId = null;
    }
  });
  document.getElementById('row-action-delete-btn').addEventListener('click', () => {
    if (rowActionHabitId) {
      $('#rowActionModal').modal('hide');
      const id = parseInt(rowActionHabitId, 10);
      rowActionHabitId = null;
      deleteTask(id);
    }
  });
});
