/**
 * Achievements storage using Supabase (PostgreSQL).
 *
 * Table: achievements
 * Columns: id (serial PK), user, type, habit_id, status, date
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
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    }
  );
  return client;
}

function ownerIds(userId, email) {
  return [...new Set([userId, email].filter(Boolean).map((v) => String(v)))];
}

/**
 * Whole days from event_date to todayYmd (YYYY-MM-DD).
 */
function daysOld(eventDate, todayYmd) {
  if (!eventDate || !todayYmd) return 0;
  const start = new Date(String(eventDate).slice(0, 10) + 'T00:00:00');
  const today = new Date(todayYmd + 'T00:00:00');
  if (Number.isNaN(start.getTime()) || Number.isNaN(today.getTime())) return 0;
  return Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

async function selectAchievementsByOwner(supabase, ids) {
  return supabase
    .from('achievements')
    .select('*')
    .in('user', ids)
    .order('id', { ascending: false });
}

async function getAchievementsForUser(userId, email) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');

  const ids = ownerIds(userId, email);
  if (ids.length === 0) return [];

  let { data, error } = await selectAchievementsByOwner(supabase, ids);

  if (error && userId) {
    const retry = await selectAchievementsByOwner(supabase, [String(userId)]);
    data = retry.data;
    error = retry.error;
  }

  if (error) throw error;
  return data || [];
}

function dailyAchievementText(count) {
  return `Congratulations, you have ${count} active habits stacked today!`;
}

/**
 * Milestone tiers aligned with habit row colors.
 * Fires when days kept reaches minDays (inclusive).
 * achievedOffset = when that belt was earned from habit start date.
 */
const MILESTONES = [
  {
    type: 'White',
    minDays: 0,
    addDays: 0,
    addMonths: 0,
    text: (habitName) => `Congrats on creating a new habit - ${habitName}`
  },
  {
    type: 'Yellow',
    minDays: 1,
    addDays: 1,
    addMonths: 0,
    text: (habitName) => `Congrats on keeping your new habit for 24 hours - ${habitName}`
  },
  {
    type: 'Orange',
    minDays: 14,
    addDays: 14,
    addMonths: 0,
    text: (habitName) => `Congrats on keeping your new habit for 2 weeks - ${habitName}`
  },
  {
    type: 'Green',
    minDays: 31,
    addDays: 0,
    addMonths: 1,
    text: (habitName) => `Congrats on keeping your new habit for 1 month - ${habitName}`
  },
  {
    type: 'Blue',
    minDays: 61,
    addDays: 0,
    addMonths: 2,
    text: (habitName) => `Congrats on keeping your new habit for 2 months - ${habitName}`
  },
  {
    type: 'Brown',
    minDays: 91,
    addDays: 0,
    addMonths: 3,
    text: (habitName) => `Congrats on keeping your new habit for 3 months - ${habitName}`
  },
  {
    type: 'Red',
    minDays: 181,
    addDays: 0,
    addMonths: 6,
    text: (habitName) => `Congrats on keeping your new habit for 6 month - ${habitName}`
  },
  {
    type: 'Black',
    minDays: 365,
    addDays: 0,
    addMonths: 12,
    text: (habitName) => `Congrats on keeping your new habit for 12 months - ${habitName}`
  }
];

const MILESTONE_TYPES = MILESTONES.map((m) => m.type);

function toYmd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Date the milestone was achieved: habit start + belt offset
 * (e.g. Green / 1 month from Jun 3 → Jul 3).
 */
function achievedDateYmd(eventDate, type) {
  if (!eventDate) return null;
  const start = new Date(String(eventDate).slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(start.getTime())) return null;
  const milestone = MILESTONES.find((m) => m.type === String(type));
  if (!milestone) return toYmd(start);
  const achieved = new Date(start.getTime());
  if (milestone.addMonths) {
    achieved.setMonth(achieved.getMonth() + milestone.addMonths);
  }
  if (milestone.addDays) {
    achieved.setDate(achieved.getDate() + milestone.addDays);
  }
  return toYmd(achieved);
}

function achievementTextForType(type, habitName) {
  const milestone = MILESTONES.find((m) => m.type === String(type));
  const name = habitName && String(habitName).trim() ? String(habitName).trim() : 'your habit';
  if (milestone) return milestone.text(name);
  return `You have a new achievement - ${name}`;
}

function milestoneKey(owner, habitId, type) {
  return `${owner}:${habitId}:${type}`;
}

function achievementMessageForRows(createdRows, habitCount) {
  if (!createdRows || createdRows.length === 0) {
    return dailyAchievementText(habitCount || 0);
  }
  if (createdRows.length === 1) {
    return achievementTextForType(createdRows[0].type, 'a habit');
  }
  return `Congratulations, you have ${createdRows.length} new habit milestones!`;
}

async function getExistingMilestoneKeys(habitIds) {
  const supabase = getClient();
  if (!habitIds.length) return new Set();
  const { data, error } = await supabase
    .from('achievements')
    .select('user, habit_id, type')
    .in('habit_id', habitIds)
    .in('type', MILESTONE_TYPES);
  if (error) throw error;
  return new Set(
    (data || []).map((row) => milestoneKey(row.user, row.habit_id, row.type))
  );
}

/**
 * For each habit that has reached a color milestone (White…Black), insert one
 * achievements row if that habit+type is new.
 */
async function ensureMilestoneAchievements(habits, todayYmd) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');

  const list = (habits || []).filter((habit) => habit && habit.id != null);
  if (list.length === 0) return [];

  const existing = await getExistingMilestoneKeys(list.map((h) => h.id));
  const toInsert = [];
  list.forEach((habit) => {
    const age = daysOld(habit.event_date, todayYmd);
    MILESTONES.forEach((milestone) => {
      if (age < milestone.minDays) return;
      const key = milestoneKey(habit.user_id, habit.id, milestone.type);
      if (existing.has(key)) return;
      existing.add(key);
      toInsert.push({
        user: habit.user_id,
        type: milestone.type,
        habit_id: habit.id,
        status: 'new',
        date: achievedDateYmd(habit.event_date, milestone.type) || todayYmd
      });
    });
  });
  if (toInsert.length === 0) return [];

  const { data, error } = await supabase
    .from('achievements')
    .insert(toInsert)
    .select('*');
  if (error) throw error;
  return data || [];
}

async function clearMilestoneAchievements(userId, email) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const ids = ownerIds(userId, email);
  if (ids.length === 0) return 0;

  const { data, error } = await supabase
    .from('achievements')
    .delete()
    .in('user', ids)
    .in('type', MILESTONE_TYPES)
    .select('id');
  if (error) throw error;
  return (data || []).length;
}

async function markAchievementsRead(userId, email) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const ids = ownerIds(userId, email);
  if (ids.length === 0) return 0;

  const { data, error } = await supabase
    .from('achievements')
    .update({ status: 'read' })
    .in('user', ids)
    .select('id');
  if (error) throw error;
  return (data || []).length;
}

async function countNewAchievements(userId, email) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const ids = ownerIds(userId, email);
  if (ids.length === 0) return 0;

  const { count, error } = await supabase
    .from('achievements')
    .select('*', { count: 'exact', head: true })
    .in('user', ids)
    .eq('status', 'new');
  if (error) throw error;
  return count || 0;
}

module.exports = {
  isConfigured,
  getAchievementsForUser,
  dailyAchievementText,
  daysOld,
  MILESTONES,
  MILESTONE_TYPES,
  achievementTextForType,
  achievedDateYmd,
  ensureMilestoneAchievements,
  clearMilestoneAchievements,
  achievementMessageForRows,
  markAchievementsRead,
  countNewAchievements
};
