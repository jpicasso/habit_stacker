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
const supabaseGroups = require('./supabase-groups');
const supabaseContacts = require('./supabase-contacts');
const supabaseProfiles = require('./supabase-profiles');

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
if (supabaseGroups.isConfigured()) {
  console.log('Groups API using Supabase');
}
if (supabaseProfiles.isConfigured()) {
  console.log('Profiles API using Supabase');
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
      who: who != null ? who : undefined,
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
    const { private_notes } = req.body || {};
    const row = await supabaseFriends.insertFriend({
      user_id: user_id.trim(),
      friend_id: friendTarget,
      private_notes
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
    const { user_id, action, private_notes } = req.body || {};
    if (!user_id || typeof user_id !== 'string' || !user_id.trim()) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    if (action === 'accept' || action === 'reject') {
      const ok = await supabaseFriends.respondToInvite(id, user_id.trim(), action);
      if (!ok) {
        return res.status(404).json({ error: 'Request not found or not allowed' });
      }
      return res.json({ message: 'Updated' });
    }
    if (private_notes !== undefined) {
      const ok = await supabaseFriends.updateFriendPrivateNotes(id, user_id.trim(), private_notes);
      if (!ok) {
        return res.status(404).json({ error: 'Friend entry not found' });
      }
      return res.json({ message: 'Updated' });
    }
    return res.status(400).json({ error: 'Send action (accept/reject) or private_notes' });
  } catch (error) {
    console.error('Error updating friend:', error);
    res.status(500).json({ error: error.message || 'Failed to update friend' });
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

// --- Contacts API (Supabase `contacts` table) ---

app.get('/api/contacts', async (req, res) => {
  try {
    if (!supabaseContacts.isConfigured()) {
      return res.status(503).json({ error: 'Contacts require Supabase (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)' });
    }
    const userId = req.query.user_id;
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ error: 'user_id query parameter is required' });
    }
    const rows = await supabaseContacts.getContactsForOwner(userId.trim());
    res.json(rows);
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch contacts' });
  }
});

app.post('/api/contacts', async (req, res) => {
  try {
    if (!supabaseContacts.isConfigured()) {
      return res.status(503).json({ error: 'Contacts require Supabase' });
    }
    const { user_id, name, private_notes } = req.body || {};
    if (!user_id || typeof user_id !== 'string' || !user_id.trim()) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const row = await supabaseContacts.insertContact({
      name: name.trim(),
      owner: user_id.trim(),
      private_notes
    });
    res.status(201).json(row);
  } catch (error) {
    console.error('Error adding contact:', error);
    res.status(500).json({ error: error.message || 'Failed to add contact' });
  }
});

app.patch('/api/contacts/:id', async (req, res) => {
  try {
    if (!supabaseContacts.isConfigured()) {
      return res.status(503).json({ error: 'Contacts require Supabase' });
    }
    const { id } = req.params;
    const { user_id, name, notes } = req.body || {};
    if (!user_id || typeof user_id !== 'string' || !user_id.trim()) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    if (name === undefined && notes === undefined) {
      return res.status(400).json({ error: 'Provide name and/or notes' });
    }
    await supabaseContacts.updateContactForOwner({
      id,
      ownerUserId: user_id.trim(),
      name,
      notes
    });
    res.json({ message: 'Updated' });
  } catch (error) {
    const status = error.status || 500;
    console.error('Error updating contact:', error);
    res.status(status).json({ error: error.message || 'Failed to update contact' });
  }
});

app.delete('/api/contacts', async (req, res) => {
  try {
    if (!supabaseContacts.isConfigured()) {
      return res.status(503).json({ error: 'Contacts require Supabase' });
    }
    const userId = req.query.user_id;
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ error: 'user_id query parameter is required' });
    }
    const id = req.query.id;
    const name = req.query.name;
    if (id != null && String(id).trim() !== '') {
      const ok = await supabaseContacts.deleteContactByIdForOwner(String(id).trim(), userId.trim());
      return res.json({ deleted: ok ? 1 : 0 });
    }
    if (name != null && String(name).trim() !== '') {
      const n = await supabaseContacts.deleteContactsByOwnerAndName(userId.trim(), String(name).trim());
      return res.json({ deleted: n });
    }
    return res.status(400).json({ error: 'Provide id or name' });
  } catch (error) {
    const status = error.status || 500;
    console.error('Error deleting contact:', error);
    res.status(status).json({ error: error.message || 'Failed to delete contact' });
  }
});

// Serve the profiles page for a handle URL  e.g. /events/@meganpicasso  or  /events/@meganpicasso/profiles.html
app.get(['/events/@:handle', '/events/@:handle/profiles.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'events', 'profiles.html'));
});

// --- Profiles API (Supabase `profiles` table) ---

app.get('/api/profile', async (req, res) => {
  try {
    if (!supabaseProfiles.isConfigured()) {
      return res.status(503).json({ error: 'Profiles require Supabase (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)' });
    }
    const userId = req.query.user_id;
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ error: 'user_id query parameter is required' });
    }
    const row = await supabaseProfiles.getProfileByEmail(userId.trim());
    res.json(row);
  } catch (error) {
    console.error('Error fetching profile:', error);
    const msg = (error.message || '').toLowerCase();
    if (/does not exist/i.test(msg) || error.code === '42P01' || error.code === '42703') {
      return res.json(null);
    }
    res.status(500).json({ error: error.message || 'Failed to fetch profile' });
  }
});

app.get('/api/profile/by-handle', async (req, res) => {
  try {
    if (!supabaseProfiles.isConfigured()) {
      return res.status(503).json({ error: 'Profiles require Supabase' });
    }
    const handle = req.query.handle;
    if (!handle || !handle.trim()) {
      return res.status(400).json({ error: 'handle query parameter is required' });
    }
    const row = await supabaseProfiles.getProfileByHandle(handle.trim());
    res.json(row);
  } catch (error) {
    console.error('Error fetching profile by handle:', error);
    const msg = (error.message || '').toLowerCase();
    if (/does not exist/i.test(msg) || error.code === '42P01' || error.code === '42703') {
      return res.json(null);
    }
    res.status(500).json({ error: error.message || 'Failed to fetch profile' });
  }
});

app.put('/api/profile', async (req, res) => {
  try {
    if (!supabaseProfiles.isConfigured()) {
      return res.status(503).json({ error: 'Profiles require Supabase' });
    }
    const { user_id, name, handle, location } = req.body || {};
    if (!user_id || typeof user_id !== 'string' || !user_id.trim()) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!handle || typeof handle !== 'string' || !handle.trim()) {
      return res.status(400).json({ error: 'handle is required' });
    }
    const row = await supabaseProfiles.upsertProfile(user_id.trim(), {
      name: name.trim(),
      handle: handle.trim(),
      location: location ? location.trim() : null
    });
    res.json(row);
  } catch (error) {
    console.error('Error saving profile:', error);
    res.status(500).json({ error: error.message || 'Failed to save profile' });
  }
});

app.get('/api/profile/work', async (req, res) => {
  try {
    if (!supabaseProfiles.isConfigured()) {
      return res.status(503).json({ error: 'Profiles require Supabase' });
    }
    // Prefer handle lookup; fall back to email (user_id)
    const handle = req.query.handle;
    const userId = req.query.user_id;
    let row = null;
    if (handle && handle.trim()) {
      row = await supabaseProfiles.getWorkProfileByHandle(handle.trim());
    } else if (userId && userId.trim()) {
      row = await supabaseProfiles.getWorkProfileByEmail(userId.trim());
    } else {
      return res.status(400).json({ error: 'handle or user_id query parameter is required' });
    }
    res.json(row);
  } catch (error) {
    console.error('Error fetching work profile:', error);
    const msg = (error.message || '').toLowerCase();
    if (/does not exist/i.test(msg) || error.code === '42P01' || error.code === '42703') {
      return res.json(null);
    }
    res.status(500).json({ error: error.message || 'Failed to fetch work profile' });
  }
});

/** Work info for a saved contact: `contact_details` row keyed by owners_handle + contact_name */
app.get('/api/contact-details/work', async (req, res) => {
  try {
    if (!supabaseProfiles.isConfigured()) {
      return res.status(503).json({ error: 'Profiles require Supabase' });
    }
    const ownersHandle = req.query.owners_handle;
    const contactName = req.query.contact_name;
    if (!ownersHandle || !String(ownersHandle).trim()) {
      return res.status(400).json({ error: 'owners_handle query parameter is required' });
    }
    if (!contactName || !String(contactName).trim()) {
      return res.status(400).json({ error: 'contact_name query parameter is required' });
    }
    const row = await supabaseProfiles.getContactDetailsWork(
      ownersHandle.trim(),
      contactName.trim()
    );
    res.json(row);
  } catch (error) {
    console.error('Error fetching contact_details work:', error);
    const msg = (error.message || '').toLowerCase();
    if (/does not exist/i.test(msg) || error.code === '42P01' || error.code === '42703') {
      return res.json(null);
    }
    res.status(500).json({ error: error.message || 'Failed to fetch contact work' });
  }
});

/** Update or insert a row in `contact_details` (owner must match logged-in profile). */
app.put('/api/contact-details', async (req, res) => {
  try {
    if (!supabaseProfiles.isConfigured()) {
      return res.status(503).json({ error: 'Profiles require Supabase' });
    }
    const body = req.body || {};
    const user_id = body.user_id;
    const owners_handle = body.owners_handle;
    const lookup_contact_name =
      body.lookup_contact_name != null && String(body.lookup_contact_name).trim() !== ''
        ? String(body.lookup_contact_name).trim()
        : '';
    if (!user_id || typeof user_id !== 'string' || !user_id.trim()) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    if (!owners_handle || !String(owners_handle).trim()) {
      return res.status(400).json({ error: 'owners_handle is required' });
    }
    if (!lookup_contact_name) {
      return res.status(400).json({ error: 'lookup_contact_name is required' });
    }
    const {
      user_id: _u,
      owners_handle: _o,
      lookup_contact_name: _l,
      ...patch
    } = body;
    const row = await supabaseProfiles.upsertContactDetails(
      user_id.trim(),
      owners_handle.trim(),
      lookup_contact_name,
      patch
    );
    res.json(row);
  } catch (error) {
    console.error('Error saving contact_details:', error);
    const msg = error.message || 'Failed to save contact';
    if (msg === 'Forbidden') {
      return res.status(403).json({ error: msg });
    }
    res.status(500).json({ error: msg });
  }
});

app.put('/api/profile/work', async (req, res) => {
  try {
    if (!supabaseProfiles.isConfigured()) {
      return res.status(503).json({ error: 'Profiles require Supabase' });
    }
    const { user_id, ...workFields } = req.body || {};
    if (!user_id || typeof user_id !== 'string' || !user_id.trim()) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    const row = await supabaseProfiles.upsertWorkProfile(user_id.trim(), workFields);
    res.json(row);
  } catch (error) {
    console.error('Error saving work profile:', error);
    res.status(500).json({ error: error.message || 'Failed to save work profile' });
  }
});

app.get('/api/profile/family', async (req, res) => {
  try {
    if (!supabaseProfiles.isConfigured()) {
      return res.status(503).json({ error: 'Profiles require Supabase' });
    }
    const handle = req.query.handle;
    if (!handle || !handle.trim()) {
      return res.status(400).json({ error: 'handle query parameter is required' });
    }
    const row = await supabaseProfiles.getFamilyProfileByHandle(handle.trim());
    res.json(row);
  } catch (error) {
    console.error('Error fetching family profile:', error);
    const msg = (error.message || '').toLowerCase();
    if (/does not exist/i.test(msg) || error.code === '42P01' || error.code === '42703') {
      return res.json(null);
    }
    res.status(500).json({ error: error.message || 'Failed to fetch family profile' });
  }
});

app.put('/api/profile/family', async (req, res) => {
  try {
    if (!supabaseProfiles.isConfigured()) {
      return res.status(503).json({ error: 'Profiles require Supabase' });
    }
    const { user_id, ...familyFields } = req.body || {};
    if (!user_id || typeof user_id !== 'string' || !user_id.trim()) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    const row = await supabaseProfiles.upsertFamilyProfile(user_id.trim(), familyFields);
    res.json(row);
  } catch (error) {
    console.error('Error saving family profile:', error);
    res.status(500).json({ error: error.message || 'Failed to save family profile' });
  }
});

app.get('/api/profile/photo', async (req, res) => {
  try {
    const handle = req.query.handle;
    if (!handle || !handle.trim()) {
      return res.status(400).json({ error: 'handle query parameter is required' });
    }
    const url = await supabaseProfiles.getProfilePhotoUrl(handle.trim());
    res.json({ url: url || null });
  } catch (error) {
    console.error('Error fetching profile photo URL:', error);
    res.json({ url: null });
  }
});

app.post('/api/profile/photo', async (req, res) => {
  try {
    if (!supabaseProfiles.isConfigured()) {
      return res.status(503).json({ error: 'Profiles require Supabase' });
    }
    const { handle, imageBase64, contentType } = req.body || {};
    if (!handle || !handle.trim()) {
      return res.status(400).json({ error: 'handle is required' });
    }
    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 is required' });
    }
    const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const url = await supabaseProfiles.uploadProfilePhoto(
      handle.trim(),
      buffer,
      contentType || 'image/jpeg'
    );
    res.json({ url });
  } catch (error) {
    console.error('Error uploading profile photo:', error);
    res.status(500).json({ error: error.message || 'Failed to upload photo' });
  }
});

/** Bucket `contact_photos`: `{owners_handle}_{contactNameSlug}.{ext}` */
app.get('/api/contact-photo', async (req, res) => {
  try {
    if (!supabaseProfiles.isConfigured()) {
      return res.status(503).json({ error: 'Supabase required' });
    }
    const ownersHandle = req.query.owners_handle;
    const contactName = req.query.contact_name;
    if (!ownersHandle || !String(ownersHandle).trim()) {
      return res.status(400).json({ error: 'owners_handle is required' });
    }
    if (!contactName || !String(contactName).trim()) {
      return res.status(400).json({ error: 'contact_name is required' });
    }
    const url = await supabaseProfiles.getContactPhotoUrlForContact(
      ownersHandle.trim(),
      contactName.trim()
    );
    res.json({ url: url || null });
  } catch (error) {
    console.error('Error fetching contact photo URL:', error);
    res.json({ url: null });
  }
});

app.post('/api/contact-photo', async (req, res) => {
  try {
    if (!supabaseProfiles.isConfigured()) {
      return res.status(503).json({ error: 'Supabase required' });
    }
    const { owners_handle, contact_name, imageBase64, contentType } = req.body || {};
    if (!owners_handle || !String(owners_handle).trim()) {
      return res.status(400).json({ error: 'owners_handle is required' });
    }
    if (!contact_name || !String(contact_name).trim()) {
      return res.status(400).json({ error: 'contact_name is required' });
    }
    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 is required' });
    }
    const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const url = await supabaseProfiles.uploadContactPhoto(
      owners_handle.trim(),
      contact_name.trim(),
      buffer,
      contentType || 'image/jpeg'
    );
    res.json({ url });
  } catch (error) {
    console.error('Error uploading contact photo:', error);
    res.status(500).json({ error: error.message || 'Failed to upload contact photo' });
  }
});

app.get('/api/profile/interests', async (req, res) => {
  try {
    if (!supabaseProfiles.isConfigured()) {
      return res.status(503).json({ error: 'Profiles require Supabase' });
    }
    const handle = req.query.handle;
    if (!handle || !handle.trim()) {
      return res.status(400).json({ error: 'handle query parameter is required' });
    }
    const row = await supabaseProfiles.getInterestsProfileByHandle(handle.trim());
    res.json(row);
  } catch (error) {
    console.error('Error fetching interests:', error);
    const msg = (error.message || '').toLowerCase();
    if (/does not exist/i.test(msg) || error.code === '42P01' || error.code === '42703') {
      return res.json(null);
    }
    res.status(500).json({ error: error.message || 'Failed to fetch interests' });
  }
});

app.put('/api/profile/interests', async (req, res) => {
  try {
    if (!supabaseProfiles.isConfigured()) {
      return res.status(503).json({ error: 'Profiles require Supabase' });
    }
    const { user_id, ...interestFields } = req.body || {};
    if (!user_id || typeof user_id !== 'string' || !user_id.trim()) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    const row = await supabaseProfiles.upsertInterestsProfile(user_id.trim(), interestFields);
    res.json(row);
  } catch (error) {
    console.error('Error saving interests:', error);
    res.status(500).json({ error: error.message || 'Failed to save interests' });
  }
});

// --- Groups API (Supabase `group_members` + `groups` tables) ---

app.get('/api/groups/connections', async (req, res) => {
  try {
    if (!supabaseGroups.isConfigured()) {
      return res.status(503).json({ error: 'Groups require Supabase' });
    }
    const userId = req.query.user_id;
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ error: 'user_id query parameter is required' });
    }
    const connections = await supabaseGroups.getConnectionsForUser(userId.trim());
    res.json(connections);
  } catch (error) {
    console.error('Error fetching connections:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch connections' });
  }
});

app.get('/api/groups/owned', async (req, res) => {
  try {
    if (!supabaseGroups.isConfigured()) {
      return res.status(503).json({ error: 'Groups require Supabase' });
    }
    const userId = req.query.user_id;
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ error: 'user_id query parameter is required' });
    }
    const rows = await supabaseGroups.listGroupsOwnedByUser(userId.trim());
    res.json(rows);
  } catch (error) {
    console.error('Error fetching owned groups:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch owned groups' });
  }
});

app.post('/api/groups/invite-member', async (req, res) => {
  try {
    if (!supabaseGroups.isConfigured()) {
      return res.status(503).json({ error: 'Groups require Supabase' });
    }
    const { user_id, group_name, member } = req.body || {};
    if (!user_id || typeof user_id !== 'string' || !user_id.trim()) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    if (!group_name || typeof group_name !== 'string' || !group_name.trim()) {
      return res.status(400).json({ error: 'group_name is required' });
    }
    if (!member || typeof member !== 'string' || !member.trim()) {
      return res.status(400).json({ error: 'member (email) is required' });
    }
    await supabaseGroups.inviteMemberAsOwner({
      group_name: group_name.trim(),
      member: member.trim(),
      ownerUserId: user_id.trim()
    });
    res.status(201).json({ message: 'Invited' });
  } catch (error) {
    const status = error.status || 500;
    console.error('Error inviting member:', error);
    res.status(status).json({ error: error.message || 'Failed to invite member' });
  }
});

app.get('/api/groups/members', async (req, res) => {
  try {
    if (!supabaseGroups.isConfigured()) {
      return res.status(503).json({ error: 'Groups require Supabase' });
    }
    const { group_name } = req.query;
    if (!group_name || !group_name.trim()) {
      return res.status(400).json({ error: 'group_name is required' });
    }
    const members = await supabaseGroups.getGroupMembers(group_name.trim());
    res.json(members);
  } catch (error) {
    console.error('Error fetching group members:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch group members' });
  }
});

app.get('/api/groups/details', async (req, res) => {
  try {
    if (!supabaseGroups.isConfigured()) {
      return res.status(503).json({ error: 'Groups require Supabase' });
    }
    const { group_name } = req.query;
    if (!group_name || !group_name.trim()) {
      return res.status(400).json({ error: 'group_name is required' });
    }
    const details = await supabaseGroups.getGroupDetails(group_name.trim());
    if (!details) return res.status(404).json({ error: 'Group not found' });
    res.json(details);
  } catch (error) {
    console.error('Error fetching group details:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch group details' });
  }
});

app.put('/api/groups/update', async (req, res) => {
  try {
    if (!supabaseGroups.isConfigured()) {
      return res.status(503).json({ error: 'Groups require Supabase' });
    }
    const { user_id, group_name, visibility, admins, members, invited_members } = req.body || {};
    if (!user_id || !user_id.trim()) return res.status(400).json({ error: 'user_id is required' });
    if (!group_name || !group_name.trim()) return res.status(400).json({ error: 'group_name is required' });
    const details = await supabaseGroups.getGroupDetails(group_name.trim());
    if (!details) return res.status(404).json({ error: 'Group not found' });
    const result = await supabaseGroups.updateGroup({
      group_name: group_name.trim(),
      visibility: visibility || null,
      admins: Array.isArray(admins) ? admins : [],
      members: Array.isArray(members) ? members : [],
      invited_members: Array.isArray(invited_members) ? invited_members : [],
      owner: details.owner
    });
    res.json(result);
  } catch (error) {
    console.error('Error updating group:', error);
    res.status(500).json({ error: error.message || 'Failed to update group' });
  }
});

app.delete('/api/groups/delete', async (req, res) => {
  try {
    if (!supabaseGroups.isConfigured()) {
      return res.status(503).json({ error: 'Groups require Supabase' });
    }
    const { user_id, group_name } = req.body || {};
    if (!user_id || !user_id.trim()) return res.status(400).json({ error: 'user_id is required' });
    if (!group_name || !group_name.trim()) return res.status(400).json({ error: 'group_name is required' });
    await supabaseGroups.deleteGroup(group_name.trim(), user_id.trim());
    res.json({ message: 'Group deleted' });
  } catch (error) {
    console.error('Error deleting group:', error);
    const status = error.status || 500;
    res.status(status).json({ error: error.message || 'Failed to delete group' });
  }
});

app.post('/api/groups/leave', async (req, res) => {
  try {
    if (!supabaseGroups.isConfigured()) {
      return res.status(503).json({ error: 'Groups require Supabase' });
    }
    const { user_id, group_name } = req.body || {};
    if (!user_id || !user_id.trim()) return res.status(400).json({ error: 'user_id is required' });
    if (!group_name || !group_name.trim()) return res.status(400).json({ error: 'group_name is required' });
    await supabaseGroups.leaveGroup(group_name.trim(), user_id.trim());
    res.json({ message: 'Left group' });
  } catch (error) {
    console.error('Error leaving group:', error);
    res.status(500).json({ error: error.message || 'Failed to leave group' });
  }
});

app.post('/api/groups', async (req, res) => {
  try {
    if (!supabaseGroups.isConfigured()) {
      return res.status(503).json({ error: 'Groups require Supabase (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)' });
    }
    const { user_id, group_name, visibility, admins, invited_members } = req.body || {};
    if (!user_id || typeof user_id !== 'string' || !user_id.trim()) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    if (!group_name || typeof group_name !== 'string' || !group_name.trim()) {
      return res.status(400).json({ error: 'group_name is required' });
    }
    if (!visibility || typeof visibility !== 'string' || !visibility.trim()) {
      return res.status(400).json({ error: 'visibility is required' });
    }
    const result = await supabaseGroups.createGroup({
      group_name: group_name.trim(),
      visibility: visibility.trim(),
      owner: user_id.trim(),
      admins: Array.isArray(admins) ? admins : [],
      invited_members: Array.isArray(invited_members) ? invited_members : []
    });

    // "Only me": ensure each listed member appears as a friend or contact; otherwise add a contact row
    const vis = visibility.trim();
    if (
      vis === 'Only me' &&
      supabaseFriends.isConfigured() &&
      supabaseContacts.isConfigured()
    ) {
      const owner = user_id.trim();
      const ownerLower = owner.toLowerCase();
      const members = Array.isArray(invited_members) ? invited_members : [];
      for (const raw of members) {
        const email = String(raw || '')
          .trim()
          .toLowerCase();
        if (!email || email === ownerLower) continue;
        try {
          const isFriend = await supabaseFriends.hasAnyFriendshipWith(owner, email);
          if (isFriend) continue;
          const isContact = await supabaseContacts.hasContactForOwner(owner, email);
          if (isContact) continue;
          await supabaseContacts.insertContact({ name: email, owner });
        } catch (ensureErr) {
          if (ensureErr.code !== '23505') {
            console.warn('Could not ensure contact for group member:', email, ensureErr.message);
          }
        }
      }
    }

    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating group:', error);
    if (error.code === '23505' || (error.message || '').toLowerCase().includes('duplicate')) {
      return res.status(409).json({ error: 'A group with that name already exists.' });
    }
    res.status(500).json({ error: error.message || 'Failed to create group' });
  }
});

app.get('/api/groups', async (req, res) => {
  try {
    if (!supabaseGroups.isConfigured()) {
      return res.status(503).json({ error: 'Groups require Supabase (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)' });
    }
    const userId = req.query.user_id;
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ error: 'user_id query parameter is required' });
    }
    const rows = await supabaseGroups.listGroupsForUser(userId.trim());
    res.json(rows);
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch groups' });
  }
});

app.get('/api/groups/invites', async (req, res) => {
  try {
    if (!supabaseGroups.isConfigured()) {
      return res.status(503).json({ error: 'Groups require Supabase (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)' });
    }
    const userId = req.query.user_id;
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ error: 'user_id query parameter is required' });
    }
    const rows = await supabaseGroups.listInvitesForUser(userId.trim());
    res.json(rows);
  } catch (error) {
    console.error('Error fetching group invites:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch group invites' });
  }
});

app.patch('/api/groups/:id', async (req, res) => {
  try {
    if (!supabaseGroups.isConfigured()) {
      return res.status(503).json({ error: 'Groups require Supabase' });
    }
    const { id } = req.params;
    const { user_id, action } = req.body || {};
    if (!user_id || typeof user_id !== 'string' || !user_id.trim()) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    if (action !== 'accept' && action !== 'reject') {
      return res.status(400).json({ error: 'action must be accept or reject' });
    }
    const ok = await supabaseGroups.respondToGroupInvite(id, user_id.trim(), action);
    if (!ok) {
      return res.status(404).json({ error: 'Invite not found or not allowed' });
    }
    res.json({ message: 'Updated' });
  } catch (error) {
    console.error('Error responding to group invite:', error);
    res.status(500).json({ error: error.message || 'Failed to update invite' });
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

