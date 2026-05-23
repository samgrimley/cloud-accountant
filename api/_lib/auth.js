import crypto from "node:crypto";
import { parseCookies, sendJson, isLocalHost } from "./util.js";

const COOKIE = "act_session";
const MAX_AGE_DAYS = 60;

// --- passphrase hashing (scrypt) -----------------------------------------
export function hashPassphrase(passphrase) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(passphrase, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassphrase(passphrase) {
  const stored = process.env.APP_PASSPHRASE_HASH || "";
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(passphrase, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

// --- signed stateless session cookie -------------------------------------
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

export function signSession(uid) {
  const payload = b64url(JSON.stringify({ uid, iat: Date.now() }));
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySession(token) {
  if (!token || typeof token !== "string") return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const ageDays = (Date.now() - (data.iat || 0)) / 86400000;
    if (ageDays > MAX_AGE_DAYS) return null;
    return data;
  } catch {
    return null;
  }
}

export function setSessionCookie(req, res, uid) {
  const token = signSession(uid);
  const secure = isLocalHost(req) ? "" : " Secure;";
  const maxAge = MAX_AGE_DAYS * 86400;
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax;${secure} Max-Age=${maxAge}`
  );
}

export function clearSessionCookie(req, res) {
  const secure = isLocalHost(req) ? "" : " Secure;";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax;${secure} Max-Age=0`
  );
}

export function getUserId(req) {
  const token = parseCookies(req)[COOKIE];
  const data = verifySession(token);
  return data?.uid ?? null;
}

// Returns uid, or sends 401 and returns null.
export function requireAuth(req, res) {
  const uid = getUserId(req);
  if (!uid) {
    sendJson(res, 401, { error: "Not signed in" });
    return null;
  }
  return uid;
}
