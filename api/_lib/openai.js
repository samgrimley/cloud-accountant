import OpenAI, { toFile } from "openai";

const STT_MODEL = process.env.STT_MODEL || "gpt-4o-transcribe";
const TTS_MODEL = process.env.TTS_MODEL || "gpt-4o-mini-tts";
const TTS_VOICE = process.env.TTS_VOICE || "alloy";

let client;
function getClient() {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  client = new OpenAI({ apiKey });
  return client;
}

export function isVoiceConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function extFor(mimetype = "") {
  if (mimetype.includes("webm")) return "webm";
  if (mimetype.includes("mp4")) return "mp4";
  if (mimetype.includes("mpeg")) return "mp3";
  if (mimetype.includes("ogg")) return "ogg";
  if (mimetype.includes("wav")) return "wav";
  return "webm";
}

export async function transcribe(base64Audio, mimetype) {
  const c = getClient();
  if (!c) throw new Error("No OPENAI_API_KEY set on the server.");
  const buffer = Buffer.from(base64Audio, "base64");
  const file = await toFile(buffer, `audio.${extFor(mimetype)}`, { type: mimetype });
  const result = await c.audio.transcriptions.create({ file, model: STT_MODEL });
  return result.text || "";
}

export async function speak(text, voice) {
  const c = getClient();
  if (!c) throw new Error("No OPENAI_API_KEY set on the server.");
  const response = await c.audio.speech.create({
    model: TTS_MODEL,
    voice: voice || TTS_VOICE,
    input: text,
    response_format: "mp3",
  });
  return Buffer.from(await response.arrayBuffer());
}
