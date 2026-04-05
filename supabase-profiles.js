/**
 * User profiles in Supabase (`profiles` table).
 * Column names match the actual DDL:
 *   id, name, handle, email, location, current_company, current_title, ...
 */

let client = null;

function isConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getClient() {
  if (client) return client;
  if (!isConfigured()) return null;
  const { createClient } = require('@supabase/supabase-js');
  client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return client;
}

function normalizeEmail(s) {
  return s != null ? String(s).trim().toLowerCase() : '';
}

function isSchemaError(error) {
  if (!error) return false;
  const code = error.code || '';
  const msg  = (error.message || '').toLowerCase();
  return (
    code === '42P01' || code === '42703' || code === 'PGRST200' ||
    /relation .* does not exist/i.test(msg) ||
    /column .* does not exist/i.test(msg) ||
    /does not exist/i.test(msg)
  );
}

/**
 * @returns {Promise<object|null>} Row with `handle` field, or null.
 */
async function getProfileByEmail(email) {
  const supabase = getClient();
  if (!supabase) return null;
  const e = normalizeEmail(email);
  if (!e) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, handle, location')
    .eq('email', e)
    .maybeSingle();

  if (error) {
    if (isSchemaError(error)) return null;
    throw error;
  }
  return data || null;
}

/**
 * Insert or update by email (no ON CONFLICT needed).
 * @returns {Promise<object>}
 */
async function upsertProfile(email, { name, handle, location }) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');

  const e = normalizeEmail(email);
  if (!e) throw new Error('email is required');

  const existing = await getProfileByEmail(e);

  if (existing) {
    const { data, error } = await supabase
      .from('profiles')
      .update({ name, handle, location })
      .eq('email', e)
      .select('id, email, name, handle, location')
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('profiles')
    .insert({ email: e, name, handle, location })
    .select('id, email, name, handle, location')
    .single();

  if (error) throw error;
  return data;
}

const WORK_SELECT_FIELDS = [
  'current_company', 'current_title', 'current_start_date', 'current_end_date',
  'company1', 'title1', 'start_date1', 'end_date1',
  'company2', 'title2', 'start_date2', 'end_date2',
  'company3', 'title3', 'start_date3', 'end_date3',
  'company4', 'title4', 'start_date4', 'end_date4',
  'company5', 'title5', 'start_date5', 'end_date5',
  'company6', 'title6', 'start_date6', 'end_date6',
  'company7', 'title7', 'start_date7', 'end_date7',
  'education1', 'major1', 'start_date_edu1', 'end_date_edu1',
  'education2', 'major2', 'start_date_edu2', 'end_date_edu2',
  'education3', 'major3', 'start_date_edu3', 'end_date_edu3',
  'education4', 'major4', 'start_date_edu4', 'end_date_edu4'
].join(', ');

const WORK_UPDATE_KEYS = [
  'current_company', 'current_title', 'current_start_date', 'current_end_date',
  'company1', 'title1', 'start_date1', 'end_date1',
  'company2', 'title2', 'start_date2', 'end_date2',
  'company3', 'title3', 'start_date3', 'end_date3',
  'company4', 'title4', 'start_date4', 'end_date4',
  'company5', 'title5', 'start_date5', 'end_date5',
  'company6', 'title6', 'start_date6', 'end_date6',
  'company7', 'title7', 'start_date7', 'end_date7',
  'education1', 'major1', 'start_date_edu1', 'end_date_edu1',
  'education2', 'major2', 'start_date_edu2', 'end_date_edu2',
  'education3', 'major3', 'start_date_edu3', 'end_date_edu3',
  'education4', 'major4', 'start_date_edu4', 'end_date_edu4'
];

/**
 * Fetch work/education fields by handle (the `handle` column in `profiles`).
 * @returns {Promise<object|null>}
 */
async function getWorkProfileByHandle(handle) {
  const supabase = getClient();
  if (!supabase) return null;
  const h = String(handle || '').trim().replace(/^@+/, '');
  if (!h) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select(WORK_SELECT_FIELDS)
    .eq('handle', h)
    .maybeSingle();

  if (error) {
    if (isSchemaError(error)) return null;
    throw error;
  }
  return data || null;
}

/**
 * Fetch work/education fields by email.
 * @returns {Promise<object|null>}
 */
async function getWorkProfileByEmail(email) {
  const supabase = getClient();
  if (!supabase) return null;
  const e = normalizeEmail(email);
  if (!e) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select(WORK_SELECT_FIELDS)
    .eq('email', e)
    .maybeSingle();

  if (error) {
    if (isSchemaError(error)) return null;
    throw error;
  }
  return data || null;
}

/**
 * Update work/education columns for the profile matching email.
 * @returns {Promise<object>}
 */
async function upsertWorkProfile(email, workFields) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');

  const e = normalizeEmail(email);
  if (!e) throw new Error('email is required');

  const update = {};
  for (const key of WORK_UPDATE_KEYS) {
    const val = workFields[key];
    update[key] = val != null && String(val).trim() !== '' ? String(val).trim() : null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(update)
    .eq('email', e)
    .select(WORK_SELECT_FIELDS)
    .single();

  if (error) throw error;
  return data;
}

const FAMILY_SELECT_FIELDS = [
  'family_relationship1', 'family_name1',
  'family_relationship2', 'family_name2',
  'family_relationship3', 'family_name3',
  'family_relationship4', 'family_name4',
  'family_relationship5', 'family_name5',
  'family_relationship6', 'family_name6',
  'family_relationship7', 'family_name7',
  'family_relationship8', 'family_name8',
  'family_relationship9', 'family_name9'
].join(', ');

const FAMILY_UPDATE_KEYS = [
  'family_relationship1', 'family_name1',
  'family_relationship2', 'family_name2',
  'family_relationship3', 'family_name3',
  'family_relationship4', 'family_name4',
  'family_relationship5', 'family_name5',
  'family_relationship6', 'family_name6',
  'family_relationship7', 'family_name7',
  'family_relationship8', 'family_name8',
  'family_relationship9', 'family_name9'
];

/**
 * Fetch family fields by handle.
 * @returns {Promise<object|null>}
 */
async function getFamilyProfileByHandle(handle) {
  const supabase = getClient();
  if (!supabase) return null;
  const h = String(handle || '').trim().replace(/^@+/, '');
  if (!h) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select(FAMILY_SELECT_FIELDS)
    .eq('handle', h)
    .maybeSingle();

  if (error) {
    if (isSchemaError(error)) return null;
    throw error;
  }
  return data || null;
}

/**
 * Update family columns for the profile matching email.
 * @returns {Promise<object>}
 */
async function upsertFamilyProfile(email, familyFields) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');

  const e = normalizeEmail(email);
  if (!e) throw new Error('email is required');

  const update = {};
  for (const key of FAMILY_UPDATE_KEYS) {
    const val = familyFields[key];
    update[key] = val != null && String(val).trim() !== '' ? String(val).trim() : null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(update)
    .eq('email', e)
    .select(FAMILY_SELECT_FIELDS)
    .single();

  if (error) throw error;
  return data;
}

const INTERESTS_SELECT_FIELDS = 'interest1, interest2, interest3, interest4, interest5';
const INTERESTS_UPDATE_KEYS   = ['interest1', 'interest2', 'interest3', 'interest4', 'interest5'];

async function getInterestsProfileByHandle(handle) {
  const supabase = getClient();
  if (!supabase) return null;
  const h = String(handle || '').trim().replace(/^@+/, '');
  if (!h) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select(INTERESTS_SELECT_FIELDS)
    .eq('handle', h)
    .maybeSingle();

  if (error) {
    if (isSchemaError(error)) return null;
    throw error;
  }
  return data || null;
}

async function upsertInterestsProfile(email, interestFields) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');

  const e = normalizeEmail(email);
  if (!e) throw new Error('email is required');

  const update = {};
  for (const key of INTERESTS_UPDATE_KEYS) {
    const val = interestFields[key];
    update[key] = val != null && String(val).trim() !== '' ? String(val).trim() : null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(update)
    .eq('email', e)
    .select(INTERESTS_SELECT_FIELDS)
    .single();

  if (error) throw error;
  return data;
}

const PHOTO_BUCKET = 'profile_photos';

/**
 * Returns the public URL for a profile photo, or null if not configured.
 * @param {string} handle
 * @returns {string|null}
 */
function getProfilePhotoUrl(handle) {
  if (!process.env.SUPABASE_URL || !handle) return null;
  const h = String(handle).trim().replace(/^@+/, '');
  if (!h) return null;
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${h}.jpeg`;
}

/**
 * Upload (upsert) a profile photo.
 * @param {string} handle
 * @param {Buffer} imageBuffer
 * @param {string} contentType  e.g. 'image/jpeg'
 * @returns {Promise<string>} Public URL of the uploaded photo
 */
async function uploadProfilePhoto(handle, imageBuffer, contentType) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const h = String(handle).trim().replace(/^@+/, '');
  if (!h) throw new Error('handle is required');

  const path = `${h}.jpeg`;
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, imageBuffer, {
      contentType: contentType || 'image/jpeg',
      upsert: true
    });

  if (error) throw error;
  return getProfilePhotoUrl(h);
}

module.exports = {
  isConfigured,
  getProfileByEmail,
  upsertProfile,
  getWorkProfileByHandle,
  getWorkProfileByEmail,
  upsertWorkProfile,
  getFamilyProfileByHandle,
  upsertFamilyProfile,
  getInterestsProfileByHandle,
  upsertInterestsProfile,
  getProfilePhotoUrl,
  uploadProfilePhoto
};
