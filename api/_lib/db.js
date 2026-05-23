import pkg from "pg";

const { Pool } = pkg;

// Cache the pool across serverless invocations (and the local dev process).
function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!globalThis.__actPool) {
    globalThis.__actPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 10000,
      ssl: needsSsl() ? { rejectUnauthorized: false } : undefined,
    });
  }
  return globalThis.__actPool;
}

function needsSsl() {
  const url = process.env.DATABASE_URL || "";
  if (/sslmode=require/.test(url)) return true;
  // Most hosted Postgres (Neon, Supabase, etc.) require SSL; local does not.
  return !/localhost|127\.0\.0\.1/.test(url);
}

export async function q(text, params) {
  const pool = getPool();
  return pool.query(text, params);
}

// The single private account always lives at id = 1.
export const USER_ID = 1;

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS app_user (
     id serial PRIMARY KEY,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS values_t (
     id serial PRIMARY KEY,
     user_id int NOT NULL,
     area text,
     value text NOT NULL,
     why text,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS actions (
     id serial PRIMARY KEY,
     user_id int NOT NULL,
     title text NOT NULL,
     ace text[] NOT NULL DEFAULT '{}',
     value_id int,
     value_label text,
     tiny_step text,
     when_text text,
     reminder_at timestamptz,
     done boolean NOT NULL DEFAULT false,
     done_at timestamptz,
     week_key text,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS exercises (
     id serial PRIMARY KEY,
     user_id int NOT NULL,
     name text NOT NULL,
     type text,
     steps text[] NOT NULL DEFAULT '{}',
     when_to_use text,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS basics (
     id serial PRIMARY KEY,
     user_id int NOT NULL,
     date date NOT NULL,
     moved boolean NOT NULL DEFAULT false,
     ate boolean NOT NULL DEFAULT false,
     slept boolean NOT NULL DEFAULT false,
     phone_free boolean NOT NULL DEFAULT false,
     connected boolean NOT NULL DEFAULT false,
     UNIQUE (user_id, date)
   )`,
  `CREATE TABLE IF NOT EXISTS checkins (
     id serial PRIMARY KEY,
     user_id int NOT NULL,
     date date NOT NULL DEFAULT current_date,
     mood int,
     values_living int,
     note text,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS conversations (
     id serial PRIMARY KEY,
     user_id int NOT NULL,
     mode text,
     messages jsonb NOT NULL DEFAULT '[]',
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS memory (
     user_id int PRIMARY KEY,
     summary text NOT NULL DEFAULT '',
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS settings (
     user_id int PRIMARY KEY,
     notif_enabled boolean NOT NULL DEFAULT false,
     checkin_enabled boolean NOT NULL DEFAULT false,
     checkin_hour int NOT NULL DEFAULT 19,
     speak_replies boolean NOT NULL DEFAULT false,
     voice text NOT NULL DEFAULT 'alloy',
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
     id serial PRIMARY KEY,
     user_id int NOT NULL,
     endpoint text UNIQUE NOT NULL,
     p256dh text NOT NULL,
     auth text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS nudge_log (
     id serial PRIMARY KEY,
     user_id int NOT NULL,
     kind text NOT NULL,
     ref text,
     sent_at timestamptz NOT NULL DEFAULT now()
   )`,
];

const SEEDS = [
  `INSERT INTO app_user (id) VALUES (${USER_ID}) ON CONFLICT (id) DO NOTHING`,
  `INSERT INTO memory (user_id) VALUES (${USER_ID}) ON CONFLICT (user_id) DO NOTHING`,
  `INSERT INTO settings (user_id) VALUES (${USER_ID}) ON CONFLICT (user_id) DO NOTHING`,
];

export async function ensureSchema() {
  for (const s of STATEMENTS) await q(s);
  for (const s of SEEDS) await q(s);
}

// Memoized per process so endpoints can safely await it on every request.
let readyPromise;
export function ready() {
  if (!readyPromise) {
    readyPromise = ensureSchema().catch((e) => {
      readyPromise = undefined; // allow retry on next request
      throw e;
    });
  }
  return readyPromise;
}
