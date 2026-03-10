/**
 * Goals storage using Supabase goals_list table.
 * Uses same SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as supabase-habits.
 */

let client = null;

function isConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getClient() {
  if (client) return client;
  if (!isConfigured()) return null;
  const { createClient } = require('@supabase/supabase-js');
  client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  return client;
}

/**
 * Get the goals row for a user_id (email). Returns null if none.
 */
async function getGoalsRow(userId) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('goals_list')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Add a goal for the user. If no row exists, insert one with goal1 = newGoal.
 * If row exists, set the first empty column among goal2..goal8 to newGoal.
 */
async function addGoal(userId, newGoal) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const trimmed = (newGoal && String(newGoal).trim()) || '';
  if (!trimmed) throw new Error('Goal text is required');

  const existing = await getGoalsRow(userId);

  if (!existing) {
    const { data, error } = await supabase
      .from('goals_list')
      .insert({ user_id: userId, goal1: trimmed })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  for (const col of ['goal2', 'goal3', 'goal4', 'goal5', 'goal6', 'goal7', 'goal8']) {
    const val = existing[col];
    if (val === null || val === undefined || String(val).trim() === '') {
      const { data, error } = await supabase
        .from('goals_list')
        .update({ [col]: trimmed })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  }

  throw new Error('You already have 8 goals. Delete one to add another.');
}

/**
 * Update a single goal column for the user. goalColumnIndex is 1..8 (goal1..goal8).
 */
async function updateGoal(userId, goalColumnIndex, newValue) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const col = 'goal' + Number(goalColumnIndex);
  if (!/^goal[1-8]$/.test(col)) throw new Error('goalColumnIndex must be 1..8');
  const trimmed = (newValue != null && String(newValue).trim() !== '') ? String(newValue).trim() : null;

  const existing = await getGoalsRow(userId);
  if (!existing) throw new Error('No goals row found for user');

  const { data, error } = await supabase
    .from('goals_list')
    .update({ [col]: trimmed })
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Get all goals_values rows for a user. Returns array of { goal_name, value, date }.
 */
async function getGoalValues(userId) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('goals_values')
    .select('goal_name, value, date')
    .eq('user_id', userId);
  if (error) throw error;
  return data || [];
}

/**
 * Find an existing goals_values row by user_id, goal_name, and date (null-safe).
 * Selects only user_id to avoid depending on an id column.
 */
async function getGoalValueRow(userId, goalName, date) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  let query = supabase
    .from('goals_values')
    .select('user_id')
    .eq('user_id', userId)
    .eq('goal_name', goalName);
  const dateVal = date != null && String(date).trim() !== '' ? String(date).trim() : null;
  if (dateVal !== null) {
    query = query.eq('date', dateVal);
  } else {
    query = query.is('date', null);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Insert a row into goals_values. Table columns: user_id, goal_name, value, date.
 */
async function insertGoalValue(userId, goalName, value, date) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const dateVal = date != null && String(date).trim() !== '' ? String(date).trim() : null;
  const { error } = await supabase
    .from('goals_values')
    .insert({
      user_id: userId,
      goal_name: goalName,
      value: value,
      date: dateVal
    });
  if (error) throw error;
  return { user_id: userId, goal_name: goalName, value: value, date: dateVal };
}

/**
 * Update value for an existing goals_values row by user_id, goal_name, and date.
 */
async function updateGoalValueByKey(userId, goalName, date, value) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const dateVal = date != null && String(date).trim() !== '' ? String(date).trim() : null;
  let query = supabase
    .from('goals_values')
    .update({ value: value })
    .eq('user_id', userId)
    .eq('goal_name', goalName);
  if (dateVal !== null) {
    query = query.eq('date', dateVal);
  } else {
    query = query.is('date', null);
  }
  const { data, error } = await query.select('user_id, goal_name, value, date').maybeSingle();
  if (error) throw error;
  return data || { user_id: userId, goal_name: goalName, value: value, date: dateVal };
}

/**
 * Upsert goals_values: if a row exists with the same user_id, goal_name, and date,
 * update its value; otherwise insert a new row.
 */
async function upsertGoalValue(userId, goalName, value, date) {
  const existing = await getGoalValueRow(userId, goalName, date);
  if (existing) {
    return updateGoalValueByKey(userId, goalName, date, value);
  }
  return insertGoalValue(userId, goalName, value, date);
}

module.exports = {
  isConfigured,
  getClient,
  getGoalsRow,
  getGoalValues,
  addGoal,
  updateGoal,
  insertGoalValue,
  upsertGoalValue
};
