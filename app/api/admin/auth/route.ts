import { cookies } from "next/headers";
import { COOKIE, checkPassword, makeToken } from "@/lib/auth";
import { body, handle, isHttps } from "@/lib/http";
import { ApiError } from "@/lib/store";

/* POST {password}  → sign in with the admin password
   DELETE           → sign out */

const failures = new Map<string, { n: number; until: number }>();

export async function POST(req: Request) {
  return handle(async () => {
    const b = await body(req);
    const pw = typeof b.password === "string" ? b.password : "";
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
    const f = failures.get(ip);
    if (f && f.until > Date.now()) throw new ApiError("Too many attempts. Wait a minute and try again.", 429);

    if (!checkPassword(pw)) {
      const n = (f?.n ?? 0) + 1;
      failures.set(ip, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
      throw new ApiError("That password isn't right.", 401);
    }
    failures.delete(ip);

    const tok = makeToken();
    (await cookies()).set(COOKIE, tok.value, { httpOnly: true, sameSite: "lax", secure: isHttps(req), path: "/", maxAge: tok.maxAge });
    return { ok: true };
  });
}

export async function DELETE() {
  (await cookies()).delete(COOKIE);
  return Response.json({ ok: true });
}
