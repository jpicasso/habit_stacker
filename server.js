require('dotenv').config();
// Polyfill fetch/Headers for Node 14/16 (Supabase client needs them)
const nodeFetch = require('node-fetch');
if (typeof globalThis.fetch === 'undefined') globalThis.fetch = nodeFetch;
if (typeof globalThis.Headers === 'undefined') globalThis.Headers = nodeFetch.Headers;

const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const { initDatabase, getAllTasks, addTask, updateTask, deleteTask, initHabitsDatabase, getAllHabits, addHabit, updateHabit, deleteHabit } = require('./db');
const supabaseHabits = require('./supabase-habits');
const supabaseGoals = require('./supabase-goals');
const supabaseTemporary = require('./supabase-temporary');
const supabaseEvents = require('./supabase-events');
const supabaseFriends = require('./supabase-friends');

const app = express();
const useSupabaseHabits = supabaseHabits.isConfigured();
const useSupabaseEvents = supabaseEvents.isConfigured();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from the dist directory (if it exists)
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
} else {
  console.warn('WARNING: dist folder not found. Run "npm run build" first.');
}

// Initialize databases
let db = null;
let habitsDb = null;
initDatabase()
  .then((database) => {
    db = database;
    console.log('Tasks database initialized successfully');
  })
  .catch((err) => {
    console.error('Failed to initialize tasks database:', err);
  });
if (useSupabaseHabits) {
  habitsDb = 'supabase';
  console.log('Habits using Supabase');
} else {
  initHabitsDatabase()
    .then((database) => {
      habitsDb = database;
      console.log('Habits database (SQLite) initialized successfully');
    })
    .catch((err) => {
      console.error('Failed to initialize habits database:', err);
    });
}
if (useSupabaseEvents) {
  console.log('Events using Supabase');
}
if (supabaseFriends.isConfigured()) {
  console.log('Friends API using Supabase');
}

// API Routes

// Get all tasks
app.get('/api/tasks', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    const tasks = await getAllTasks(db);
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Add a new task
app.post('/api/tasks', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    const { task, event_date, user_id } = req.body;
    if (!task || task.trim() === '') {
      return res.status(400).json({ error: 'Event is required' });
    }
    if (!event_date) {
      return res.status(400).json({ error: 'Event date is required' });
    }
    const newTask = await addTask(db, task.trim(), event_date, user_id || null);
    res.status(201).json(newTask);
  } catch (error) {
    console.error('Error adding event:', error);
    res.status(500).json({ error: 'Failed to add event' });
  }
});

// Update a task
app.put('/api/tasks/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    const { id } = req.params;
    const { task, event_date, user_id } = req.body;
    if (!task || task.trim() === '') {
      return res.status(400).json({ error: 'Event is required' });
    }
    if (!event_date) {
      return res.status(400).json({ error: 'Event date is required' });
    }
    const updatedTask = await updateTask(db, id, task.trim(), event_date, user_id || null);
    res.json(updatedTask);
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// Delete a task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    const { id } = req.params;
    await deleteTask(db, id);
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// --- Life events API (Supabase `events` table) ---

app.get('/api/events', async (req, res) => {
  try {
    if (!supabaseEvents.isConfigured()) {
      return res.status(503).json({ error: 'Events require Supabase (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)' });
    }
    const userId = req.query.user_id;
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ error: 'user_id query parameter is required' });
    }
    const rows = await supabaseEvents.getEventsForUser(userId.trim());
    res.json(rows);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch events' });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    if (!supabaseEvents.isConfigured()) {
      return res.status(503).json({ error: 'Events require Supabase' });
    }
    const { event, event_date, user_id, who, shared, copied } = req.body || {};
    if (!event || String(event).trim() === '') {
      return res.status(400).json({ error: 'Event is required' });
    }
    if (!event_date) {
      return res.status(400).json({ error: 'Event date is required' });
    }
    if (!user_id || typeof user_id !== 'string' || !user_id.trim()) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    const row = await supabaseEvents.insertEvent({
      event: String(event).trim(),
      event_date,
      owner: user_id.trim(),
      shared: shared != null ? shared : null,
      copied: copied !== undefined ? copied : undefined
    });
    res.status(201).json(row);
  } catch (error) {
    console.error('Error adding event:', error);
    res.status(500).json({ error: error.message || 'Failed to add event' });
  }
});

app.put('/api/events/:id', async (req, res) => {
  try {
    if (!supabaseEvents.isConfigured()) {
      return res.status(503).json({ error: 'Events require Supabase' });
    }
    const { id } = req.params;
    const { event, event_date, user_id, who, owner, shared, copied } = req.body || {};
    if (!user_id || typeof user_id !== 'string' || !user_id.trim()) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    if (!event || String(event).trim() === '') {
      return res.status(400).json({ error: 'Event is required' });
    }
    if (!event_date) {
      return res.status(400).json({ error: 'Event date is required' });
    }
    const existing = await supabaseEvents.getEventById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Event not found' });
    }
    if (!supabaseEvents.rowVisibleForUser(existing, user_id.trim())) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const payload = {
      event: String(event).trim(),
      event_date,
      who: who !== undefined ? who : existing.who,
      owner: owner !== undefined ? owner : existing.owner,
      shared: shared !== undefined ? shared : existing.shared
    };
    if (copied !== undefined) payload.copied = copied;
    const updated = await supabaseEvents.updateEvent(id, payload);
    res.json(updated);
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: error.message || 'Failed to update event' });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    if (!supabaseEvents.isConfigured()) {
      return res.status(503).json({ error: 'Events require Supabase' });
    }
    const { id } = req.params;
    const userId = req.query.user_id;
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ error: 'user_id query parameter is required' });
    }
    const existing = await supabaseEvents.getEventById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Event not found' });
    }
    if (!supabaseEvents.rowVisibleForUser(existing, userId.trim())) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await supabaseEvents.deleteEvent(id);
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ error: error.message || 'Failed to delete event' });
  }
});

// --- Friends API (Supabase `friends` table: user1, user2) ---

app.get('/api/friends/incoming', async (req, res) => {
  try {
    if (!supabaseFriends.isConfigured()) {
      return res.status(503).json({ error: 'Friends require Supabase (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)' });
    }
    const userId = req.query.user_id;
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ error: 'user_id query parameter is required' });
    }
    const rows = await supabaseFriends.listIncomingInvites(userId.trim());
    res.json(rows);
  } catch (error) {
    console.error('Error fetching friend requests:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch friend requests' });
  }
});

app.get('/api/friends', async (req, res) => {
  try {
    if (!supabaseFriends.isConfigured()) {
      return res.status(503).json({ error: 'Friends require Supabase (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)' });
    }
    const userId = req.query.user_id;
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ error: 'user_id query parameter is required' });
    }
    const rows = await supabaseFriends.listFriendsForUser(userId.trim());
    res.json(rows);
  } catch (error) {
    console.error('Error fetching friends:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch friends' });
  }
});

app.post('/api/friends', async (req, res) => {
  try {
    if (!supabaseFriends.isConfigured()) {
      return res.status(503).json({ error: 'Friends require Supabase' });
    }
    const { user_id, friend_id, friend_email } = req.body || {};
    const friendTarget =
      friend_id != null && String(friend_id).trim() !== ''
        ? String(friend_id).trim()
        : friend_email != null && String(friend_email).trim() !== ''
          ? String(friend_email).trim()
          : null;
    if (!user_id || typeof user_id !== 'string' || !user_id.trim()) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    if (!friendTarget) {
      return res.status(400).json({ error: 'friend_id (or friend_email) is required' });
    }
    const row = await supabaseFriends.insertFriend({
      user_id: user_id.trim(),
      friend_id: friendTarget
    });
    res.status(201).json(row);
  } catch (error) {
    console.error('Error adding friend:', error);
    const msg = error.message || String(error);
    const code = error.code;
    if (code === '23505' || /duplicate|unique/i.test(msg)) {
      return res.status(409).json({ error: 'That friend is already in your list.' });
    }
    res.status(500).json({ error: msg || 'Failed to add friend' });
  }
});

app.patch('/api/friends/:id', async (req, res) => {
  try {
    if (!supabaseFriends.isConfigured()) {
      return res.status(503).json({ error: 'Friends require Supabase' });
    }
    const { id } = req.params;
    const { user_id, action } = req.body || {};
    if (!user_id || typeof user_id !== 'string' || !user_id.trim()) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    if (action !== 'accept' && action !== 'reject') {
      return res.status(400).json({ error: 'action must be accept or reject' });
    }
    const ok = await supabaseFriends.respondToInvite(id, user_id.trim(), action);
    if (!ok) {
      return res.status(404).json({ error: 'Request not found or not allowed' });
    }
    res.json({ message: 'Updated' });
  } catch (error) {
    console.error('Error responding to friend request:', error);
    res.status(500).json({ error: error.message || 'Failed to update request' });
  }
});

app.delete('/api/friends/:id', async (req, res) => {
  try {
    if (!supabaseFriends.isConfigured()) {
      return res.status(503).json({ error: 'Friends require Supabase' });
    }
    const { id } = req.params;
    const userId = req.query.user_id;
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ error: 'user_id query parameter is required' });
    }
    const ok = await supabaseFriends.deleteFriendForUser(id, userId.trim());
    if (!ok) {
      return res.status(404).json({ error: 'Friend entry not found' });
    }
    res.json({ message: 'Removed' });
  } catch (error) {
    console.error('Error deleting friend:', error);
    res.status(500).json({ error: error.message || 'Failed to remove friend' });
  }
});

// --- Habits API (habits.db) ---

app.get('/api/habits', async (req, res) => {
  try {
    if (!habitsDb) {
      return res.status(500).json({ error: 'Habits database not initialized' });
    }
    const habits = useSupabaseHabits ? await supabaseHabits.getAllHabits() : await getAllHabits(habitsDb);
    res.json(habits);
  } catch (error) {
    console.error('Error fetching habits:', error);
    const message = error?.message || error?.error_description || String(error);
    res.status(500).json({ error: 'Failed to fetch habits', details: message });
  }
});

app.post('/api/habits', async (req, res) => {
  try {
    if (!habitsDb) {
      return res.status(500).json({ error: 'Habits database not initialized' });
    }
    const { task, event_date, user_id } = req.body;
    if (!task || task.trim() === '') {
      return res.status(400).json({ error: 'Habit is required' });
    }
    if (!event_date) {
      return res.status(400).json({ error: 'Start date is required' });
    }
    const newHabit = useSupabaseHabits ? await supabaseHabits.addHabit(task.trim(), event_date, user_id || null) : await addHabit(habitsDb, task.trim(), event_date, user_id || null);
    res.status(201).json(newHabit);
  } catch (error) {
    console.error('Error adding habit:', error);
    res.status(500).json({ error: 'Failed to add habit' });
  }
});

app.put('/api/habits/:id', async (req, res) => {
  try {
    if (!habitsDb) {
      return res.status(500).json({ error: 'Habits database not initialized' });
    }
    const { id } = req.params;
    const { task, event_date, user_id } = req.body;
    if (!task || task.trim() === '') {
      return res.status(400).json({ error: 'Habit is required' });
    }
    if (!event_date) {
      return res.status(400).json({ error: 'Start date is required' });
    }
    const updated = useSupabaseHabits ? await supabaseHabits.updateHabit(id, task.trim(), event_date, user_id || null) : await updateHabit(habitsDb, id, task.trim(), event_date, user_id || null);
    res.json(updated);
  } catch (error) {
    console.error('Error updating habit:', error);
    res.status(500).json({ error: 'Failed to update habit' });
  }
});

app.delete('/api/habits/:id', async (req, res) => {
  try {
    if (!habitsDb) {
      return res.status(500).json({ error: 'Habits database not initialized' });
    }
    const { id } = req.params;
    if (useSupabaseHabits) await supabaseHabits.deleteHabit(id); else await deleteHabit(habitsDb, id);
    res.json({ message: 'Habit deleted successfully' });
  } catch (error) {
    console.error('Error deleting habit:', error);
    res.status(500).json({ error: 'Failed to delete habit' });
  }
});

// --- Goals API (Supabase goals_list only) ---

app.get('/api/goals', async (req, res) => {
  try {
    if (!supabaseGoals.isConfigured()) {
      return res.status(503).json({ error: 'Goals require Supabase (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)' });
    }
    const userId = req.query.user_id;
    if (!userId) {
      return res.status(400).json({ error: 'user_id query parameter is required' });
    }
    const row = await supabaseGoals.getGoalsRow(userId);
    res.json(row || null);
  } catch (error) {
    console.error('Error fetching goals:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch goals' });
  }
});

app.post('/api/goals', async (req, res) => {
  try {
    if (!supabaseGoals.isConfigured()) {
      return res.status(503).json({ error: 'Goals require Supabase (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)' });
    }
    const { user_id, goal } = req.body || {};
    if (!user_id || typeof user_id !== 'string' || !user_id.trim()) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    const result = await supabaseGoals.addGoal(user_id.trim(), goal);
    res.status(201).json(result);
  } catch (error) {
    console.error('Error adding goal:', error);
    res.status(400).json({ error: error.message || 'Failed to add goal' });
  }
});

app.patch('/api/goals', async (req, res) => {
  try {
    if (!supabaseGoals.isConfigured()) {
      return res.status(503).json({ error: 'Goals require Supabase (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)' });
    }
    const { user_id, goal_index, value } = req.body || {};
    if (!user_id || typeof user_id !== 'string' || !user_id.trim()) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    const idx = goal_index != null ? Number(goal_index) : NaN;
    if (!Number.isInteger(idx) || idx < 1 || idx > 8) {
      return res.status(400).json({ error: 'goal_index must be 1..8' });
    }
    const result = await supabaseGoals.updateGoal(user_id.trim(), idx, value);
    res.json(result);
  } catch (error) {
    console.error('Error updating goal:', error);
    res.status(400).json({ error: error.message || 'Failed to update goal' });
  }
});

app.get('/api/goals/values', async (req, res) => {
  try {
    if (!supabaseGoals.isConfigured()) {
      return res.status(503).json({ error: 'Goals require Supabase (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)' });
    }
    const userId = req.query.user_id;
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ error: 'user_id query parameter is required' });
    }
    const weekStart = req.query.week_start;
    const goalNameParam = req.query.goal_name;
    const options = {};
    if (weekStart != null && String(weekStart).trim() !== '') {
      const ws = String(weekStart).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ws)) {
        return res.status(400).json({ error: 'week_start must be YYYY-MM-DD' });
      }
      options.weekStart = ws;
    }
    if (goalNameParam != null && String(goalNameParam).trim() !== '') {
      options.goalName = String(goalNameParam).trim();
    }
    const rows = await supabaseGoals.getGoalValues(userId.trim(), options);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching goal values:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch goal values' });
  }
});

app.post('/api/goals/values', async (req, res) => {
  try {
    if (!supabaseGoals.isConfigured()) {
      return res.status(503).json({ error: 'Goals require Supabase (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)' });
    }
    const { user_id, goal_name, value, date } = req.body || {};
    if (!user_id || typeof user_id !== 'string' || !user_id.trim()) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    const result = await supabaseGoals.upsertGoalValue(
      user_id.trim(),
      goal_name != null ? String(goal_name) : '',
      value != null ? String(value).trim() : '',
      date != null && String(date).trim() !== '' ? String(date).trim() : null
    );
    res.status(201).json(result);
  } catch (error) {
    console.error('Error saving goal value:', error);
    const message = error.message || 'Failed to save goal value';
    res.status(500).json({ error: message });
  }
});

// --- Temporary variables API (Supabase temporary_variables) ---

app.post('/api/temporary_variables', async (req, res) => {
  try {
    if (!supabaseTemporary.isConfigured()) {
      return res.status(503).json({ error: 'Temporary variables require Supabase (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)' });
    }
    const { user_id, key, value } = req.body || {};
    const userId = (user_id || '').trim();
    const k = (key || '').trim();
    const v = value != null ? String(value) : '';
    if (!userId || !k) {
      return res.status(400).json({ error: 'user_id and key are required' });
    }
    const row = await supabaseTemporary.upsertVariable(userId, k, v);
    res.status(201).json(row);
  } catch (error) {
    console.error('Error saving temporary variable:', error);
    res.status(500).json({ error: error.message || 'Failed to save temporary variable' });
  }
});

app.get('/api/temporary_variables', async (req, res) => {
  try {
    if (!supabaseTemporary.isConfigured()) {
      return res.status(503).json({ error: 'Temporary variables require Supabase (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)' });
    }
    const userId = (req.query.user_id || '').trim();
    const key = (req.query.key || '').trim();
    if (!userId || !key) {
      return res.status(400).json({ error: 'user_id and key query parameters are required' });
    }
    const row = await supabaseTemporary.getVariable(userId, key);
    console.log('[GET temporary_variables] user_id=%j key=%j found=%s', userId, key, !!row);
    if (!row) return res.json(null);
    res.json({ temporary_table_value: row.temporary_table_value });
  } catch (error) {
    console.error('Error fetching temporary variable:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch temporary variable' });
  }
});

// Handle all other routes by serving index.html (for client-side routing if needed)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Access your site at: http://localhost:${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please stop the other process or use a different port.`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

