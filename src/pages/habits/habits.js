/**
 * Habit Stacker page logic (auth + visibility: auth_page_load.js).
 * Loads habits from /api/habits scoped to the logged-in user (user_id === email).
 */

// Supabase session info for API calls: user email + access token (for the
// Authorization header the server verifies).
async function getAuthContext() {
  try {
    if (window.appAuth) {
      const session = await window.appAuth.getSession();
      if (session) {
        return {
          email: session.user?.email || null,
          token: session.access_token || null
        };
      }
    }
  } catch (authError) {
    console.error('Error getting current user:', authError);
  }
  return { email: null, token: null };
}

function authHeaders(token, extra = {}) {
  const headers = { ...extra };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// --- Habits list: GET /api/habits, filter to current user, render rows with streak styling ---
let loadTasksGeneration = 0;

async function loadTasks() {
  const generation = ++loadTasksGeneration;
  const loadingEl = document.getElementById('tasks-loading');
  const errorEl = document.getElementById('tasks-error');
  const emptyEl = document.getElementById('tasks-empty');
  const tableEl = document.getElementById('tasks-table');
  const tbodyEl = document.getElementById('tasks-tbody');
  const hasVisibleRows = tableEl && tableEl.style.display !== 'none' && tbodyEl && tbodyEl.children.length > 0;

  try {
    // Avoid spinner flicker when we already have content on screen
    if (!hasVisibleRows) {
      loadingEl.style.display = 'block';
      tableEl.style.display = 'none';
      emptyEl.style.display = 'none';
    }
    errorEl.style.display = 'none';

    const { email: currentUserEmail, token } = await getAuthContext();
    if (generation !== loadTasksGeneration) return;

    if (!currentUserEmail) {
      loadingEl.style.display = 'none';
      emptyEl.textContent = 'Please log in to view your habits.';
      emptyEl.style.display = 'block';
      tableEl.style.display = 'none';
      return;
    }

    const response = await fetch('/api/habits', {
      headers: authHeaders(token)
    });
    if (generation !== loadTasksGeneration) return;

    const responseData = await response.json().catch(() => ({}));
    if (!response.ok) {
      const details = responseData.details || responseData.error || '';
      console.error('Habits API error:', response.status, details);
      throw new Error(details ? `Failed to fetch habits: ${details}` : 'Failed to fetch habits');
    }

    const allTasks = responseData;

    // API may return all users' rows; only show rows owned by this account
    const tasks = allTasks.filter(task => {
      return task.user_id === currentUserEmail;
    });
    tasks.sort((a, b) => {
      const dateA = a.event_date ? new Date(a.event_date + 'T00:00:00') : new Date(0);
      const dateB = b.event_date ? new Date(b.event_date + 'T00:00:00') : new Date(0);
      return dateB - dateA;
    });

    if (generation !== loadTasksGeneration) return;

    loadingEl.style.display = 'none';

    if (tasks.length === 0) {
      emptyEl.textContent = 'No habits yet. Add one above!';
      emptyEl.style.display = 'block';
      tableEl.style.display = 'none';
      tbodyEl.innerHTML = '';
      return;
    }

    emptyEl.style.display = 'none';
    tableEl.style.display = 'table';
    tbodyEl.innerHTML = '';

    tasks.forEach(task => {
      const startDateDisplay = formatDateShort(task.event_date);
      const daysKeptNum = task.event_date ? daysSince(task.event_date) : 0;
      const daysKeptDisplay = task.event_date ? daysKeptNum : '—';
      const row = document.createElement('tr');
      row.setAttribute('data-habit-id', task.id);
      // Background steps by streak length (visual progress)
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
      // escapeHtml: task names are user-controlled and are inserted as HTML
      row.innerHTML = `
          <td><strong>${escapeHtml(task.task)}</strong></td>
          <td><small>${daysKeptDisplay}</small></td>
          <td><small>${startDateDisplay}</small></td>
        `;
      tbodyEl.appendChild(row);
    });
  } catch (error) {
    if (generation !== loadTasksGeneration) return;
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

    // user_id stored as the Supabase account email to match loadTasks filter
    const { email: userId, token } = await getAuthContext();

    const response = await fetch('/api/habits', {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ task, event_date: eventDate, user_id: userId })
    });

    if (!response.ok) {
      throw new Error('Failed to add habit');
    }

    taskInput.value = '';
    setDefaultEventDate();

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
    const { token } = await getAuthContext();
    const response = await fetch(`/api/habits/${id}`, {
      method: 'DELETE',
      headers: authHeaders(token)
    });

    if (!response.ok) {
      throw new Error('Failed to delete habit');
    }

    $('#editEventModal').modal('hide');
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

/** Today's date as YYYY-MM-DD for <input type="date"> (local timezone). */
function todayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function setDefaultEventDate() {
  const eventDateInput = document.getElementById('event-date');
  if (eventDateInput) {
    eventDateInput.value = todayInputValue();
  }
}

/** Format as D-MMM-YY (e.g. 15-Feb-25). Uses T00:00:00 so the calendar day is stable in local TZ. */
function formatDateShort(dateString) {
  if (!dateString) return 'Not set';
  const date = new Date(dateString + 'T00:00:00');
  const d = date.getDate();
  const mmm = date.toLocaleDateString('en-US', { month: 'short' });
  const yy = String(date.getFullYear()).slice(-2);
  return `${d}-${mmm}-${yy}`;
}

/** Whole days from start date to today (non-negative). */
function daysSince(dateString) {
  if (!dateString) return '—';
  const start = new Date(dateString + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  const diff = Math.floor((today - start) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : 0;
}

// Loads full list from API, finds the row by id, fills #editEventModal (same pattern as server expects user_id on PUT)
async function editTask(id) {
  try {
    const { token } = await getAuthContext();
    const response = await fetch(`/api/habits`, {
      headers: authHeaders(token)
    });
    if (!response.ok) {
      throw new Error('Failed to fetch tasks');
    }

    const tasks = await response.json();
    const task = tasks.find(t => t.id === id);

    if (!task) {
      alert('Habit not found');
      return;
    }

    document.getElementById('edit-task-id').value = task.id;
    document.getElementById('edit-task-input').value = task.task;

    if (task.event_date) {
      const date = new Date(task.event_date + 'T00:00:00');
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      document.getElementById('edit-event-date').value = `${year}-${month}-${day}`;
    } else {
      document.getElementById('edit-event-date').value = '';
    }

    $('#editEventModal').modal('show');
  } catch (error) {
    console.error('Error loading habit for editing:', error);
    alert('Failed to load habit. Please try again.');
  }
}

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

    const { email: userId, token } = await getAuthContext();

    const response = await fetch(`/api/habits/${taskId}`, {
      method: 'PUT',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        task,
        event_date: eventDate,
        user_id: userId
      })
    });

    if (!response.ok) {
      throw new Error('Failed to update habit');
    }

    $('#editEventModal').modal('hide');

    await loadTasks();
  } catch (error) {
    console.error('Error updating habit:', error);
    alert('Failed to update habit. Please try again.');
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Save Changes';
  }
}

// Exposed for onclick="saveEditTask()" on the modal and any inline hooks
window.deleteTask = deleteTask;
window.editTask = editTask;
window.saveEditTask = saveEditTask;

// Extend auth_page_load.js: load habits once when auth becomes true
const originalUpdateContentVisibility = window.updateContentVisibility || updateContentVisibility;
window.updateContentVisibility = function(isAuthenticated) {
  const wasAuthenticated = typeof lastContentAuthState !== 'undefined' ? lastContentAuthState : null;
  originalUpdateContentVisibility(isAuthenticated);
  // Only fetch when transitioning into the authenticated state (not on TOKEN_REFRESHED / focus)
  if (isAuthenticated && wasAuthenticated !== true) {
    loadTasks();
  }
};
// Keep the bare binding used by older references in sync
updateContentVisibility = window.updateContentVisibility;

document.addEventListener('DOMContentLoaded', () => {
  setDefaultEventDate();

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
      const habitId = row.getAttribute('data-habit-id');
      if (habitId) {
        editTask(parseInt(habitId, 10));
      }
    });
  }

  const editDeleteBtn = document.getElementById('edit-delete-btn');
  if (editDeleteBtn) {
    editDeleteBtn.addEventListener('click', () => {
      const taskId = document.getElementById('edit-task-id').value;
      if (taskId) {
        deleteTask(parseInt(taskId, 10));
      }
    });
  }
});
