import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DATA_DIR } from "./paths";

// Password hashing: scrypt (Node built-in, no external dep).
export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const orig = Buffer.from(hash, "hex");
  const test = scryptSync(pw, salt, 64);
  return orig.length === test.length && timingSafeEqual(orig, test);
}

// Session secret: from KATK_SECRET, else generated once and persisted.
function secret(): string {
  if (process.env.KATK_SECRET) return process.env.KATK_SECRET;
  mkdirSync(DATA_DIR, { recursive: true });
  const p = `${DATA_DIR}/.session-secret`;
  if (existsSync(p)) return readFileSync(p, "utf8").trim();
  const s = randomBytes(32).toString("hex");
  writeFileSync(p, s, "utf8");
  return s;
}

const TTL_MS = 30 * 24 * 3600 * 1000; // 30 days

// Stateless HMAC-signed session token: "<userId>.<exp>.<mac>".
export function signSession(userId: string): string {
  const body = `${userId}.${Date.now() + TTL_MS}`;
  const mac = createHmac("sha256", secret()).update(body).digest("hex");
  return `${body}.${mac}`;
}

export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, mac] = parts;
  const expected = createHmac("sha256", secret())
    .update(`${userId}.${exp}`)
    .digest("hex");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  return userId;
}

export const SESSION_COOKIE = "katk_session";

// --- symmetric encryption for stored secrets (per-user API keys) ---
// AES-256-GCM with a server-held key (KATK_ENCRYPTION_KEY, else derived from the
// session secret). Protects keys at rest (DB/backups); the master key lives in
// env/secret file, never in the database. Changing it orphans stored keys.
function encKey(): Buffer {
  const material = process.env.KATK_ENCRYPTION_KEY || secret();
  return scryptSync(material, "katk-encryption-v1", 32);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
}

export function decryptSecret(blob: string): string | null {
  try {
    const [ivh, tagh, cth] = blob.split(":");
    if (!ivh || !tagh || !cth) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encKey(),
      Buffer.from(ivh, "hex"),
    );
    decipher.setAuthTag(Buffer.from(tagh, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(cth, "hex")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
