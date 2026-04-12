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
 * Fetch a profile row by handle.
 * @returns {Promise<object|null>}
 */
async function getProfileByHandle(handle) {
  const supabase = getClient();
  if (!supabase) return null;
  const h = String(handle || '').trim().replace(/^@+/, '');
  if (!h) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, handle, location')
    .eq('handle', h)
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
const PHOTO_EXTS   = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'];

function formatSupabaseStorageError(err) {
  if (err == null) return 'Unknown storage error';
  if (typeof err === 'string') return err;
  if (typeof err.message === 'string' && err.message) return err.message;
  if (typeof err.error === 'string') return err.error;
  try {
    const s = JSON.stringify(err);
    if (s && s !== '{}') return s;
  } catch (_) {}
  return String(err);
}
const MIME_TO_EXT  = {
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
  'image/avif': 'avif',
};

/**
 * Searches the profile_photos bucket for any file named <handle>.<ext>
 * (jpg, jpeg, png, webp, gif, avif) and returns its public URL, or null.
 * @param {string} handle
 * @returns {Promise<string|null>}
 */
async function getProfilePhotoUrl(handle) {
  const supabase = getClient();
  if (!supabase || !process.env.SUPABASE_URL || !handle) return null;
  const h = String(handle).trim().replace(/^@+/, '').toLowerCase();
  if (!h) return null;

  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .list('', { search: h });

  if (error || !data || data.length === 0) return null;

  const found = data.find(f => {
    const name = f.name.toLowerCase();
    const dotIdx = name.lastIndexOf('.');
    if (dotIdx === -1) return false;
    return name.slice(0, dotIdx) === h && PHOTO_EXTS.includes(name.slice(dotIdx + 1));
  });

  if (!found) return null;
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${found.name}`;
}

/**
 * Upload (upsert) a profile photo using the correct extension for the MIME type.
 * Any existing photo for this handle with a different extension is removed first.
 * @param {string} handle
 * @param {Buffer} imageBuffer
 * @param {string} contentType  e.g. 'image/png'
 * @returns {Promise<string>} Public URL of the uploaded photo
 */
async function uploadProfilePhoto(handle, imageBuffer, contentType) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const h = String(handle).trim().replace(/^@+/, '').toLowerCase();
  if (!h) throw new Error('handle is required');

  const ext     = MIME_TO_EXT[contentType] || 'jpg';
  const newPath = `${h}.${ext}`;

  // Remove stale files with other extensions so only one photo exists per handle
  const { data: existing } = await supabase.storage
    .from(PHOTO_BUCKET)
    .list('', { search: h });

  if (existing && existing.length > 0) {
    const toDelete = existing
      .filter(f => {
        const name = f.name.toLowerCase();
        const dotIdx = name.lastIndexOf('.');
        if (dotIdx === -1) return false;
        const base = name.slice(0, dotIdx);
        const oldExt = name.slice(dotIdx + 1);
        return base === h && PHOTO_EXTS.includes(oldExt) && f.name.toLowerCase() !== newPath;
      })
      .map(f => f.name);
    if (toDelete.length > 0) {
      await supabase.storage.from(PHOTO_BUCKET).remove(toDelete);
    }
  }

  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(newPath, imageBuffer, {
      contentType: contentType || 'image/jpeg',
      upsert: true
    });

  if (error) throw new Error(formatSupabaseStorageError(error));
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${newPath}`;
}

const CONTACT_PHOTO_BUCKET = 'contact_photos';

/** Lowercase contact display name with all spaces removed (e.g. "Megan Picasso Test" → "meganpicassotest"). */
function contactNameToFileSlug(contactName) {
  return String(contactName || '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/**
 * Suffix for `contact_details.handle`: letters and digits only, lowercased (spaces and symbols removed).
 * e.g. "Aaron Chalal!" → "aaronchalal"
 */
function contactNameToDetailHandleSuffix(contactName) {
  return String(contactName || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

/**
 * Stored `contact_details.handle`: `{owners_handle}_{suffix}` (suffix from {@link contactNameToDetailHandleSuffix}).
 * @returns {string|null}
 */
function contactDetailsHandleValue(ownersHandle, contactDisplayName) {
  const oh = String(ownersHandle || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
  const suf = contactNameToDetailHandleSuffix(contactDisplayName);
  if (!oh || !suf) return null;
  return `${oh}_${suf}`;
}

/**
 * Files: `{ownersHandle}_{contactSlug}.{ext}` in bucket `contact_photos`, e.g. johnpicasso_meganpicassotest.png
 * @returns {Promise<string|null>}
 */
async function getContactPhotoUrlForContact(ownersHandle, contactName) {
  const supabase = getClient();
  if (!supabase || !process.env.SUPABASE_URL || !ownersHandle || !contactName) return null;
  const oh = String(ownersHandle).trim().replace(/^@+/, '').toLowerCase();
  const slug = contactNameToFileSlug(contactName);
  if (!oh || !slug) return null;

  const prefix = `${oh}_${slug}`;

  const { data, error } = await supabase.storage
    .from(CONTACT_PHOTO_BUCKET)
    .list('', { search: prefix });

  if (error || !data || data.length === 0) return null;

  const found = data.find(f => {
    const name = f.name.toLowerCase();
    const dotIdx = name.lastIndexOf('.');
    if (dotIdx === -1) return false;
    const base = name.slice(0, dotIdx);
    return base === prefix && PHOTO_EXTS.includes(name.slice(dotIdx + 1));
  });

  if (!found) return null;
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/${CONTACT_PHOTO_BUCKET}/${found.name}`;
}

/**
 * Upload contact photo; path `{ownersHandle}_{slug}.{ext}`. Removes other extensions for same stem.
 * @returns {Promise<string>} public URL
 */
async function uploadContactPhoto(ownersHandle, contactName, imageBuffer, contentType) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const oh = String(ownersHandle).trim().replace(/^@+/, '').toLowerCase();
  const slug = contactNameToFileSlug(contactName);
  if (!oh || !slug) throw new Error('owners_handle and contact_name are required');

  const ext = MIME_TO_EXT[contentType] || 'jpg';
  const prefix = `${oh}_${slug}`;
  const newPath = `${prefix}.${ext}`;

  const { data: existing } = await supabase.storage
    .from(CONTACT_PHOTO_BUCKET)
    .list('', { search: prefix });

  if (existing && existing.length > 0) {
    const toDelete = existing
      .filter(f => {
        const name = f.name.toLowerCase();
        const dotIdx = name.lastIndexOf('.');
        if (dotIdx === -1) return false;
        const base = name.slice(0, dotIdx);
        const oldExt = name.slice(dotIdx + 1);
        return base === prefix && PHOTO_EXTS.includes(oldExt) && f.name.toLowerCase() !== newPath;
      })
      .map(f => f.name);
    if (toDelete.length > 0) {
      await supabase.storage.from(CONTACT_PHOTO_BUCKET).remove(toDelete);
    }
  }

  const { error } = await supabase.storage
    .from(CONTACT_PHOTO_BUCKET)
    .upload(newPath, imageBuffer, {
      contentType: contentType || 'image/jpeg',
      upsert: true
    });

  if (error) throw new Error(formatSupabaseStorageError(error));
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/${CONTACT_PHOTO_BUCKET}/${newPath}`;
}

/** Identity + work columns from `contact_details` (one row per owner + contact). */
const CONTACT_DETAILS_COLUMNS = [
  'contact_name', 'contact_handle', 'work_email', 'personal_email', 'cell', 'other_phone', 'my_notes',
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
  'education4', 'major4', 'start_date_edu4', 'end_date_edu4',
  'family_relationship1', 'family_name1',
  'family_relationship2', 'family_name2',
  'family_relationship3', 'family_name3',
  'family_relationship4', 'family_name4',
  'family_relationship5', 'family_name5',
  'family_relationship6', 'family_name6',
  'family_relationship7', 'family_name7',
  'family_relationship8', 'family_name8',
  'family_relationship9', 'family_name9',
  'interest1', 'interest2', 'interest3', 'interest4', 'interest5'
];

const CONTACT_DETAILS_WORK_FIELDS = CONTACT_DETAILS_COLUMNS.join(', ');

/** Server-managed composite key; not accepted from client patches. */
const CONTACT_DETAILS_PATCHABLE = new Set(
  CONTACT_DETAILS_COLUMNS.filter(c => c !== 'handle')
);

/**
 * Fetch work fields from `contact_details` for a given owner + contact name.
 * @param {string} ownersHandle  e.g. johnpicasso (matches `owners_handle`)
 * @param {string} contactName   e.g. Megan Picasso (matches `contact_name`)
 * @returns {Promise<object|null>}
 */
/** Normalize display name from URL or form (trim, collapse spaces). */
function normalizeContactDetailName(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Escape `%`, `_`, `\` so `ILIKE` matches the whole string literally (case-insensitive).
 */
function contactNameIlikeExactPattern(contactName) {
  return normalizeContactDetailName(contactName)
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

async function getContactDetailsWork(ownersHandle, contactName) {
  const supabase = getClient();
  if (!supabase) return null;
  const oh = String(ownersHandle || '').trim().replace(/^@+/, '');
  const cn = normalizeContactDetailName(contactName);
  if (!oh || !cn) return null;

  let { data, error } = await supabase
    .from('contact_details')
    .select(CONTACT_DETAILS_WORK_FIELDS)
    .eq('owners_handle', oh)
    .eq('contact_name', cn)
    .maybeSingle();

  if (error) {
    if (isSchemaError(error)) return null;
    throw error;
  }

  if (data) return data;

  // e.g. `?contact_name=aaron%20chalal` vs stored "Aaron Chalal"
  const ilikePattern = contactNameIlikeExactPattern(cn);
  ({ data, error } = await supabase
    .from('contact_details')
    .select(CONTACT_DETAILS_WORK_FIELDS)
    .eq('owners_handle', oh)
    .ilike('contact_name', ilikePattern)
    .limit(1)
    .maybeSingle());

  if (error) {
    if (isSchemaError(error)) return null;
    throw error;
  }
  return data || null;
}

/**
 * Resolve `contact_details` from a URL path key: `{owners_handle}_{contactNameToFileSlug(contact_name)}`
 * (same stem as `contact_photos`). The first path segment must match `expectedOwnersHandle` (case-insensitive).
 * @param {string} pathKey e.g. johnpicasso_aaronchalal
 * @param {string} expectedOwnersHandle Profile handle for the logged-in owner (must match path prefix).
 * @returns {Promise<object|null>}
 */
async function getContactDetailsWorkByPathKey(pathKey, expectedOwnersHandle) {
  const supabase = getClient();
  if (!supabase) return null;

  const raw = String(pathKey || '').trim();
  const i = raw.indexOf('_');
  if (i <= 0) return null;

  const ohFromPath = raw.slice(0, i).replace(/^@+/, '').trim();
  const slug = raw.slice(i + 1).replace(/\s+/g, '').toLowerCase();
  if (!slug) return null;

  const expected = String(expectedOwnersHandle || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
  if (!expected || ohFromPath.toLowerCase() !== expected) {
    return null;
  }

  const oh = String(expectedOwnersHandle).trim().replace(/^@+/, '');
  const pathNorm = raw.toLowerCase();

  let { data: byHandle, error: errHandle } = await supabase
    .from('contact_details')
    .select(CONTACT_DETAILS_WORK_FIELDS)
    .eq('owners_handle', oh)
    .eq('handle', pathNorm)
    .maybeSingle();

  if (!errHandle && byHandle) return byHandle;
  if (errHandle && !isSchemaError(errHandle)) throw errHandle;

  const { data: rows, error } = await supabase
    .from('contact_details')
    .select(CONTACT_DETAILS_WORK_FIELDS)
    .eq('owners_handle', oh);

  if (error) {
    if (isSchemaError(error)) return null;
    throw error;
  }
  if (!rows || !rows.length) return null;

  for (const row of rows) {
    const stored = row.handle
      ? String(row.handle).toLowerCase()
      : contactDetailsHandleValue(oh, row.contact_name);
    if (stored === pathNorm) return row;
    if (contactNameToFileSlug(row.contact_name) === slug) {
      return row;
    }
  }
  return null;
}

/**
 * All `contact_details` rows for an owner (profile handle = `owners_handle`).
 * @param {string} ownersHandle  e.g. johnpicasso
 * @returns {Promise<Array<{ contact_name, my_notes?, personal_email?, work_email?, contact_handle? }>>}
 */
async function listContactDetailsByOwnersHandle(ownersHandle) {
  const supabase = getClient();
  if (!supabase) return [];
  const oh = String(ownersHandle || '').trim().replace(/^@+/, '');
  if (!oh) return [];

  const { data, error } = await supabase
    .from('contact_details')
    .select(
      'contact_name, my_notes, personal_email, work_email, contact_handle'
    )
    .eq('owners_handle', oh)
    .order('contact_name', { ascending: true });

  if (error) {
    if (isSchemaError(error)) return [];
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

/**
 * Delete one `contact_details` row; caller must own `owners_handle` (via profile email).
 */
async function deleteContactDetailsForOwner(userEmail, contactName) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');

  const profile = await getProfileByEmail(String(userEmail || '').trim());
  if (!profile || !profile.handle) {
    throw new Error('Forbidden');
  }
  const oh = String(profile.handle).trim().replace(/^@+/, '');
  const cn = String(contactName || '').trim();
  if (!cn) throw new Error('contact_name is required');

  const { error } = await supabase
    .from('contact_details')
    .delete()
    .eq('owners_handle', oh)
    .eq('contact_name', cn);

  if (error) throw error;
  return true;
}

/**
 * Update or insert a `contact_details` row. Caller must pass the current row's `contact_name`
 * as `lookupContactName` (URL / query key). Patch may include a new `contact_name`.
 * @param {string} userEmail  Logged-in user's email (must own `owners_handle`).
 * @param {string} ownersHandle
 * @param {string} lookupContactName  Existing `contact_name` used to find the row.
 * @param {object} patch  Column updates (allowed columns only).
 */
async function upsertContactDetails(userEmail, ownersHandle, lookupContactName, patch) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');

  const oh = String(ownersHandle || '').trim().replace(/^@+/, '');
  const lookupCn = String(lookupContactName || '').trim();
  if (!oh || !lookupCn) {
    throw new Error('owners_handle and lookup_contact_name are required');
  }

  const profile = await getProfileByEmail(String(userEmail || '').trim());
  if (!profile || !profile.handle) {
    throw new Error('Forbidden');
  }
  const profileHandle = String(profile.handle).trim().replace(/^@+/, '');
  if (profileHandle !== oh) {
    throw new Error('Forbidden');
  }

  const filtered = {};
  for (const key of Object.keys(patch || {})) {
    if (!CONTACT_DETAILS_PATCHABLE.has(key)) continue;
    let v = patch[key];
    if (v === undefined) continue;
    if (v === '') v = null;
    filtered[key] = v;
  }

  const existing = await getContactDetailsWork(oh, lookupCn);

  if (existing) {
    if (Object.keys(filtered).length === 0) {
      return existing;
    }
    const finalContactName =
      filtered.contact_name !== undefined
        ? normalizeContactDetailName(filtered.contact_name)
        : normalizeContactDetailName(existing.contact_name || lookupCn);
    const nextHandle = contactDetailsHandleValue(oh, finalContactName);
    if (!nextHandle) {
      throw new Error(
        'Contact name must contain at least one letter or number for the handle field'
      );
    }
    filtered.handle = nextHandle;

    const { data, error } = await supabase
      .from('contact_details')
      .update(filtered)
      .eq('owners_handle', oh)
      .eq('contact_name', lookupCn)
      .select(CONTACT_DETAILS_WORK_FIELDS)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  const insertRow = {
    owners_handle: oh,
    contact_name: lookupCn,
    ...filtered
  };
  insertRow.contact_name = normalizeContactDetailName(insertRow.contact_name);
  const insertHandle = contactDetailsHandleValue(oh, insertRow.contact_name);
  if (!insertHandle) {
    throw new Error(
      'Contact name must contain at least one letter or number for the handle field'
    );
  }
  insertRow.handle = insertHandle;

  const { data: inserted, error: insErr } = await supabase
    .from('contact_details')
    .insert(insertRow)
    .select(CONTACT_DETAILS_WORK_FIELDS)
    .maybeSingle();

  if (insErr) throw insErr;
  return inserted || null;
}

module.exports = {
  isConfigured,
  getProfileByEmail,
  getProfileByHandle,
  upsertProfile,
  getWorkProfileByHandle,
  getWorkProfileByEmail,
  upsertWorkProfile,
  getFamilyProfileByHandle,
  upsertFamilyProfile,
  getInterestsProfileByHandle,
  upsertInterestsProfile,
  getProfilePhotoUrl,
  uploadProfilePhoto,
  getContactPhotoUrlForContact,
  uploadContactPhoto,
  getContactDetailsWork,
  getContactDetailsWorkByPathKey,
  upsertContactDetails,
  listContactDetailsByOwnersHandle,
  deleteContactDetailsForOwner
};
