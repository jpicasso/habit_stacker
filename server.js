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
const supabaseFeedback = require('./supabase-feedback');
const supabaseAuth = require('./supabase-auth-server');

const app = express();
const useSupabaseHabits = supabaseHabits.isConfigured();

// Allow the Expo web app (and other frontends) to call /api from another origin.
// Browsers block cross-origin fetch without these headers ("Failed to fetch").
const defaultCorsOrigins = [
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://localhost:19006',
  'http://127.0.0.1:19006',
  'http://localhost:3000',
  'http://localhost:3001',
  'https://www.habitstackerapp.com',
  'https://habitstackerapp.com',
];
const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allowedOrigins = new Set([...defaultCorsOrigins, ...corsOrigins]);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, Accept'
    );
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET,POST,PUT,DELETE,OPTIONS'
    );
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Middleware (base64 photos in JSON are ~4× file size; use explicit byte limit)
const JSON_BODY_LIMIT_BYTES = 50 * 1024 * 1024; // 50 MiB
app.use(bodyParser.json({ limit: JSON_BODY_LIMIT_BYTES }));
app.use(
  bodyParser.urlencoded({ extended: true, limit: JSON_BODY_LIMIT_BYTES })
);

// Serve the Expo web export (and/or legacy Gulp site) from dist/
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
} else {
  console.warn('WARNING: dist folder not found. Run the Heroku/web build first.');
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
if (supabaseFeedback.isConfigured()) {
  console.log('Feedback using Supabase');
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

// --- Habits API ---
// All habit routes require a valid Supabase session (when Supabase is
// configured). The user's email from the verified token — not the request
// body — is used as user_id.

app.use('/api/habits', supabaseAuth.requireAuth());

app.get('/api/habits', async (req, res) => {
  try {
    if (!habitsDb) {
      return res.status(500).json({ error: 'Habits database not initialized' });
    }
    let habits = useSupabaseHabits ? await supabaseHabits.getAllHabits() : await getAllHabits(habitsDb);
    if (req.user?.email) {
      habits = habits.filter(h => h.user_id === req.user.email);
    }
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
    const ownerId = req.user?.email || user_id || null;
    const newHabit = useSupabaseHabits ? await supabaseHabits.addHabit(task.trim(), event_date, ownerId) : await addHabit(habitsDb, task.trim(), event_date, ownerId);
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
    const ownerId = req.user?.email || user_id || null;
    const updated = useSupabaseHabits ? await supabaseHabits.updateHabit(id, task.trim(), event_date, ownerId) : await updateHabit(habitsDb, id, task.trim(), event_date, ownerId);
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

// --- Feedback API (Supabase `feedback` table) ---

app.post('/api/feedback', async (req, res) => {
  try {
    if (!supabaseFeedback.isConfigured()) {
      return res.status(503).json({
        error: 'Feedback requires Supabase (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)'
      });
    }
    const { rating, details } = req.body || {};
    if (rating == null) {
      return res.status(400).json({ error: 'rating is required' });
    }
    const row = await supabaseFeedback.insertFeedback({
      rating,
      details: details != null ? details : null
    });
    res.status(201).json(row);
  } catch (error) {
    console.error('Error submitting feedback:', error);
    const msg = error.message || 'Failed to submit feedback';
    if (/rating must be/i.test(msg)) {
      return res.status(400).json({ error: msg });
    }
    res.status(500).json({ error: msg });
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

// --- Account deletion (Supabase Auth + habit rows) ---

app.post('/api/account/delete', supabaseAuth.requireAuth(), async (req, res) => {
  try {
    if (!supabaseAuth.isConfigured()) {
      return res.status(503).json({
        error: 'Account deletion requires Supabase (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)'
      });
    }
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'You must be logged in' });
    }
    await supabaseAuth.deleteUserAccount(req.user);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: error.message || 'Failed to delete account' });
  }
});

// SPA fallback: Expo Router client routes (e.g. /habits) → index.html
// Do not steal /api/* (those routes are registered above).
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  const indexHtml = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(indexHtml)) {
    return res.sendFile(indexHtml);
  }
  res.status(404).send('Not found — dist/index.html missing. Deploy the Expo web build.');
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

