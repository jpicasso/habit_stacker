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

const app = express();
const useSupabaseHabits = supabaseHabits.isConfigured();

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

