import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

/* Admin sign-in — one fixed password for everyone.

   The password is ADMIN_PASSWORD from the environment, or "admin123" by default.
   The session cookie is an HMAC-signed expiry, and the signing secret is derived
   from that password rather than stored per-instance. On the read-only Vercel
   demo the DB lives in memory and every serverless instance is independent, so a
   per-instance random secret used to mean a cookie set on one instance failed to
   verify on the next — that's why phones kept getting bounced back to the login
   screen. A password-derived secret is identical on every instance, so signing in
   sticks. */

export const COOKIE = "clc_admin";
const TTL = 1000 * 60 * 60 * 24 * 14; // two weeks

export const ADMIN_PW = process.env.ADMIN_PASSWORD || "admin123";
const SECRET = createHmac("sha256", "clc-admin-session").update(ADMIN_PW).digest("hex");

/* Kept for the Users page, which still stores a per-staff password hash. */
export function hashPassword(pw: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 32).toString("hex")}`;
}

function eq(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkPassword(pw: string) {
  return eq(pw, ADMIN_PW);
}

const sign = (exp: number) => createHmac("sha256", SECRET).update(String(exp)).digest("base64url");

export function makeToken() {
  const exp = Date.now() + TTL;
  return { value: `${exp}.${sign(exp)}`, maxAge: TTL / 1000 };
}

export function verifyToken(token: string | undefined) {
  if (!token) return false;
  const [e, sig] = token.split(".");
  const exp = Number(e);
  if (!exp || exp < Date.now() || !sig) return false;
  return eq(sig, sign(exp));
}

export async function isAdmin() {
  const jar = await cookies();
  return verifyToken(jar.get(COOKIE)?.value);
}
