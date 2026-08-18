/**
 * Web Push (PWA) + native APNs (Capacitor iOS) subscriptions.
 * Stored in temporary_variables so no extra Supabase table is required.
 */

const fs = require('fs');
const webpush = require('web-push');
const apn = require('@parse/node-apn');
const supabaseTemporary = require('./supabase-temporary');

const WEB_SUB_KEY = 'web_push_subscription';
const NATIVE_TOKEN_KEY = 'native_push_token';

let apnProvider = null;

function isWebPushConfigured() {
  return !!(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    supabaseTemporary.isConfigured()
  );
}

function isApnsConfigured() {
  return !!(
    process.env.APNS_KEY_ID &&
    process.env.APNS_TEAM_ID &&
    (process.env.APNS_KEY_PATH || process.env.APNS_KEY) &&
    supabaseTemporary.isConfigured()
  );
}

function isConfigured() {
  return isWebPushConfigured() || isApnsConfigured();
}

function vapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function configureWebPush() {
  if (!isWebPushConfigured()) return false;
  const subject = process.env.VAPID_SUBJECT || 'mailto:hello@habitstackerapp.com';
  webpush.setVapidDetails(subject, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  return true;
}

function getApnsProvider() {
  if (apnProvider) return apnProvider;
  if (!isApnsConfigured()) return null;
  const key = process.env.APNS_KEY_PATH
    ? fs.readFileSync(process.env.APNS_KEY_PATH, 'utf8')
    : process.env.APNS_KEY;
  apnProvider = new apn.Provider({
    token: {
      key,
      keyId: process.env.APNS_KEY_ID,
      teamId: process.env.APNS_TEAM_ID
    },
    production: process.env.APNS_PRODUCTION !== 'false'
  });
  return apnProvider;
}

function parseSubs(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((s) => s && s.endpoint);
    if (parsed && parsed.endpoint) return [parsed];
  } catch (err) {
    console.warn('Invalid push subscription JSON:', err.message);
  }
  return [];
}

function parseNativeToken(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.token) return parsed;
  } catch (err) {
    console.warn('Invalid native push token JSON:', err.message);
  }
  return null;
}

async function readSubs(ownerId) {
  if (!ownerId) return [];
  const row = await supabaseTemporary.getVariable(ownerId, WEB_SUB_KEY);
  return parseSubs(row && row.temporary_table_value);
}

async function writeSubs(ownerId, subs) {
  if (!ownerId) return;
  await supabaseTemporary.upsertVariable(ownerId, WEB_SUB_KEY, JSON.stringify(subs));
}

async function saveSubscription(userId, email, subscription) {
  if (!subscription || !subscription.endpoint) {
    throw new Error('Invalid push subscription');
  }
  const owners = [...new Set([userId, email].filter(Boolean))];
  for (const owner of owners) {
    const existing = await readSubs(owner);
    const next = existing.filter((s) => s.endpoint !== subscription.endpoint);
    next.push({
      endpoint: subscription.endpoint,
      keys: subscription.keys || {}
    });
    await writeSubs(owner, next);
  }
}

async function saveNativeToken(userId, email, token, platform) {
  if (!token) throw new Error('Invalid native push token');
  const payload = JSON.stringify({
    token: String(token),
    platform: platform || 'ios',
    updatedAt: new Date().toISOString()
  });
  const owners = [...new Set([userId, email].filter(Boolean))];
  for (const owner of owners) {
    await supabaseTemporary.upsertVariable(owner, NATIVE_TOKEN_KEY, payload);
  }
}

async function getSubscriptions(userId, email) {
  const owners = [...new Set([userId, email].filter(Boolean))];
  const byEndpoint = new Map();
  for (const owner of owners) {
    const list = await readSubs(owner);
    list.forEach((sub) => {
      if (sub.endpoint) byEndpoint.set(sub.endpoint, sub);
    });
  }
  return [...byEndpoint.values()];
}

async function getNativeToken(userId, email) {
  const owners = [...new Set([userId, email].filter(Boolean))];
  for (const owner of owners) {
    const row = await supabaseTemporary.getVariable(owner, NATIVE_TOKEN_KEY);
    const parsed = parseNativeToken(row && row.temporary_table_value);
    if (parsed) return parsed;
  }
  return null;
}

async function removeSubscription(userId, email, endpoint) {
  const owners = [...new Set([userId, email].filter(Boolean))];
  for (const owner of owners) {
    const existing = await readSubs(owner);
    await writeSubs(owner, existing.filter((s) => s.endpoint !== endpoint));
  }
}

async function sendWebPushToUser(userId, email, payload) {
  if (!configureWebPush()) return { sent: 0, skipped: true };
  const subs = await getSubscriptions(userId, email);
  if (subs.length === 0) return { sent: 0, skipped: false };
  const body = JSON.stringify(payload);
  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: sub.keys
        },
        body
      );
      sent += 1;
    } catch (err) {
      const status = err.statusCode || err.status;
      console.warn('Web push send failed:', status, err.message);
      if (status === 404 || status === 410) {
        await removeSubscription(userId, email, sub.endpoint);
      }
    }
  }
  return { sent, skipped: false };
}

async function sendNativePushToUser(userId, email, payload) {
  const provider = getApnsProvider();
  if (!provider) return { sent: 0, skipped: true };
  const native = await getNativeToken(userId, email);
  if (!native || !native.token) return { sent: 0, skipped: false };

  const note = new apn.Notification();
  note.expiry = Math.floor(Date.now() / 1000) + 3600;
  note.alert = {
    title: payload.title || 'Habit Stacker',
    body: payload.body || payload.message || 'You have a new achievement.'
  };
  note.sound = 'default';
  note.topic = process.env.APNS_BUNDLE_ID || 'com.habitstackerapp.app';
  note.payload = { url: payload.url || '/habits/achievements.html' };

  const result = await provider.send(note, native.token);
  const sent = (result.sent && result.sent.length) || 0;
  if (result.failed && result.failed.length) {
    result.failed.forEach((failure) => {
      console.warn('APNs send failed:', failure.response && failure.response.reason, failure.device);
    });
  }
  return { sent, skipped: false };
}

async function sendPushToUser(userId, email, payload) {
  const webResult = await sendWebPushToUser(userId, email, payload);
  const nativeResult = await sendNativePushToUser(userId, email, payload);
  return {
    sent: (webResult.sent || 0) + (nativeResult.sent || 0),
    skipped: !!(webResult.skipped && nativeResult.skipped)
  };
}

module.exports = {
  isConfigured,
  isWebPushConfigured,
  isApnsConfigured,
  vapidPublicKey,
  saveSubscription,
  saveNativeToken,
  getSubscriptions,
  getNativeToken,
  sendPushToUser
};
