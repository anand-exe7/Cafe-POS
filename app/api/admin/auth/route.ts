import { cookies } from "next/headers";
import { COOKIE, checkPassword, makeToken } from "@/lib/auth";
import { body, handle, isHttps } from "@/lib/http";
import { db } from "@/lib/db";
import { loginAttempts } from "@/lib/db/schema";
import { ApiError } from "@/lib/store";
import { eq, sql } from "drizzle-orm";

/* POST {password}  → sign in with the admin password
   DELETE           → sign out */


export async function POST(req: Request) {
  return handle(async () => {
    const b = await body(req);
    const pw = typeof b.password === "string" ? b.password : "";
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
    const [f] = await db.select().from(loginAttempts).where(eq(loginAttempts.key, ip));
    if (f && f.lockedUntil > Date.now()) throw new ApiError("Too many attempts. Wait a minute and try again.", 429);

    if (!checkPassword(pw)) {
      const [row] = await db
        .insert(loginAttempts)
        .values({ key: ip, fails: 1, lockedUntil: 0 })
        .onConflictDoUpdate({ target: loginAttempts.key, set: { fails: sql`${loginAttempts.fails} + 1` } })
        .returning();
      if (row.fails >= 5) await db.update(loginAttempts).set({ fails: 0, lockedUntil: Date.now() + 60_000 }).where(eq(loginAttempts.key, ip));
      throw new ApiError("That password isn't right.", 401);
    }
    if (f) await db.delete(loginAttempts).where(eq(loginAttempts.key, ip));

    const tok = makeToken();
    (await cookies()).set(COOKIE, tok.value, { httpOnly: true, sameSite: "lax", secure: isHttps(req), path: "/", maxAge: tok.maxAge });
    return { ok: true };
  });
}

export async function DELETE() {
  (await cookies()).delete(COOKIE);
  return Response.json({ ok: true });
}
