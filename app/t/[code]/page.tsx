import { notFound, redirect } from "next/navigation";
import { tableView } from "@/lib/ops";
import { ApiError } from "@/lib/store";

/* A guest scanned a table QR. The printed cards point here, so this route stays
   and simply opens that table's menu — the magazine landing page that used to
   greet them is parked in `landing/` and no longer served. An unknown code
   still gets the "table isn't active" page rather than a redirect loop. */

export const dynamic = "force-dynamic";

export default async function TablePage({ params }: PageProps<"/t/[code]">) {
  const { code } = await params;
  try {
    await tableView(code);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  redirect(`/t/${encodeURIComponent(code)}/menu`);
}
