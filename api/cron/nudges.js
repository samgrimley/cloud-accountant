import { sendJson } from "../_lib/util.js";
import { ready, USER_ID } from "../_lib/db.js";
import { dueNudges, sendToUser, logNudge, isPushConfigured } from "../_lib/push.js";

export default async function handler(req, res) {
  // When CRON_SECRET is set (recommended on Vercel), require it.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers?.authorization || "";
    if (auth !== `Bearer ${secret}`) return sendJson(res, 401, { error: "Unauthorized" });
  }

  if (!isPushConfigured()) return sendJson(res, 200, { skipped: "push not configured" });

  try {
    await ready();
    const nudges = await dueNudges(USER_ID);
    let sent = 0;
    for (const n of nudges) {
      const count = await sendToUser(USER_ID, n.payload);
      if (count > 0) {
        await logNudge(USER_ID, n.kind, n.ref);
        sent += 1;
      }
    }
    sendJson(res, 200, { ok: true, due: nudges.length, sent });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}
