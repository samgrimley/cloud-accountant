import { sendJson, readJson, methodNotAllowed } from "./_lib/util.js";
import { verifyPassphrase, setSessionCookie } from "./_lib/auth.js";
import { USER_ID } from "./_lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    const { passphrase } = await readJson(req);
    if (!process.env.APP_PASSPHRASE_HASH) {
      return sendJson(res, 503, {
        error: "No passphrase is configured on the server (APP_PASSPHRASE_HASH).",
      });
    }
    if (!passphrase || !verifyPassphrase(passphrase)) {
      return sendJson(res, 401, { error: "That passphrase didn't match." });
    }
    setSessionCookie(req, res, USER_ID);
    sendJson(res, 200, { ok: true });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}
