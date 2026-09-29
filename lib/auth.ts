import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

/* Admin sign-in — one password for the owner.

   ADMIN_PASSWORD and AUTH_SECRET come from the environment (Vercel project
   settings in production, .env.local locally). The session cookie is an
   HMAC-signed expiry keyed by AUTH_SECRET, so it verifies on every serverless
   instance. In production both are required; in development they fall back to
   throwaway defaults so `npm run dev` works out of the box. */

export const COOKIE = "clc_admin";
const TTL = 1000 * 60 * 60 * 24 * 14; // two weeks

const prod = process.env.NODE_ENV === "production";
const need = (name: string, dev: string) => {
  const v = process.env[name];
  if (v) return v;
  if (prod && process.env.NEXT_PHASE !== "phase-production-build") throw new Error(`${name} must be set in production.`);
  return dev;
};

const ADMIN_PW = need("ADMIN_PASSWORD", "admin123");
const SECRET = need("AUTH_SECRET", "dev-only-secret");

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
