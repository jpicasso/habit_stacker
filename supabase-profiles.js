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

function normalizeHandleToken(s) {
  return s != null ? String(s).trim().replace(/^@+/, '').toLowerCase() : '';
}

async function personHandleForEmailFromSecurityHandles(email) {
  const supabase = getClient();
  if (!supabase) return null;
  const e = normalizeEmail(email);
  if (!e) return null;
  const { data, error } = await supabase
    .from('security_handles')
    .select('email, person_handle')
    .eq('email', e)
    .maybeSingle();
  if (error) {
    if (isSchemaError(error)) return null;
    throw error;
  }
  return data && data.person_handle
    ? normalizeHandleToken(data.person_handle)
    : null;
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
  const ph = await personHandleForEmailFromSecurityHandles(email);
  if (!ph) return null;
  const row = await getProfileByHandle(ph);
  if (!row) return null;
  return {
    ...row,
    email: normalizeEmail(email)
  };
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
    .from('contact_library')
    .select('name, person_handle, location, work_email, personal_email')
    .eq('person_handle', h)
    .maybeSingle();

  if (error) {
    if (isSchemaError(error)) return null;
    throw error;
  }
  if (!data) return null;
  const emWork = data.work_email != null ? normalizeEmail(data.work_email) : '';
  const emPers = data.personal_email != null ? normalizeEmail(data.personal_email) : '';
  return {
    id: null,
    email: emWork || emPers || null,
    name: data.name != null ? String(data.name).trim() : null,
    handle: data.person_handle != null ? String(data.person_handle).trim() : null,
    location: data.location != null ? String(data.location).trim() : null
  };
}

/**
 * @param {string[]} emails
 * @returns {Promise<Array<{ email, name, handle }>>}
 */
async function getProfilesByEmails(emails) {
  const supabase = getClient();
  if (!supabase) return [];
  const uniq = [...new Set((emails || []).map(e => normalizeEmail(e)).filter(Boolean))];
  if (!uniq.length) return [];

  const { data, error } = await supabase
    .from('security_handles')
    .select('email, person_handle')
    .in('email', uniq);
  if (error) {
    if (isSchemaError(error)) return [];
    throw error;
  }
  const rows = Array.isArray(data) ? data : [];
  const handles = [
    ...new Set(rows.map(r => normalizeHandleToken(r.person_handle)).filter(Boolean))
  ];
  let nameByHandle = new Map();
  if (handles.length) {
    const { data: namesData, error: namesErr } = await supabase
      .from('contact_library')
      .select('person_handle, name')
      .in('person_handle', handles);
    if (namesErr) {
      if (!isSchemaError(namesErr)) throw namesErr;
    } else {
      for (const r of namesData || []) {
        const h = normalizeHandleToken(r.person_handle);
        const n = r.name != null ? String(r.name).trim() : '';
        if (h && n && !nameByHandle.has(h)) nameByHandle.set(h, n);
      }
    }
  }
  return rows
    .map(r => {
      const e = normalizeEmail(r.email);
      const h = normalizeHandleToken(r.person_handle);
      if (!e || !h) return null;
      return { email: e, handle: h, name: nameByHandle.get(h) || null };
    })
    .filter(Boolean);
}

/**
 * `contact_library` names keyed by `person_handle` (no `profiles` lookup).
 * @param {string[]} personHandles
 * @returns {Promise<Record<string, string>>}
 */
async function getContactLibraryNamesByPersonHandles(personHandles) {
  const supabase = getClient();
  if (!supabase) return {};
  const uniq = [
    ...new Set((personHandles || []).map(h => normalizeHandleToken(h)).filter(Boolean))
  ];
  if (!uniq.length) return {};

  const { data, error } = await supabase
    .from('contact_library')
    .select('person_handle, name')
    .in('person_handle', uniq);
  if (error) {
    if (isSchemaError(error)) return {};
    throw error;
  }

  const out = {};
  for (const row of data || []) {
    const ph = normalizeHandleToken(row.person_handle);
    const nm = row.name != null ? String(row.name).trim() : '';
    if (!ph || !nm) continue;
    if (!out[ph]) out[ph] = nm;
  }
  return out;
}

/**
 * List `contact_library` rows for one owner handle.
 * @param {string} ownerHandle
 * @returns {Promise<Array<{ person_handle: string, name: string }>>}
 */
async function listContactLibraryByOwnerHandle(ownerHandle) {
  const supabase = getClient();
  if (!supabase) return [];
  const oh = normalizeHandleToken(ownerHandle);
  if (!oh) return [];

  const { data, error } = await supabase
    .from('contact_library')
    .select('person_handle, name')
    .eq('owner_handle', oh)
    .order('name', { ascending: true });
  if (error) {
    if (isSchemaError(error)) return [];
    throw error;
  }

  return (data || [])
    .map(row => ({
      person_handle: normalizeHandleToken(row.person_handle),
      name: row.name != null ? String(row.name).trim() : ''
    }))
    .filter(r => r.person_handle && r.name);
}

/**
 * One `contact_library` row by `person_handle`.
 * @param {string} personHandle
 * @returns {Promise<object|null>}
 */
async function getContactLibraryRowByPersonHandle(personHandle) {
  const supabase = getClient();
  if (!supabase) return null;
  const ph = normalizeHandleToken(personHandle);
  if (!ph) return null;

  const fields = [
    'person_handle',
    'owner_handle',
    'name',
    'profile_handle',
    'my_notes',
    'cell',
    'other_phone',
    'work_email',
    'personal_email',
    'location',
    'home_address',
    'current_company',
    'current_title',
    'current_start_date',
    'current_end_date',
    'company1',
    'title1',
    'start_date1',
    'end_date1',
    'company2',
    'title2',
    'start_date2',
    'end_date2',
    'company3',
    'title3',
    'start_date3',
    'end_date3',
    'company4',
    'title4',
    'start_date4',
    'end_date4',
    'company5',
    'title5',
    'start_date5',
    'end_date5',
    'company6',
    'title6',
    'start_date6',
    'end_date6',
    'company7',
    'title7',
    'start_date7',
    'end_date7',
    'education1',
    'major1',
    'start_date_edu1',
    'end_date_edu1',
    'education2',
    'major2',
    'start_date_edu2',
    'end_date_edu2',
    'education3',
    'major3',
    'start_date_edu3',
    'end_date_edu3',
    'education4',
    'major4',
    'start_date_edu4',
    'end_date_edu4',
    'family_relationship1',
    'family_name1',
    'family_relationship2',
    'family_name2',
    'family_relationship3',
    'family_name3',
    'family_relationship4',
    'family_name4',
    'family_relationship5',
    'family_name5',
    'family_relationship6',
    'family_name6',
    'family_relationship7',
    'family_name7',
    'family_relationship8',
    'family_name8',
    'family_relationship9',
    'family_name9',
    'interest1',
    'interest2',
    'interest3',
    'interest4',
    'interest5',
    'last_contact',
    'next_contact',
    'birthday'
  ].join(', ');

  const { data, error } = await supabase
    .from('contact_library')
    .select(fields)
    .eq('person_handle', ph)
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
  const ph = await personHandleForEmailFromSecurityHandles(email);
  if (!ph) throw new Error('No person_handle in security_handles for this email');

  const update = {};
  if (name != null) update.name = String(name).trim() || null;
  if (location != null) update.location = String(location).trim() || null;

  const desired = normalizeHandleToken(handle);
  if (desired && desired !== ph) {
    throw new Error('handle must match security_handles.person_handle for this email');
  }

  const { data: existing, error: existingErr } = await supabase
    .from('contact_library')
    .select('person_handle')
    .eq('person_handle', ph)
    .maybeSingle();
  if (existingErr && !isSchemaError(existingErr)) throw existingErr;

  if (existing) {
    const { data, error } = await supabase
      .from('contact_library')
      .update(update)
      .eq('person_handle', ph)
      .select('name, person_handle, location')
      .maybeSingle();
    if (error) throw error;
    return {
      id: null,
      email: normalizeEmail(email),
      name: data && data.name != null ? String(data.name).trim() : null,
      handle: data && data.person_handle != null ? String(data.person_handle).trim() : ph,
      location: data && data.location != null ? String(data.location).trim() : null
    };
  }

  const insertRow = {
    person_handle: ph,
    owner_handle: ph,
    name: update.name || ph,
    location: update.location || null
  };
  const { data, error } = await supabase
    .from('contact_library')
    .insert(insertRow)
    .select('name, person_handle, location')
    .maybeSingle();
  if (error) throw error;
  return {
    id: null,
    email: normalizeEmail(email),
    name: data && data.name != null ? String(data.name).trim() : insertRow.name,
    handle:
      data && data.person_handle != null ? String(data.person_handle).trim() : ph,
    location: data && data.location != null ? String(data.location).trim() : null
  };
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
  const row = await getContactLibraryRowByPersonHandle(handle);
  if (!row) return null;
  return row;
}

/**
 * Fetch work/education fields by email.
 * @returns {Promise<object|null>}
 */
async function getWorkProfileByEmail(email) {
  const ph = await personHandleForEmailFromSecurityHandles(email);
  if (!ph) return null;
  return getWorkProfileByHandle(ph);
}

/**
 * Update work/education columns for the profile matching email.
 * @returns {Promise<object>}
 */
async function upsertWorkProfile(email, workFields) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const ph = await personHandleForEmailFromSecurityHandles(email);
  if (!ph) throw new Error('No person_handle in security_handles for this email');

  const update = {};
  for (const key of WORK_UPDATE_KEYS) {
    const val = workFields[key];
    update[key] = val != null && String(val).trim() !== '' ? String(val).trim() : null;
  }
  const { data, error } = await supabase
    .from('contact_library')
    .update(update)
    .eq('person_handle', ph)
    .select(WORK_SELECT_FIELDS)
    .maybeSingle();
  if (error) throw error;
  return data || null;
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
  const row = await getContactLibraryRowByPersonHandle(handle);
  if (!row) return null;
  return row;
}

/**
 * Update family columns for the profile matching email.
 * @returns {Promise<object>}
 */
async function upsertFamilyProfile(email, familyFields) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const ph = await personHandleForEmailFromSecurityHandles(email);
  if (!ph) throw new Error('No person_handle in security_handles for this email');

  const update = {};
  for (const key of FAMILY_UPDATE_KEYS) {
    const val = familyFields[key];
    update[key] = val != null && String(val).trim() !== '' ? String(val).trim() : null;
  }
  const { data, error } = await supabase
    .from('contact_library')
    .update(update)
    .eq('person_handle', ph)
    .select(FAMILY_SELECT_FIELDS)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

const INTERESTS_SELECT_FIELDS = 'interest1, interest2, interest3, interest4, interest5';
const INTERESTS_UPDATE_KEYS   = ['interest1', 'interest2', 'interest3', 'interest4', 'interest5'];

async function getInterestsProfileByHandle(handle) {
  const row = await getContactLibraryRowByPersonHandle(handle);
  if (!row) return null;
  return row;
}

async function upsertInterestsProfile(email, interestFields) {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase not configured');
  const ph = await personHandleForEmailFromSecurityHandles(email);
  if (!ph) throw new Error('No person_handle in security_handles for this email');

  const update = {};
  for (const key of INTERESTS_UPDATE_KEYS) {
    const val = interestFields[key];
    update[key] = val != null && String(val).trim() !== '' ? String(val).trim() : null;
  }
  const { data, error } = await supabase
    .from('contact_library')
    .update(update)
    .eq('person_handle', ph)
    .select(INTERESTS_SELECT_FIELDS)
    .maybeSingle();
  if (error) throw error;
  return data || null;
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
 * Public URL for `contact_photos/{person_handle}.{ext}` when the file stem equals `person_handle`
 * (e.g. `johnpicasso_aaronchalal` → `johnpicasso_aaronchalal.png`).
 */
async function getContactPhotoUrlByPersonHandle(personHandle) {
  const supabase = getClient();
  if (!supabase || !process.env.SUPABASE_URL || personHandle == null) return null;
  const prefix = String(personHandle)
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
  if (!prefix) return null;

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

/** Legacy API field names (mapped from `contact_library`). */
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

const CONTACT_LIBRARY_LEGACY_SELECT_FIELDS = [
  'contact_name:name',
  'contact_handle:profile_handle',
  'handle:person_handle',
  'owners_handle:owner_handle',
  'work_email',
  'personal_email',
  'cell',
  'other_phone',
  'my_notes',
  'location',
  'home_address',
  'current_company',
  'current_title',
  'current_start_date',
  'current_end_date',
  'company1',
  'title1',
  'start_date1',
  'end_date1',
  'company2',
  'title2',
  'start_date2',
  'end_date2',
  'company3',
  'title3',
  'start_date3',
  'end_date3',
  'company4',
  'title4',
  'start_date4',
  'end_date4',
  'company5',
  'title5',
  'start_date5',
  'end_date5',
  'company6',
  'title6',
  'start_date6',
  'end_date6',
  'company7',
  'title7',
  'start_date7',
  'end_date7',
  'education1',
  'major1',
  'start_date_edu1',
  'end_date_edu1',
  'education2',
  'major2',
  'start_date_edu2',
  'end_date_edu2',
  'education3',
  'major3',
  'start_date_edu3',
  'end_date_edu3',
  'education4',
  'major4',
  'start_date_edu4',
  'end_date_edu4',
  'family_relationship1',
  'family_name1',
  'family_relationship2',
  'family_name2',
  'family_relationship3',
  'family_name3',
  'family_relationship4',
  'family_name4',
  'family_relationship5',
  'family_name5',
  'family_relationship6',
  'family_name6',
  'family_relationship7',
  'family_name7',
  'family_relationship8',
  'family_name8',
  'family_relationship9',
  'family_name9',
  'interest1',
  'interest2',
  'interest3',
  'interest4',
  'interest5',
  'last_contact',
  'next_contact',
  'birthday'
].join(', ');

const CONTACT_DETAILS_WORK_FIELDS = CONTACT_LIBRARY_LEGACY_SELECT_FIELDS;

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
    .from('contact_library')
    .select(CONTACT_DETAILS_WORK_FIELDS)
    .eq('owner_handle', oh)
    .eq('name', cn)
    .maybeSingle();

  if (error) {
    if (isSchemaError(error)) return null;
    throw error;
  }

  if (data) return data;

  // e.g. `?contact_name=aaron%20chalal` vs stored "Aaron Chalal"
  const ilikePattern = contactNameIlikeExactPattern(cn);
  ({ data, error } = await supabase
    .from('contact_library')
    .select(CONTACT_DETAILS_WORK_FIELDS)
    .eq('owner_handle', oh)
    .ilike('name', ilikePattern)
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
    .from('contact_library')
    .select(CONTACT_DETAILS_WORK_FIELDS)
    .eq('owner_handle', oh)
    .eq('person_handle', pathNorm)
    .maybeSingle();

  if (!errHandle && byHandle) return byHandle;
  if (errHandle && !isSchemaError(errHandle)) throw errHandle;

  const { data: rows, error } = await supabase
    .from('contact_library')
    .select(CONTACT_DETAILS_WORK_FIELDS)
    .eq('owner_handle', oh);

  if (error) {
    if (isSchemaError(error)) return null;
    throw error;
  }
  if (!rows || !rows.length) return null;

  for (const row of rows) {
    const stored = row.handle
      ? String(row.handle).toLowerCase()
      : contactDetailsHandleValue(oh, row.contact_name || row.name);
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
    .from('contact_library')
    .select(
      'contact_name:name, my_notes, personal_email, work_email, contact_handle:profile_handle, handle:person_handle'
    )
    .eq('owner_handle', oh)
    .order('name', { ascending: true });

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
    .from('contact_library')
    .delete()
    .eq('owner_handle', oh)
    .eq('name', cn);

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

  // Legacy ownership check depended on `profiles`; with consolidated `contact_library`,
  // callers already scope writes by `owner_handle`.

  const filtered = {};
  for (const key of Object.keys(patch || {})) {
    if (!CONTACT_DETAILS_PATCHABLE.has(key)) continue;
    let v = patch[key];
    if (v === undefined) continue;
    if (v === '') v = null;
    const mappedKey =
      key === 'contact_name'
        ? 'name'
        : key === 'contact_handle'
          ? 'profile_handle'
          : key === 'handle'
            ? 'person_handle'
            : key;
    filtered[mappedKey] = v;
  }

  const existing = await getContactDetailsWork(oh, lookupCn);

  if (existing) {
    if (Object.keys(filtered).length === 0) {
      return existing;
    }
    const finalContactName =
      filtered.name !== undefined
        ? normalizeContactDetailName(filtered.name)
        : normalizeContactDetailName(existing.contact_name || lookupCn);
    const nextHandle = contactDetailsHandleValue(oh, finalContactName);
    if (!nextHandle) {
      throw new Error(
        'Contact name must contain at least one letter or number for the handle field'
      );
    }
    filtered.person_handle = nextHandle;

    const { data, error } = await supabase
      .from('contact_library')
      .update(filtered)
      .eq('owner_handle', oh)
      .eq('name', lookupCn)
      .select(CONTACT_DETAILS_WORK_FIELDS)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  const insertRow = {
    owner_handle: oh,
    name: lookupCn,
    ...filtered
  };
  insertRow.name = normalizeContactDetailName(insertRow.name);
  const insertHandle = contactDetailsHandleValue(oh, insertRow.name);
  if (!insertHandle) {
    throw new Error(
      'Contact name must contain at least one letter or number for the handle field'
    );
  }
  insertRow.person_handle = insertHandle;

  const { data: inserted, error: insErr } = await supabase
    .from('contact_library')
    .insert(insertRow)
    .select(CONTACT_DETAILS_WORK_FIELDS)
    .maybeSingle();

  if (insErr) throw insErr;
  return inserted || null;
}

/** Lowercase, strip leading @ — matches `group_members.person_handle` to `contact_details.handle`. */
function detailHandleLookupKey(s) {
  return String(s || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
}

/**
 * Blind-member invites: match `contact_details.handle` only (no `profiles` lookup for the invitee).
 * Scoped to the inviter's address book (`owners_handle` = inviter profile handle).
 */
async function getContactDetailsRowByOwnersHandleAndHandleColumn(
  ownersHandle,
  compositeHandle
) {
  const supabase = getClient();
  const oh = String(ownersHandle || '').trim().replace(/^@+/, '');
  const key = detailHandleLookupKey(compositeHandle);
  if (!supabase || !oh || !key) return null;

  const { data, error } = await supabase
    .from('contact_library')
    .select('handle:person_handle, work_email, personal_email, contact_name:name')
    .eq('owner_handle', oh)
    .eq('person_handle', key)
    .maybeSingle();

  if (error) {
    if (isSchemaError(error)) return null;
    throw error;
  }
  return data || null;
}

function getEmailFromContactDetailsRow(row) {
  if (!row) return null;
  const w = row.work_email != null ? normalizeEmail(row.work_email) : '';
  const p = row.personal_email != null ? normalizeEmail(row.personal_email) : '';
  return w || p || null;
}

/**
 * Resolve invitee for blind-member group adds using only `contact_details.handle`.
 * Optional `work_email` / `personal_email` are returned when present; otherwise `memberEmail` is null
 * (DB row uses `group_members.person_handle` only).
 */
async function resolveBlindMemberInviteeFromContactDetails(
  actorUserEmail,
  personHandleComposite
) {
  const inviter = await getProfileByEmail(actorUserEmail);
  if (!inviter || !String(inviter.handle || '').trim()) {
    return {
      ok: false,
      error:
        'Your profile must have a public handle to add blind members from your address book.'
    };
  }
  const oh = String(inviter.handle).trim().replace(/^@+/, '');
  const ph = String(personHandleComposite || '').trim();
  if (!ph) {
    return { ok: false, error: 'person_handle is required' };
  }
  const row = await getContactDetailsRowByOwnersHandleAndHandleColumn(oh, ph);
  if (!row) {
    return {
      ok: false,
      error:
        'No contact with that handle in your address book (contact_details.handle).'
    };
  }
  const memberEmail = getEmailFromContactDetailsRow(row);
  return { ok: true, memberEmail: memberEmail || null };
}

/**
 * For the viewer's address book (`owners_handle` = profile handle), map `contact_details.handle` → `contact_name`.
 * Includes computed handles via {@link contactDetailsHandleValue} when `handle` is null.
 */
async function getContactHandleToContactNameMap(ownersHandle) {
  const supabase = getClient();
  const oh = String(ownersHandle || '')
    .trim()
    .replace(/^@+/, '');
  if (!supabase || !oh) return new Map();

  const { data, error } = await supabase
    .from('contact_library')
    .select('contact_name:name, handle:person_handle')
    .eq('owner_handle', oh);

  if (error) {
    if (isSchemaError(error)) return new Map();
    throw error;
  }

  const m = new Map();
  for (const row of data || []) {
    const cn = row.contact_name != null ? String(row.contact_name).trim() : '';
    if (!cn) continue;
    if (row.handle != null && String(row.handle).trim() !== '') {
      const k = detailHandleLookupKey(row.handle);
      if (k && !m.has(k)) m.set(k, cn);
    }
    const computed = contactDetailsHandleValue(oh, cn);
    if (computed) {
      const k2 = detailHandleLookupKey(computed);
      if (k2 && !m.has(k2)) m.set(k2, cn);
    }
  }
  return m;
}

/**
 * Adds `contact_name` on each row when `person_handle` matches `contact_details.handle` for this owner.
 * @param {string} ownersHandle Profile `handle` (same as `contact_details.owners_handle`)
 * @param {object[]} rows `group_members` rows with optional `person_handle`
 */
async function enrichGroupMemberRowsWithContactNames(ownersHandle, rows) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  const map = await getContactHandleToContactNameMap(ownersHandle);
  return rows.map(r => {
    const ph = r.person_handle != null ? String(r.person_handle).trim() : '';
    const contact_name = ph ? map.get(detailHandleLookupKey(ph)) || null : null;
    return { ...r, contact_name };
  });
}

/**
 * For rows with no `contact_name`, match `person_handle` to `profiles.handle` and set `profile_name` from `profiles.name`.
 */
async function enrichGroupMemberRowsWithProfileNames(rows) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  const supabase = getClient();
  if (!supabase) {
    return rows.map(r => ({ ...r, profile_name: null }));
  }

  const keysNeedingProfile = new Set();
  for (const r of rows) {
    const hasContact = r.contact_name && String(r.contact_name).trim();
    if (hasContact) continue;
    const ph = r.person_handle != null ? String(r.person_handle).trim() : '';
    if (ph) keysNeedingProfile.add(detailHandleLookupKey(ph));
  }

  const map = new Map();
  if (keysNeedingProfile.size) {
    const handleList = [...keysNeedingProfile];
    const { data, error } = await supabase
      .from('contact_library')
      .select('name, person_handle')
      .in('person_handle', handleList);

    if (error && !isSchemaError(error)) throw error;
    for (const row of data || []) {
      const hk = detailHandleLookupKey(row.person_handle);
      const nm = row.name != null ? String(row.name).trim() : '';
      if (hk && nm && !map.has(hk)) map.set(hk, nm);
    }

    for (const k of keysNeedingProfile) {
      if (map.has(k)) continue;
      try {
        const p = await getProfileByHandle(k);
        if (p && p.name) {
          const nm = String(p.name).trim();
          if (nm) map.set(k, nm);
        }
      } catch (e) {
        /* ignore */
      }
    }
  }

  return rows.map(r => {
    const hasContact = r.contact_name && String(r.contact_name).trim();
    if (hasContact) return { ...r, profile_name: null };
    const ph = r.person_handle != null ? String(r.person_handle).trim() : '';
    const k = ph ? detailHandleLookupKey(ph) : '';
    const profile_name = k ? map.get(k) || null : null;
    return { ...r, profile_name };
  });
}

/**
 * `display_name`: contact_name or profile name.
 * `display_status`: DB `status` plus `, contact` or `, friend` (never replaces the stored status).
 */
function attachGroupMemberDisplayFields(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(r => {
    const cn = r.contact_name && String(r.contact_name).trim();
    const pn = r.profile_name && String(r.profile_name).trim();
    const display_name = cn || pn || null;
    const raw = r.status != null ? String(r.status).trim() : '';
    const base = raw;

    let display_status;
    if (cn) {
      display_status = base ? `${base}, contact` : 'contact';
    } else if (pn) {
      display_status = base ? `${base}, friend` : 'friend';
    } else {
      display_status = base ? `${base}, contact` : 'contact';
    }

    return { ...r, display_name, display_status };
  });
}

module.exports = {
  isConfigured,
  getProfileByEmail,
  getProfileByHandle,
  getProfilesByEmails,
  getContactLibraryNamesByPersonHandles,
  listContactLibraryByOwnerHandle,
  getContactLibraryRowByPersonHandle,
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
  getContactPhotoUrlByPersonHandle,
  uploadContactPhoto,
  getContactDetailsWork,
  getContactDetailsWorkByPathKey,
  upsertContactDetails,
  listContactDetailsByOwnersHandle,
  deleteContactDetailsForOwner,
  enrichGroupMemberRowsWithContactNames,
  enrichGroupMemberRowsWithProfileNames,
  attachGroupMemberDisplayFields,
  resolveBlindMemberInviteeFromContactDetails
};
