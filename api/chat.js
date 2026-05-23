import { sse, readJson, sendJson, methodNotAllowed } from "./_lib/util.js";
import { requireAuth } from "./_lib/auth.js";
import { q, ready } from "./_lib/db.js";
import { streamChat } from "./_lib/claude.js";
import { buildContext, updateMemory, shouldUpdateMemory } from "./_lib/memory.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const uid = requireAuth(req, res);
  if (!uid) return;

  const { messages: history = [], mode = "talk", conversationId = null } =
    await readJson(req);
  if (!Array.isArray(history) || history.length === 0) {
    return sendJson(res, 400, { error: "No messages provided." });
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  let convId = conversationId;
  try {
    await ready();

    // Open a conversation row up front so the client can keep its id.
    if (!convId) {
      const r = await q(
        `INSERT INTO conversations (user_id, mode, messages) VALUES ($1,$2,'[]') RETURNING id`,
        [uid, mode]
      );
      convId = r.rows[0].id;
    }
    sse(res, "meta", { conversationId: convId });

    const context = await buildContext(uid);
    const replyText = await streamChat(res, { history, mode, context });

    const fullHistory = replyText
      ? [...history, { role: "assistant", text: replyText }]
      : history;

    await q(
      `UPDATE conversations SET messages=$3, mode=$4, updated_at=now()
       WHERE id=$1 AND user_id=$2`,
      [convId, uid, JSON.stringify(fullHistory), mode]
    );

    if (shouldUpdateMemory(fullHistory)) {
      await updateMemory(uid, fullHistory);
    }

    sse(res, "done", { conversationId: convId });
  } catch (err) {
    console.error("chat error:", err?.message || err);
    sse(res, "error", { message: err?.message || "Something went wrong." });
  } finally {
    res.end();
  }
}
