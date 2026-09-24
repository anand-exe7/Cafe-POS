import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { read } from "./store";
import type { DB } from "./types";

/* Admin sign-in.
   The password is either ADMIN_PASSWORD from the environment or the one set on
   first visit to /admin (stored as a scrypt hash). The session cookie is an
   HMAC-signed expiry, so changing the password (which rotates the secret)
   signs every device out. */

export const COOKIE = "clc_admin";
const TTL = 1000 * 60 * 60 * 24 * 14; // two weeks

export function hashPassword(pw: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 32).toString("hex")}`;
}

function eq(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function matches(hash: string | null | undefined, pw: string) {
  if (!hash) return false;
  const [salt, key] = hash.split(":");
  if (!salt || !key) return false;
  return eq(scryptSync(pw, salt, 32).toString("hex"), key);
}

/* The shop password still opens the panel exactly as it always has. Staff given
   admin access on the Users page get a password of their own that works the same
   way, so nobody has to share one and access can be taken back per person
   without changing everyone else's. The sign-in form stays a single box: we try
   the shop's password, then each staff hash. */
export function checkPassword(db: DB, pw: string) {
  const env = process.env.ADMIN_PASSWORD;
  if (env ? eq(pw, env) : matches(db.settings.adminHash, pw)) return true;
  return db.users.some((u) => matches(u.passwordHash, pw));
}

export const needsSetup = (db: DB) => !process.env.ADMIN_PASSWORD && !db.settings.adminHash && !db.users.length;

const sign = (secret: string, exp: number) => createHmac("sha256", secret).update(String(exp)).digest("base64url");

export function makeToken(db: DB) {
  const exp = Date.now() + TTL;
  return { value: `${exp}.${sign(db.settings.secret, exp)}`, maxAge: TTL / 1000 };
}

export function verifyToken(db: DB, token: string | undefined) {
  if (!token) return false;
  const [e, sig] = token.split(".");
  const exp = Number(e);
  if (!exp || exp < Date.now() || !sig) return false;
  return eq(sig, sign(db.settings.secret, exp));
}

export async function isAdmin() {
  const [db, jar] = await Promise.all([read(), cookies()]);
  return verifyToken(db, jar.get(COOKIE)?.value);
}
