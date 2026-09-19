import { isAdmin } from "@/lib/auth";
import { handle } from "@/lib/http";
import { adminState } from "@/lib/ops";
import { ApiError, read } from "@/lib/store";

/* GET ?since=<version> → {same:true} when nothing changed, else the full state. */
export async function GET(req: Request) {
  return handle(async () => {
    if (!(await isAdmin())) throw new ApiError("Signed out.", 401);
    const since = Number(new URL(req.url).searchParams.get("since"));
    if (since && (await read()).version === since) return { same: true };
    return adminState();
  });
}
