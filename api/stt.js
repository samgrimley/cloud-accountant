import { sendJson, readJson, methodNotAllowed } from "./_lib/util.js";
import { requireAuth } from "./_lib/auth.js";
import { transcribe } from "./_lib/openai.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const uid = requireAuth(req, res);
  if (!uid) return;
  try {
    const { audio, mimetype = "audio/webm" } = await readJson(req);
    if (!audio) return sendJson(res, 400, { error: "No audio provided." });
    const text = await transcribe(audio, mimetype);
    sendJson(res, 200, { text });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}
