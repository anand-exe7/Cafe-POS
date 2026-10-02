"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { StockMoveType } from "@/lib/types";
import { inRange, rangeOf, stockStats, type Period } from "@/lib/analytics";
import { useAdmin } from "./Store";
import { Badge, Card, Empty, Kpi, Page, PageHead, Pills, SearchBox, cx, fmtDateTime, type BadgeTone } from "./kit";

const TYPE: Record<StockMoveType, [string, BadgeTone]> = {
  initial: ["Opening", "slate"],
  added: ["Stock added", "green"],
  sale: ["Sold / used", "red"],
  cancelled_order: ["Order cancelled", "sky"],
  void_bill: ["Bill voided", "sky"],
  adjustment: ["Adjustment", "amber"],
};
const th = "px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500 whitespace-nowrap";
const td = "px-4 py-3 text-[13px]";
const LIMIT = 100;

export default function StockMovementsPage() {
  const { s } = useAdmin();
  const [period, setPeriod] = useState<Period>("week");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState<"all" | StockMoveType>("all");
  const [pid, setPid] = useState("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(LIMIT);

  const range = useMemo(() => rangeOf(period, from, to), [period, from, to]);
  const st = useMemo(() => stockStats(s.stockMovements, range), [s.stockMovements, range]);
  const needle = q.trim().toLowerCase();
  const rows = s.stockMovements.filter(
    (m) => inRange(m.createdAt, range) && (type === "all" || m.type === type) && (pid === "all" || m.productId === pid) && (!needle || `${m.productName} ${m.note} ${m.ref}`.toLowerCase().includes(needle)),
  );

  /* per product, over the selected period: in, out and where it ended up */
  const perProduct = useMemo(() => {
    const m = new Map<string, { id: string; name: string; in: number; out: number; close: number | null }>();
    for (const x of [...s.stockMovements].reverse()) {
      if (!inRange(x.createdAt, range)) continue;
      const cur = m.get(x.productId) ?? { id: x.productId, name: x.productName, in: 0, out: 0, close: null };
      if (x.qty > 0) cur.in += x.qty;
      else cur.out += -x.qty;
      cur.close = x.balanceAfter;
      m.set(x.productId, cur);
    }
    return [...m.values()].sort((a, b) => b.out + b.in - (a.out + a.in));
  }, [s.stockMovements, range]);

  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of s.stockMovements) m.set(x.productId, x.productName);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [s.stockMovements]);

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
          onChange={(p) => {
            setPeriod(p);
            setLimit(LIMIT);
          }}
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
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-10 rounded-xl border border-slate-200 px-2" aria-label="From" />
              –
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-10 rounded-xl border border-slate-200 px-2" aria-label="To" />
            </span>
          )}
          <select className="h-10 rounded-full border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 outline-none" value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="Type">
            <option value="all">All movements</option>
            {Object.entries(TYPE).map(([k, [t]]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </select>
          <select className="h-10 max-w-[200px] rounded-full border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 outline-none" value={pid} onChange={(e) => setPid(e.target.value)} aria-label="Product">
            <option value="all">All products</option>
            {names.map(([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
          </select>
          <SearchBox value={q} onChange={setQ} placeholder="Search product, note, invoice…" className="w-full sm:w-64" />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi label="Stock added" value={`+${st.added}`} hint="Restocks and opening stock" icon="plus" tone="emerald" />
        <Kpi label="Used / sold" value={st.sold} hint="Orders and bills" icon="bag" tone="rose" />
        <Kpi label="Returned" value={`+${st.returned}`} hint="Cancelled orders, voided bills" icon="refresh" tone="sky" />
        <Kpi label="Adjustments" value={`${st.adjusted > 0 ? "+" : ""}${st.adjusted}`} hint="Manual corrections" icon="sliders" tone="amber" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card title="Timeline">
          {!rows.length ? (
            <Empty icon="box" title={s.stockMovements.length ? "No movements match" : "No stock movements yet"}>
              {s.stockMovements.length ? null : "Add stock, take an order or adjust a count in Inventory and it shows up here."}
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
                    {rows.slice(0, limit).map((m) => (
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
              {rows.length > limit && (
                <button type="button" onClick={() => setLimit((n) => n + LIMIT)} className="mt-4 h-10 w-full rounded-xl bg-slate-100 text-[13px] font-semibold text-slate-700 hover:bg-slate-200">
                  Show more ({rows.length - limit} left)
                </button>
              )}
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
