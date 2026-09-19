import { isAdmin } from "@/lib/auth";
import { body, handle } from "@/lib/http";
import { adminOp } from "@/lib/ops";
import { ApiError } from "@/lib/store";

/* POST {op, ...args} → {result} */
export async function POST(req: Request) {
  return handle(async () => {
    if (!(await isAdmin())) throw new ApiError("You've been signed out. Please sign in again.", 401);
    const { op, ...args } = await body(req);
    return { result: await adminOp(String(op), args) };
  });
}
