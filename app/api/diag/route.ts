import { read } from "@/lib/store";

/* TEMPORARY diagnostic — surfaces the real runtime error behind the 500 so it
   can be read from the deployed URL (Vercel dashboard logs aren't reachable
   here). Delete this route once the deployment is healthy. */
export const dynamic = "force-dynamic";

export async function GET() {
  const out: Record<string, unknown> = {
    cwd: process.cwd(),
    dataDir: process.env.DATA_DIR ?? null,
    vercel: process.env.VERCEL ?? null,
    region: process.env.VERCEL_REGION ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  };
  try {
    const db = await read();
    out.ok = true;
    out.products = db.products.length;
    out.tables = db.tables.length;
    out.shopName = db.settings.shopName;
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stack?: string };
    out.ok = false;
    out.errorName = err?.name ?? null;
    out.errorCode = err?.code ?? null;
    out.errorMessage = err?.message ?? String(e);
    out.stack = err?.stack?.split("\n").slice(0, 8) ?? null;
  }
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}
