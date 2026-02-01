const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file path
const DB_PATH = path.join(__dirname, 'tasks.db');

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
        event_date DATE
      )
    `, (err) => {
      if (err) {
        console.error('Error creating table:', err);
        reject(err);
      } else {
        console.log('Tasks table ready');
        
        // Migration: Convert completed to event_date
        db.all("PRAGMA table_info(tasks)", (pragmaErr, rows) => {
          if (!pragmaErr && rows && Array.isArray(rows)) {
            const columnNames = rows.map(row => row.name);
            const hasCompletedColumn = columnNames.includes('completed');
            const hasEventDateColumn = columnNames.includes('event_date');
            const needsMigration = hasCompletedColumn && !hasEventDateColumn;
            
            if (needsMigration) {
              console.log('Migrating database: converting completed to event_date...');
              // Add event_date column
              db.run(`
                ALTER TABLE tasks ADD COLUMN event_date DATE
              `, (alterErr) => {
                if (alterErr) {
                  console.error('Error adding event_date column:', alterErr);
                  resolve(db);
                } else {
                  // Copy completed datetime to event_date (if completed exists, use it as event_date)
                  db.run(`
                    UPDATE tasks SET event_date = DATE(completed) WHERE completed IS NOT NULL
                  `, (updateErr) => {
                    if (updateErr) {
                      console.error('Error updating event_date:', updateErr);
                    }
                    // Drop completed column (SQLite doesn't support DROP COLUMN, so we need to recreate table)
                    db.run(`
                      CREATE TABLE tasks_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        task TEXT NOT NULL,
                        event_date DATE
                      )
                    `, (createErr) => {
                      if (createErr) {
                        console.error('Error creating new table:', createErr);
                        resolve(db);
                      } else {
                        db.run(`
                          INSERT INTO tasks_new (id, task, event_date)
                          SELECT id, task, event_date FROM tasks
                        `, (copyErr) => {
                          if (copyErr) {
                            console.error('Error copying data:', copyErr);
                            resolve(db);
                          } else {
                            db.run(`DROP TABLE tasks`, (dropErr) => {
                              if (dropErr) {
                                console.error('Error dropping old table:', dropErr);
                                resolve(db);
                              } else {
                                db.run(`ALTER TABLE tasks_new RENAME TO tasks`, (renameErr) => {
                                  if (renameErr) {
                                    console.error('Error renaming table:', renameErr);
                                  } else {
                                    console.log('Migration complete: converted completed to event_date');
                                  }
                                  resolve(db);
                                });
                              }
                            });
                          }
                        });
                      }
                    });
                  });
                }
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
function addTask(db, task, eventDate = null) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO tasks (task, event_date) VALUES (?, ?)',
      [task, eventDate],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, task, event_date: eventDate });
        }
      }
    );
  });
}

// Update a task
function updateTask(db, id, task, eventDate) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE tasks SET task = ?, event_date = ? WHERE id = ?',
      [task, eventDate, id],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, task, event_date: eventDate });
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


module.exports = {
  initDatabase,
  getAllTasks,
  addTask,
  updateTask,
  deleteTask
};
