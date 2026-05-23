// Local dev server. Mounts the same handlers used by Vercel's /api functions so
// `npm run dev` behaves like production. On Vercel this file is ignored.
import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import login from "./api/login.js";
import logout from "./api/logout.js";
import me from "./api/me.js";
import state from "./api/state.js";
import mutate from "./api/mutate.js";
import chat from "./api/chat.js";
import stt from "./api/stt.js";
import tts from "./api/tts.js";
import pushSubscribe from "./api/push/subscribe.js";
import cronNudges from "./api/cron/nudges.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json({ limit: "12mb" }));

const wrap = (h) => (req, res) => Promise.resolve(h(req, res)).catch((e) => {
  console.error(e);
  if (!res.headersSent) res.status(500).json({ error: e.message });
});

app.post("/api/login", wrap(login));
app.post("/api/logout", wrap(logout));
app.get("/api/me", wrap(me));
app.get("/api/state", wrap(state));
app.post("/api/mutate", wrap(mutate));
app.post("/api/chat", wrap(chat));
app.post("/api/stt", wrap(stt));
app.post("/api/tts", wrap(tts));
app.post("/api/push/subscribe", wrap(pushSubscribe));
app.get("/api/cron/nudges", wrap(cronNudges));

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`ACT companion (dev) on http://localhost:${PORT}`);
  const flags = {
    claude: Boolean(process.env.ANTHROPIC_API_KEY),
    voice: Boolean(process.env.OPENAI_API_KEY),
    db: Boolean(process.env.DATABASE_URL),
    auth: Boolean(process.env.APP_PASSPHRASE_HASH && process.env.SESSION_SECRET),
    push: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
  };
  console.log("Configured:", flags);
});
