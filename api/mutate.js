import { sendJson, readJson, methodNotAllowed } from "./_lib/util.js";
import { requireAuth } from "./_lib/auth.js";
import { q, ready } from "./_lib/db.js";

function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const ACE = new Set(["A", "C", "E"]);
function cleanAce(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.filter((x) => ACE.has(x)))];
}
function cleanSteps(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((s) => String(s)).filter(Boolean).slice(0, 12);
}

const BASIC_FIELDS = {
  moved: "moved",
  ate: "ate",
  slept: "slept",
  phoneFree: "phone_free",
  connected: "connected",
};

async function handle(uid, entity, op, data) {
  switch (`${entity}.${op}`) {
    case "value.create": {
      const r = await q(
        `INSERT INTO values_t (user_id, area, value, why) VALUES ($1,$2,$3,$4) RETURNING id`,
        [uid, data.area || null, data.value, data.why || null]
      );
      return { id: r.rows[0].id };
    }
    case "value.update": {
      await q(
        `UPDATE values_t SET area=COALESCE($3,area), value=COALESCE($4,value), why=COALESCE($5,why)
         WHERE id=$1 AND user_id=$2`,
        [data.id, uid, data.area ?? null, data.value ?? null, data.why ?? null]
      );
      return { id: data.id };
    }
    case "value.delete":
      await q(`DELETE FROM values_t WHERE id=$1 AND user_id=$2`, [data.id, uid]);
      return { id: data.id };

    case "action.create": {
      const r = await q(
        `INSERT INTO actions (user_id, title, ace, value_id, value_label, tiny_step, when_text, reminder_at, week_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          uid,
          data.title,
          cleanAce(data.ace),
          data.valueId || null,
          data.valueLabel || data.value || null,
          data.tinyStep || null,
          data.when || null,
          data.reminderAt ? new Date(data.reminderAt) : null,
          weekKey(),
        ]
      );
      return { id: r.rows[0].id };
    }
    case "action.update": {
      await q(
        `UPDATE actions SET
           title=COALESCE($3,title),
           ace=COALESCE($4,ace),
           value_label=COALESCE($5,value_label),
           tiny_step=COALESCE($6,tiny_step),
           when_text=COALESCE($7,when_text),
           reminder_at=$8
         WHERE id=$1 AND user_id=$2`,
        [
          data.id,
          uid,
          data.title ?? null,
          data.ace ? cleanAce(data.ace) : null,
          data.valueLabel ?? null,
          data.tinyStep ?? null,
          data.when ?? null,
          data.reminderAt ? new Date(data.reminderAt) : null,
        ]
      );
      return { id: data.id };
    }
    case "action.toggle": {
      await q(
        `UPDATE actions SET done=$3, done_at=CASE WHEN $3 THEN now() ELSE NULL END
         WHERE id=$1 AND user_id=$2`,
        [data.id, uid, Boolean(data.done)]
      );
      return { id: data.id };
    }
    case "action.delete":
      await q(`DELETE FROM actions WHERE id=$1 AND user_id=$2`, [data.id, uid]);
      return { id: data.id };

    case "exercise.create": {
      const r = await q(
        `INSERT INTO exercises (user_id, name, type, steps, when_to_use)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [uid, data.name, data.type || null, cleanSteps(data.steps), data.whenToUse || null]
      );
      return { id: r.rows[0].id };
    }
    case "exercise.update": {
      await q(
        `UPDATE exercises SET name=COALESCE($3,name), type=COALESCE($4,type),
           steps=COALESCE($5,steps), when_to_use=COALESCE($6,when_to_use)
         WHERE id=$1 AND user_id=$2`,
        [
          data.id,
          uid,
          data.name ?? null,
          data.type ?? null,
          data.steps ? cleanSteps(data.steps) : null,
          data.whenToUse ?? null,
        ]
      );
      return { id: data.id };
    }
    case "exercise.delete":
      await q(`DELETE FROM exercises WHERE id=$1 AND user_id=$2`, [data.id, uid]);
      return { id: data.id };

    case "basics.set": {
      const col = BASIC_FIELDS[data.field];
      if (!col) throw new Error("Unknown basics field");
      const today = new Date().toISOString().slice(0, 10);
      await q(
        `INSERT INTO basics (user_id, date, ${col}) VALUES ($1,$2,$3)
         ON CONFLICT (user_id, date) DO UPDATE SET ${col}=EXCLUDED.${col}`,
        [uid, today, Boolean(data.value)]
      );
      return { ok: true };
    }

    case "checkin.create": {
      const r = await q(
        `INSERT INTO checkins (user_id, mood, values_living, note) VALUES ($1,$2,$3,$4) RETURNING id`,
        [uid, data.mood ?? null, data.valuesLiving ?? null, data.note || null]
      );
      return { id: r.rows[0].id };
    }

    case "settings.update": {
      await q(
        `UPDATE settings SET
           notif_enabled=COALESCE($2,notif_enabled),
           checkin_enabled=COALESCE($3,checkin_enabled),
           checkin_hour=COALESCE($4,checkin_hour),
           speak_replies=COALESCE($5,speak_replies),
           voice=COALESCE($6,voice),
           updated_at=now()
         WHERE user_id=$1`,
        [
          uid,
          data.notifEnabled ?? null,
          data.checkinEnabled ?? null,
          data.checkinHour ?? null,
          data.speakReplies ?? null,
          data.voice ?? null,
        ]
      );
      return { ok: true };
    }

    default:
      throw new Error(`Unknown operation ${entity}.${op}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const uid = requireAuth(req, res);
  if (!uid) return;
  try {
    await ready();
    const { entity, op, data = {} } = await readJson(req);
    if (!entity || !op) return sendJson(res, 400, { error: "entity and op are required" });
    const result = await handle(uid, entity, op, data);
    sendJson(res, 200, { ok: true, ...result });
  } catch (e) {
    sendJson(res, 400, { error: e.message });
  }
}
