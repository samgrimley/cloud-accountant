import { sendJson, methodNotAllowed } from "./_lib/util.js";
import { requireAuth } from "./_lib/auth.js";
import { q, ready } from "./_lib/db.js";

function ymd(d) {
  if (!d) return null;
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const uid = requireAuth(req, res);
  if (!uid) return;

  try {
    await ready();
    const today = new Date().toISOString().slice(0, 10);

    const [values, actions, exercises, basics, checkins, settings] = await Promise.all([
      q(`SELECT id, area, value, why FROM values_t WHERE user_id=$1 ORDER BY created_at`, [uid]),
      q(
        `SELECT id, title, ace, value_id, value_label, tiny_step, when_text, reminder_at,
                done, week_key FROM actions WHERE user_id=$1 ORDER BY done, created_at DESC`,
        [uid]
      ),
      q(
        `SELECT id, name, type, steps, when_to_use FROM exercises WHERE user_id=$1 ORDER BY created_at DESC`,
        [uid]
      ),
      q(`SELECT date, moved, ate, slept, phone_free, connected FROM basics WHERE user_id=$1 AND date=$2`, [
        uid,
        today,
      ]),
      q(
        `SELECT id, date, mood, values_living, note FROM checkins WHERE user_id=$1
         ORDER BY date DESC, created_at DESC LIMIT 60`,
        [uid]
      ),
      q(
        `SELECT notif_enabled, checkin_enabled, checkin_hour, speak_replies, voice
         FROM settings WHERE user_id=$1`,
        [uid]
      ),
    ]);

    const b = basics.rows[0];
    const s = settings.rows[0] || {};

    sendJson(res, 200, {
      values: values.rows.map((v) => ({ id: v.id, area: v.area, value: v.value, why: v.why })),
      actions: actions.rows.map((a) => ({
        id: a.id,
        title: a.title,
        ace: a.ace || [],
        valueId: a.value_id,
        valueLabel: a.value_label,
        tinyStep: a.tiny_step,
        when: a.when_text,
        reminderAt: a.reminder_at ? a.reminder_at.toISOString() : null,
        done: a.done,
        weekKey: a.week_key,
      })),
      exercises: exercises.rows.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        steps: e.steps || [],
        whenToUse: e.when_to_use,
      })),
      basics: {
        date: today,
        moved: b?.moved || false,
        ate: b?.ate || false,
        slept: b?.slept || false,
        phoneFree: b?.phone_free || false,
        connected: b?.connected || false,
      },
      checkins: checkins.rows
        .map((c) => ({
          id: c.id,
          date: ymd(c.date),
          mood: c.mood,
          valuesLiving: c.values_living,
          note: c.note,
        }))
        .reverse(),
      settings: {
        notifEnabled: s.notif_enabled || false,
        checkinEnabled: s.checkin_enabled || false,
        checkinHour: s.checkin_hour ?? 19,
        speakReplies: s.speak_replies || false,
        voice: s.voice || "alloy",
      },
    });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}
