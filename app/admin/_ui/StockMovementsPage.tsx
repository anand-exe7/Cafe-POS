"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { StockMoveType } from "@/lib/types";
import { rangeOf, type Period } from "@/lib/analytics";
import { useLedger } from "./ledger";
import { Badge, Card, Empty, Kpi, Page, PageHead, Pills, SearchBox, cx, fmtDateTime, type BadgeTone } from "./kit";

const TYPE: Record<StockMoveType, [string, BadgeTone]> = {
  initial: ["Opening", "slate"],
  added: ["Stock added", "green"],
  removed: ["Stock removed", "orange"],
  sale: ["Sold / used", "red"],
  cancelled_order: ["Order cancelled", "sky"],
  void_bill: ["Bill voided", "sky"],
  adjustment: ["Adjustment", "amber"],
};
const th = "px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500 whitespace-nowrap";
const td = "px-4 py-3 text-[13px]";
const SIZE = 20;

export default function StockMovementsPage() {
  const [period, setPeriod] = useState<Period>("week");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState<"all" | StockMoveType>("all");
  const [pid, setPid] = useState("all");
  const [q, setQ] = useState("");
  const [needle, setNeedle] = useState("");
  const [page, setPage] = useState(1);

  /* search waits for a pause in typing, then goes back to page 1 */
  useEffect(() => {
    const t = setTimeout(() => setNeedle(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const range = useMemo(() => rangeOf(period, from, to), [period, from, to]);
  const { data, loading } = useLedger({ from: range?.from, to: range?.to, type, pid, q: needle, page, size: SIZE });
  const rows = data?.rows ?? [];
  const st = data?.stats ?? { added: 0, sold: 0, removed: 0, returned: 0, adjusted: 0, net: 0 };
  const perProduct = data?.perProduct ?? [];
  const names = data?.products ?? [];
  const goto = (p: number) => setPage(Math.max(1, Math.min(data?.pages ?? 1, p)));
  /* any filter change starts again from the first page */
  const filter = <T,>(set: (v: T) => void) => (v: T) => (set(v), setPage(1));

  return (
    <Page>
      <PageHead
        title="Stock movement"
        sub="Every addition, sale, return and correction to tracked stock. History starts from when this feature went live."
        right={
          <Link href="/admin/inventory" className="inline-flex h-10 items-center rounded-xl bg-slate-100 px-4 text-[13px] font-semibold text-slate-700 hover:bg-slate-200">
            ← Inventory
          </Link>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Pills
          value={period}
          onChange={filter(setPeriod)}
          options={[
            { v: "today", t: "Today" },
            { v: "week", t: "Week" },
            { v: "month", t: "Month" },
            { v: "year", t: "Year" },
            { v: "custom", t: "Custom" },
            { v: "all", t: "All" },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          {period === "custom" && (
            <span className="flex items-center gap-2 text-[12px] font-semibold text-slate-500">
              <input type="date" value={from} max={to || undefined} onChange={(e) => filter(setFrom)(e.target.value)} className="h-10 rounded-xl border border-slate-200 px-2" aria-label="From" />
              –
              <input type="date" value={to} min={from || undefined} onChange={(e) => filter(setTo)(e.target.value)} className="h-10 rounded-xl border border-slate-200 px-2" aria-label="To" />
            </span>
          )}
          <select className="h-10 rounded-full border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 outline-none" value={type} onChange={(e) => filter(setType)(e.target.value as typeof type)} aria-label="Type">
            <option value="all">All movements</option>
            {Object.entries(TYPE).map(([k, [t]]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </select>
          <select className="h-10 max-w-[200px] rounded-full border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 outline-none" value={pid} onChange={(e) => filter(setPid)(e.target.value)} aria-label="Product">
            <option value="all">All products</option>
            {names.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
          <SearchBox value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Search product, note, invoice…" className="w-full sm:w-64" />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <Kpi label="Stock added" value={`+${st.added}`} hint="Restocks and opening stock" icon="plus" tone="emerald" />
        <Kpi label="Used / sold" value={st.sold} hint="Orders and bills" icon="bag" tone="rose" />
        <Kpi label="Removed" value={st.removed} hint="Wastage, damage, own use" icon="minus" tone="amber" />
        <Kpi label="Returned" value={`+${st.returned}`} hint="Cancelled orders, voided bills" icon="refresh" tone="sky" />
        <Kpi label="Adjustments" value={`${st.adjusted > 0 ? "+" : ""}${st.adjusted}`} hint="Manual corrections" icon="sliders" tone="amber" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card title="Timeline">
          {!rows.length ? (
            <Empty icon="box" title={loading ? "Loading…" : needle || type !== "all" || pid !== "all" || period !== "all" ? "No movements match" : "No stock movements yet"}>
              {loading ? null : "Add stock, take an order or adjust a count in Inventory and it shows up here."}
            </Empty>
          ) : (
            <>
              <div className="overflow-x-auto adm-scroll">
                <table className="w-full min-w-[680px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={th}>When</th>
                      <th className={th}>Product</th>
                      <th className={th}>Type</th>
                      <th className={cx(th, "text-right")}>Change</th>
                      <th className={cx(th, "text-right")}>Balance</th>
                      <th className={th}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((m) => (
                      <tr key={m.id} className="border-b border-slate-100 last:border-0">
                        <td className={cx(td, "whitespace-nowrap text-slate-600")}>{fmtDateTime(m.createdAt)}</td>
                        <td className={cx(td, "font-semibold text-slate-900")}>{m.productName}</td>
                        <td className={td}>
                          <Badge tone={TYPE[m.type][1]}>{TYPE[m.type][0]}</Badge>
                        </td>
                        <td className={cx(td, "text-right font-extrabold", m.qty > 0 ? "text-emerald-600" : "text-red-600")}>
                          {m.qty > 0 ? "+" : ""}
                          {m.qty}
                        </td>
                        <td className={cx(td, "text-right font-semibold text-slate-700")}>{m.balanceAfter}</td>
                        <td className={cx(td, "text-slate-500")}>
                          {m.note}
                          {m.ref && <span className="block text-[11.5px] text-slate-400">{m.ref}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px] text-slate-500">
                <span>
                  {(data!.page - 1) * SIZE + 1}–{(data!.page - 1) * SIZE + rows.length} of {data!.total}
                </span>
                <span className="flex items-center gap-2">
                  <button type="button" disabled={data!.page <= 1} onClick={() => goto(data!.page - 1)} className="h-9 rounded-xl bg-slate-100 px-4 font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-40">
                    ← Prev
                  </button>
                  <span className="min-w-[88px] text-center font-semibold text-slate-700">
                    Page {data!.page} of {data!.pages}
                  </span>
                  <button type="button" disabled={data!.page >= data!.pages} onClick={() => goto(data!.page + 1)} className="h-9 rounded-xl bg-slate-100 px-4 font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-40">
                    Next →
                  </button>
                </span>
              </div>
            </>
          )}
        </Card>

        <Card title="By product">
          {perProduct.length ? (
            <ul className="space-y-3 text-[13px]">
              {perProduct.slice(0, 15).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <button type="button" className="min-w-0 truncate text-left font-semibold text-slate-800 hover:text-red-600" onClick={() => setPid(p.id)}>
                    {p.name}
                  </button>
                  <span className="shrink-0 text-[12px] text-slate-500">
                    <b className="text-emerald-600">+{p.in}</b> / <b className="text-red-600">−{p.out}</b> → <b className="text-slate-900">{p.close}</b>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-slate-400">No movement in this period.</p>
          )}
        </Card>
      </div>
    </Page>
  );
}
