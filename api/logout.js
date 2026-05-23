import { sendJson, methodNotAllowed } from "./_lib/util.js";
import { clearSessionCookie } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  clearSessionCookie(req, res);
  sendJson(res, 200, { ok: true });
}
