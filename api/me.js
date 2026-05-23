import { sendJson, methodNotAllowed } from "./_lib/util.js";
import { getUserId } from "./_lib/auth.js";
import { isConfigured } from "./_lib/claude.js";
import { isVoiceConfigured } from "./_lib/openai.js";
import { isPushConfigured } from "./_lib/push.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const uid = getUserId(req);
  sendJson(res, 200, {
    authed: Boolean(uid),
    hasPassphrase: Boolean(process.env.APP_PASSPHRASE_HASH),
    configured: {
      claude: isConfigured(),
      voice: isVoiceConfigured(),
      push: isPushConfigured(),
    },
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
  });
}
