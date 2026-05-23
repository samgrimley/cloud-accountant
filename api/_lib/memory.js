import { q, USER_ID } from "./db.js";
import { summarize } from "./claude.js";

// Builds the compact context block injected into each chat turn so the
// companion "knows" the person: their values, open actions, last check-in,
// and the running memory note.
export async function buildContext(uid = USER_ID) {
  const [vals, acts, checkin, mem] = await Promise.all([
    q(`SELECT id, area, value FROM values_t WHERE user_id=$1 ORDER BY created_at`, [uid]),
    q(
      `SELECT title, ace, when_text, value_label FROM actions
       WHERE user_id=$1 AND done=false ORDER BY created_at DESC LIMIT 12`,
      [uid]
    ),
    q(
      `SELECT date, mood, values_living, note FROM checkins
       WHERE user_id=$1 ORDER BY date DESC, created_at DESC LIMIT 1`,
      [uid]
    ),
    q(`SELECT summary FROM memory WHERE user_id=$1`, [uid]),
  ]);

  const parts = [];

  const summary = mem.rows[0]?.summary?.trim();
  if (summary) parts.push(`What you remember about them:\n${summary}`);

  if (vals.rows.length) {
    const list = vals.rows
      .map((v) => `- [#${v.id}] ${v.value}${v.area ? ` (${v.area})` : ""}`)
      .join("\n");
    parts.push(`Their saved values (use the id with refine_value):\n${list}`);
  } else {
    parts.push("They haven't saved any values yet.");
  }

  if (acts.rows.length) {
    const list = acts.rows
      .map((a) => {
        const ace = a.ace?.length ? ` [${a.ace.join("/")}]` : "";
        const when = a.when_text ? ` — ${a.when_text}` : "";
        const val = a.value_label ? ` (toward: ${a.value_label})` : "";
        return `- ${a.title}${ace}${when}${val}`;
      })
      .join("\n");
    parts.push(`Their open actions this week:\n${list}`);
  }

  if (checkin.rows[0]) {
    const c = checkin.rows[0];
    const bits = [];
    if (c.mood != null) bits.push(`mood ${c.mood}/5`);
    if (c.values_living != null) bits.push(`living-their-values ${c.values_living}/5`);
    if (c.note) bits.push(`note: ${c.note}`);
    parts.push(`Last check-in (${c.date?.toISOString?.().slice(0, 10) || c.date}): ${bits.join(", ")}`);
  }

  return parts.join("\n\n");
}

// Refresh the running memory note. Called periodically from the chat endpoint.
export async function updateMemory(uid, history) {
  const mem = await q(`SELECT summary FROM memory WHERE user_id=$1`, [uid]);
  const existing = mem.rows[0]?.summary || "";
  const next = await summarize(history, existing);
  if (next && next !== existing) {
    await q(
      `UPDATE memory SET summary=$2, updated_at=now() WHERE user_id=$1`,
      [uid, next]
    );
  }
}

// Update memory roughly every few user turns to bound cost/latency.
export function shouldUpdateMemory(history) {
  const userTurns = history.filter((m) => m?.role === "user" && m.text).length;
  return userTurns > 0 && userTurns % 4 === 0;
}
