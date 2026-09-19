import type { NextRequest } from "next/server";
import { body, handle } from "@/lib/http";
import { placeOrder, requestBill, tableView } from "@/lib/ops";
import { ApiError } from "@/lib/store";

/* Customer endpoints, addressed by the table's QR code. */

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/table/[code]">) {
  const { code } = await ctx.params;
  return handle(() => tableView(code));
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/table/[code]">) {
  const { code } = await ctx.params;
  return handle(async () => {
    const b = await body(req);
    if (b.action === "order") return placeOrder(code, b);
    if (b.action === "bill") return requestBill(code);
    throw new ApiError("Unknown action.");
  });
}
