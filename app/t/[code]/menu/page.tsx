import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TableMenu from "./TableMenu";
import { tableView } from "@/lib/ops";
import { ApiError } from "@/lib/store";
import "../../table.css";

export const dynamic = "force-dynamic";

async function load(code: string) {
  try {
    return await tableView(code);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: PageProps<"/t/[code]/menu">): Promise<Metadata> {
  const v = await load((await params).code);
  return { title: `Menu · Table ${v.table.label} | ${v.shopName}`, robots: { index: false } };
}

export default async function MenuPage({ params }: PageProps<"/t/[code]/menu">) {
  const v = await load((await params).code);
  return <TableMenu initial={v} />;
}
