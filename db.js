const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file paths
const DB_PATH = path.join(__dirname, 'tasks.db');
const HABITS_DB_PATH = path.join(__dirname, 'habits.db');

// Create and initialize database
function initDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }
      console.log('Connected to SQLite database');
    });

    // Create tasks table if it doesn't exist
    db.run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task TEXT NOT NULL,
        event_date DATE,
        user_id TEXT
      )
    `, (err) => {
      if (err) {
        console.error('Error creating table:', err);
        reject(err);
      } else {
        console.log('Tasks table ready');
        
        // Migration: Add user_id column if it doesn't exist
        db.all("PRAGMA table_info(tasks)", (pragmaErr, rows) => {
          if (!pragmaErr && rows && Array.isArray(rows)) {
            const columnNames = rows.map(row => row.name);
            const hasUserIdColumn = columnNames.includes('user_id');
            
            if (!hasUserIdColumn) {
              console.log('Migrating database: adding user_id column...');
              db.run(`
                ALTER TABLE tasks ADD COLUMN user_id TEXT
              `, (alterErr) => {
                if (alterErr) {
                  console.error('Error adding user_id column:', alterErr);
                } else {
                  console.log('Migration complete: added user_id column');
                }
                resolve(db);
              });
            } else {
              resolve(db);
            }
          } else {
            resolve(db);
          }
        });
      }
    });
  });
}

// Get all tasks
function getAllTasks(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM tasks ORDER BY id DESC', (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Add a new task
function addTask(db, task, eventDate = null, userId = null) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO tasks (task, event_date, user_id) VALUES (?, ?, ?)',
      [task, eventDate, userId],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, task, event_date: eventDate, user_id: userId });
        }
      }
    );
  });
}

// Update a task
function updateTask(db, id, task, eventDate, userId = null) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE tasks SET task = ?, event_date = ?, user_id = ? WHERE id = ?',
      [task, eventDate, userId, id],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, task, event_date: eventDate, user_id: userId });
        }
      }
    );
  });
}

// Delete a task
function deleteTask(db, id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM tasks WHERE id = ?', [id], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id });
      }
    });
  });
}

// --- Habits database (habits.db) ---

function initHabitsDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(HABITS_DB_PATH, (err) => {
      if (err) {
        console.error('Error opening habits database:', err);
        reject(err);
        return;
      }
      console.log('Connected to habits SQLite database');
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS habits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task TEXT NOT NULL,
        event_date DATE,
        user_id TEXT
      )
    `, (err) => {
      if (err) {
        console.error('Error creating habits table:', err);
        reject(err);
      } else {
        console.log('Habits table ready');
        db.all("PRAGMA table_info(habits)", (pragmaErr, rows) => {
          if (!pragmaErr && rows && Array.isArray(rows)) {
            const columnNames = rows.map(row => row.name);
            if (!columnNames.includes('user_id')) {
              db.run('ALTER TABLE habits ADD COLUMN user_id TEXT', (alterErr) => {
                if (!alterErr) console.log('Habits: added user_id column');
                resolve(db);
              });
            } else {
              resolve(db);
            }
          } else {
            resolve(db);
          }
        });
      }
    });
  });
}

function getAllHabits(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM habits ORDER BY id DESC', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function addHabit(db, task, eventDate = null, userId = null) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO habits (task, event_date, user_id) VALUES (?, ?, ?)',
      [task, eventDate, userId],
      function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, task, event_date: eventDate, user_id: userId });
      }
    );
  });
}

function updateHabit(db, id, task, eventDate, userId = null) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE habits SET task = ?, event_date = ?, user_id = ? WHERE id = ?',
      [task, eventDate, userId, id],
      function(err) {
        if (err) reject(err);
        else resolve({ id, task, event_date: eventDate, user_id: userId });
      }
    );
  });
}

function deleteHabit(db, id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM habits WHERE id = ?', [id], function(err) {
      if (err) reject(err);
      else resolve({ id });
    });
  });
}

module.exports = {
  initDatabase,
  getAllTasks,
  addTask,
  updateTask,
  deleteTask,
  initHabitsDatabase,
  getAllHabits,
  addHabit,
  updateHabit,
  deleteHabit
};
