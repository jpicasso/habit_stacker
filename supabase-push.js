/**
 * Web Push subscriptions, stored in temporary_variables
 * (key: web_push_subscription) so no extra Supabase table is required.
 */

const webpush = require('web-push');
const supabaseTemporary = require('./supabase-temporary');

const SUB_KEY = 'web_push_subscription';

function isConfigured() {
  return !!(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    supabaseTemporary.isConfigured()
  );
}

function vapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function configureWebPush() {
  if (!isConfigured()) return false;
  const subject = process.env.VAPID_SUBJECT || 'mailto:hello@habitstackerapp.com';
  webpush.setVapidDetails(subject, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  return true;
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

async function readSubs(ownerId) {
  if (!ownerId) return [];
  const row = await supabaseTemporary.getVariable(ownerId, SUB_KEY);
  return parseSubs(row && row.temporary_table_value);
}

async function writeSubs(ownerId, subs) {
  if (!ownerId) return;
  await supabaseTemporary.upsertVariable(ownerId, SUB_KEY, JSON.stringify(subs));
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

async function removeSubscription(userId, email, endpoint) {
  const owners = [...new Set([userId, email].filter(Boolean))];
  for (const owner of owners) {
    const existing = await readSubs(owner);
    await writeSubs(owner, existing.filter((s) => s.endpoint !== endpoint));
  }
}

async function sendPushToUser(userId, email, payload) {
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
      console.warn('Push send failed:', status, err.message);
      if (status === 404 || status === 410) {
        await removeSubscription(userId, email, sub.endpoint);
      }
    }
  }
  return { sent, skipped: false };
}

module.exports = {
  isConfigured,
  vapidPublicKey,
  saveSubscription,
  getSubscriptions,
  sendPushToUser
};
