import { cookies } from "next/headers";
import { COOKIE, checkPassword, hashPassword, makeToken, needsSetup } from "@/lib/auth";
import { body, handle, isHttps } from "@/lib/http";
import { ApiError, mutate, read } from "@/lib/store";
import { randomBytes } from "crypto";

/* POST {password}            → sign in (or, on first run, set the password)
   POST {password, next}      → change password (signed in; signs out other devices)
   DELETE                     → sign out */

const failures = new Map<string, { n: number; until: number }>();

export async function POST(req: Request) {
  return handle(async () => {
    const b = await body(req);
    const pw = typeof b.password === "string" ? b.password : "";
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
    const f = failures.get(ip);
    if (f && f.until > Date.now()) throw new ApiError("Too many attempts. Wait a minute and try again.", 429);

    let db = await read();
    if (needsSetup(db)) {
      if (pw.length < 6) throw new ApiError("Choose a password of at least 6 characters.");
      db = await mutate((d) => {
        d.settings.adminHash = hashPassword(pw);
        return d;
      });
    } else if (!checkPassword(db, pw)) {
      const n = (f?.n ?? 0) + 1;
      failures.set(ip, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
      throw new ApiError("That password isn't right.", 401);
    } else if (typeof b.next === "string") {
      if (process.env.ADMIN_PASSWORD) throw new ApiError("The password is set by the server's ADMIN_PASSWORD and can't be changed here.");
      if (b.next.length < 6) throw new ApiError("New password needs at least 6 characters.");
      const next = b.next;
      db = await mutate((d) => {
        d.settings.adminHash = hashPassword(next);
        d.settings.secret = randomBytes(32).toString("hex");
        return d;
      });
    }
    failures.delete(ip);

    const tok = makeToken(db);
    (await cookies()).set(COOKIE, tok.value, { httpOnly: true, sameSite: "lax", secure: isHttps(req), path: "/", maxAge: tok.maxAge });
    return { ok: true };
  });
}

export async function DELETE() {
  (await cookies()).delete(COOKIE);
  return Response.json({ ok: true });
}
