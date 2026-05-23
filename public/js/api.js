async function req(path, options = {}) {
  const res = await fetch(path, { credentials: "same-origin", ...options });
  let data = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

export const api = {
  me: () => req("/api/me").then((r) => r.data || { authed: false }),

  login: (passphrase) =>
    req("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase }),
    }),

  logout: () => req("/api/logout", { method: "POST" }),

  state: () => req("/api/state").then((r) => r.data),

  mutate: (entity, op, data) =>
    req("/api/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, op, data }),
    }),

  stt: (audio, mimetype) =>
    req("/api/stt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio, mimetype }),
    }),

  tts: async (text, voice) => {
    const res = await fetch("/api/tts", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
    });
    if (!res.ok) throw new Error("TTS failed");
    return res.blob();
  },

  pushSubscribe: (subscription) =>
    req("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription }),
    }),

  // Streams /api/chat (POST). Calls handlers as events arrive.
  chat: async ({ messages, mode, conversationId }, handlers) => {
    const res = await fetch("/api/chat", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, mode, conversationId }),
    });
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({}));
      handlers.onError?.(err.error || "Chat failed");
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const events = buf.split("\n\n");
      buf = events.pop() || "";
      for (const block of events) {
        let event = "message";
        let dataStr = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
        }
        if (!dataStr) continue;
        let payload = {};
        try {
          payload = JSON.parse(dataStr);
        } catch {
          continue;
        }
        if (event === "meta") handlers.onMeta?.(payload);
        else if (event === "text") handlers.onText?.(payload.delta);
        else if (event === "suggestion") handlers.onSuggestion?.(payload);
        else if (event === "done") handlers.onDone?.(payload);
        else if (event === "error") handlers.onError?.(payload.message);
      }
    }
  },
};
