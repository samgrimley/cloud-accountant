import { sendJson, readJson, methodNotAllowed } from "./_lib/util.js";
import { requireAuth } from "./_lib/auth.js";
import { speak } from "./_lib/openai.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const uid = requireAuth(req, res);
  if (!uid) return;
  try {
    const { text, voice } = await readJson(req);
    if (!text || !text.trim()) return sendJson(res, 400, { error: "No text provided." });
    const audio = await speak(text.slice(0, 4000), voice);
    res.statusCode = 200;
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.end(audio);
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}
