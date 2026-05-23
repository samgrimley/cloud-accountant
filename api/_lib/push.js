import webpush from "web-push";
import { q, USER_ID } from "./db.js";

let configured = false;
function configure() {
  if (configured) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    VAPID_SUBJECT || "mailto:nobody@example.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  configured = true;
  return true;
}

export function isPushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export async function saveSubscription(uid, sub) {
  await q(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth`,
    [uid, sub.endpoint, sub.keys?.p256dh, sub.keys?.auth]
  );
}

async function getSubscriptions(uid) {
  const r = await q(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=$1`,
    [uid]
  );
  return r.rows;
}

export async function sendToUser(uid, payload) {
  if (!configure()) return 0;
  const subs = await getSubscriptions(uid);
  let sent = 0;
  for (const s of subs) {
    const subscription = {
      endpoint: s.endpoint,
      keys: { p256dh: s.p256dh, auth: s.auth },
    };
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      sent += 1;
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await q(`DELETE FROM push_subscriptions WHERE id=$1`, [s.id]);
      }
    }
  }
  return sent;
}

// Decide which gentle nudges are due, avoiding repeats via nudge_log.
export async function dueNudges(uid = USER_ID) {
  const out = [];

  // 1) Action reminders whose time has come.
  const acts = await q(
    `SELECT a.id, a.title, a.value_label FROM actions a
     WHERE a.user_id=$1 AND a.done=false
       AND a.reminder_at IS NOT NULL AND a.reminder_at <= now()
       AND NOT EXISTS (
         SELECT 1 FROM nudge_log n
         WHERE n.user_id=a.user_id AND n.kind='action' AND n.ref=a.id::text
       )`,
    [uid]
  );
  for (const a of acts.rows) {
    const toward = a.value_label ? ` — toward ${a.value_label}` : "";
    out.push({
      kind: "action",
      ref: String(a.id),
      payload: {
        title: "A small step you chose",
        body: `${a.title}${toward}`,
        url: "/?tab=plan",
      },
    });
  }

  // 2) A daily check-in prompt, if enabled and the hour has arrived.
  const s = await q(
    `SELECT checkin_enabled, checkin_hour FROM settings WHERE user_id=$1`,
    [uid]
  );
  const settings = s.rows[0];
  if (settings?.checkin_enabled) {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (now.getUTCHours() >= (settings.checkin_hour ?? 19)) {
      const already = await q(
        `SELECT 1 FROM nudge_log
         WHERE user_id=$1 AND kind='checkin' AND ref=$2`,
        [uid, today]
      );
      if (!already.rows.length) {
        out.push({
          kind: "checkin",
          ref: today,
          payload: {
            title: "A gentle check-in",
            body: "How has today been? A minute to notice, and pick one small kind thing.",
            url: "/?tab=talk&mode=checkin",
          },
        });
      }
    }
  }

  return out;
}

export async function logNudge(uid, kind, ref) {
  await q(`INSERT INTO nudge_log (user_id, kind, ref) VALUES ($1, $2, $3)`, [
    uid,
    kind,
    ref,
  ]);
}
