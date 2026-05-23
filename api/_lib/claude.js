import Anthropic from "@anthropic-ai/sdk";
import { buildSystem, TOOLS } from "./prompts.js";
import { sse } from "./util.js";

const MODEL = process.env.MODEL || "claude-opus-4-7";
const THINKING = (process.env.THINKING || "adaptive").toLowerCase();
const EFFORT = process.env.EFFORT || "low";
const MEMORY_MODEL = "claude-haiku-4-5-20251001";

let client;
export function getClient() {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  client = new Anthropic({ apiKey });
  return client;
}

export function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export { MODEL };

// Turn the frontend's {role, text} history into API messages, injecting the
// user's app context as a background block on the latest user message (so the
// cached system prompt stays stable across turns).
function buildMessages(history, context) {
  const msgs = history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.text)
    .map((m) => ({ role: m.role, content: m.text }));

  if (msgs.length && context) {
    const last = msgs[msgs.length - 1];
    if (last.role === "user") {
      last.content = `<your_current_context note="background only — the person didn't type this">\n${context}\n</your_current_context>\n\n${last.content}`;
    }
  }
  return msgs;
}

// Streams a chat reply over SSE. Emits: text, suggestion, done, error.
// Returns the assistant's plain-text reply (for persistence).
export async function streamChat(res, { history, mode, context }) {
  const c = getClient();
  if (!c) {
    sse(res, "error", { message: "No ANTHROPIC_API_KEY set on the server." });
    return "";
  }

  const messages = buildMessages(history, context);
  const system = buildSystem(mode);
  const baseParams = { model: MODEL, max_tokens: 2048, system, tools: TOOLS };
  if (THINKING !== "off") {
    baseParams.thinking = { type: "adaptive" };
    baseParams.output_config = { effort: EFFORT };
  }

  let replyText = "";
  let guard = 0;
  let keepLooping = true;
  while (keepLooping && guard < 5) {
    guard += 1;
    const stream = c.messages.stream({ ...baseParams, messages });
    stream.on("text", (delta) => {
      replyText += delta;
      sse(res, "text", { delta });
    });

    const finalMessage = await stream.finalMessage();
    messages.push({ role: "assistant", content: finalMessage.content });

    const toolUses = finalMessage.content.filter((b) => b.type === "tool_use");
    if (finalMessage.stop_reason === "tool_use" && toolUses.length) {
      const toolResults = [];
      for (const tu of toolUses) {
        sse(res, "suggestion", { id: tu.id, name: tu.name, input: tu.input });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: "Shown to the person with a Keep button. They will decide.",
        });
      }
      messages.push({ role: "user", content: toolResults });
    } else {
      keepLooping = false;
    }
  }
  return replyText.trim();
}

// Maintains the running "what helps me" memory. Cheap model, non-streaming.
export async function summarize(history, existingSummary) {
  const c = getClient();
  if (!c) return existingSummary || "";

  const transcript = history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.text)
    .map((m) => `${m.role === "user" ? "Them" : "Companion"}: ${m.text}`)
    .join("\n");

  const sys = `You maintain a private, evolving note that helps an ACT companion remember one person over time. Merge the existing note with anything important from the latest conversation. Keep it under 220 words. Capture: what matters to them (values/themes), what tends to hook them, what actually helps them, what they're working toward, and useful context — NOT a blow-by-blow transcript. Write in calm, plain third person. Output only the note.`;

  const user = `EXISTING NOTE:\n${existingSummary || "(empty)"}\n\nLATEST CONVERSATION:\n${transcript}\n\nReturn the updated note.`;

  try {
    const msg = await c.messages.create({
      model: MEMORY_MODEL,
      max_tokens: 600,
      system: sys,
      messages: [{ role: "user", content: user }],
    });
    const text = msg.content.find((b) => b.type === "text")?.text;
    return (text || existingSummary || "").trim();
  } catch {
    return existingSummary || "";
  }
}
