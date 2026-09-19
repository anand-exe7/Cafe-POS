import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Landing from "../../_components/Landing";
import { tableView } from "@/lib/ops";
import { ApiError } from "@/lib/store";
import "../table.css";

/* A guest scanned a table QR: show the landing page, with every "order" button
   leading to this table's menu. */

export const dynamic = "force-dynamic";

async function load(code: string) {
  try {
    return await tableView(code);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: PageProps<"/t/[code]">): Promise<Metadata> {
  const v = await load((await params).code);
  return { title: `Table ${v.table.label} | ${v.shopName}`, robots: { index: false } };
}

export default async function TablePage({ params }: PageProps<"/t/[code]">) {
  const v = await load((await params).code);
  return <Landing table={{ label: v.table.label, code: v.table.code }} />;
}
