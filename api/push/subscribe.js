import { sendJson, readJson, methodNotAllowed } from "../_lib/util.js";
import { requireAuth } from "../_lib/auth.js";
import { ready } from "../_lib/db.js";
import { saveSubscription } from "../_lib/push.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const uid = requireAuth(req, res);
  if (!uid) return;
  try {
    await ready();
    const { subscription } = await readJson(req);
    if (!subscription?.endpoint || !subscription?.keys?.p256dh) {
      return sendJson(res, 400, { error: "Invalid subscription." });
    }
    await saveSubscription(uid, subscription);
    sendJson(res, 200, { ok: true });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}
