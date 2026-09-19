"use client";

import { useMemo, useState } from "react";
import type { Bill } from "@/lib/types";
import { rupee } from "@/lib/money";
import { completedIn, isoWeek, itemStats, monthly, rangeOf, startOfWeek, summary, weekly, type Period } from "@/lib/analytics";
import { useAdmin } from "./Store";
import { Badge, Card, Empty, Kpi, Page, PageHead, Pills, SearchBox, Tabs, cx, fmtDate, fmtTime } from "./kit";

type Tab = "revenue" | "today" | "products" | "tables" | "coupons";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* ---------------- charts ---------------- */

/** Single-series column chart: thin red columns, value on hover/focus. */
function Columns({ data, height = 200, empty }: { data: { label: string; full: string; value: number }[]; height?: number; empty?: string }) {
  const max = Math.max(...data.map((d) => d.value), 0);
  return (
    <div>
      <div className="relative flex items-end gap-1 sm:gap-2" style={{ height }} role="img" aria-label={data.map((d) => `${d.full}: ${rupee(d.value)}`).join(", ")}>
        {!max && empty && <p className="absolute inset-0 grid place-items-center text-[13px] text-slate-400">{empty}</p>}
        {data.map((d, i) => {
          const pct = max ? (d.value / max) * 88 : 0;
          return (
            <div key={d.full} tabIndex={0} className="group relative flex h-full flex-1 items-end justify-center rounded-lg outline-none transition-colors hover:bg-slate-50 focus-visible:bg-slate-50">
              {d.value > 0 && (
                <div className="adm-bar w-3 rounded-t-[4px] bg-red-600 transition-colors group-hover:bg-red-700 sm:w-4" style={{ height: `${pct}%`, ["--i" as string]: i }} />
              )}
              <div
                className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-center text-[11px] leading-tight text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                style={{ bottom: `calc(${pct}% + 8px)` }}
              >
                <span className="block text-slate-300">{d.full}</span>
                <b className="text-[12.5px]">{rupee(d.value)}</b>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1 border-t border-slate-100 pt-3 sm:gap-2">
        {data.map((d) => (
          <span key={d.full} className="flex-1 text-center text-[10.5px] font-semibold uppercase text-slate-500">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function SourceSplit({ table, counter }: { table: number; counter: number }) {
  const max = Math.max(table, counter, 1);
  const rows = [
    { label: "Table (QR)", n: table, text: "text-red-600", bar: "bg-red-600" },
    { label: "Counter", n: counter, text: "text-emerald-600", bar: "bg-emerald-500" },
  ];
  return (
    <div className="space-y-5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-2 flex items-center justify-between">
            <span className={cx("text-[11px] font-bold uppercase tracking-[0.14em]", r.text)}>{r.label}</span>
            <b className="adm-num text-[15px] text-slate-900">{r.n}</b>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            {r.n > 0 && <div className={cx("adm-fill h-full rounded-full", r.bar)} style={{ width: `${(r.n / max) * 100}%` }} />}
          </div>
        </div>
      ))}
    </div>
  );
}

function TopItems({ bills, n = 5, empty = "No sales in this period." }: { bills: Bill[]; n?: number; empty?: string }) {
  const top = itemStats(bills).slice(0, n);
  const max = top[0]?.revenue || 1;
  if (!top.length) return <p className="py-8 text-center text-[13px] text-slate-500">{empty}</p>;
  return (
    <ol className="space-y-4">
      {top.map((t, i) => (
        <li key={t.key} className="grid grid-cols-[18px_1fr_auto] items-start gap-x-3">
          <span className="pt-0.5 text-[12px] font-semibold text-slate-400">{i + 1}</span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-slate-800">{t.name}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="adm-fill h-full rounded-full bg-red-600" style={{ width: `${(t.revenue / max) * 100}%` }} />
            </div>
          </div>
          <div className="text-right">
            <b className="adm-num block text-[13px] text-red-600">{rupee(t.revenue)}</b>
            <span className="text-[10.5px] text-slate-400">{t.qty} pcs</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

const th = "px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500";
const td = "px-4 py-3.5 text-[13px]";

/* ---------------- page ---------------- */

export default function AnalyticsPage() {
  const { s, floor, now } = useAdmin();
  const [period, setPeriod] = useState<Period>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tab, setTab] = useState<Tab>("revenue");
  const [q, setQ] = useState("");

  const range = useMemo(() => rangeOf(period, from, to), [period, from, to]);
  const inPeriod = useMemo(() => completedIn(s.bills, range), [s.bills, range]);
  const today = useMemo(() => completedIn(s.bills, rangeOf("today")), [s.bills, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const sum = summary(inPeriod);
  const tsum = summary(today);

  const year = new Date().getFullYear();
  const months = monthly(s.bills, year);
  const yearTotal = months.reduce((a, b) => a + b, 0);
  const activeMonths = new Date().getMonth() + 1;
  const wkStart = startOfWeek();
  const week = weekly(s.bills, wkStart);
  const wk = isoWeek();

  const needle = q.trim().toLowerCase();

  return (
    <Page>
      <PageHead
        title="Analytics"
        sub="Real-time store & table insights"
        right={
          <div className="flex flex-col items-end gap-2">
            <Pills
              label="Period:"
              value={period}
              onChange={setPeriod}
              options={[
                { v: "all", t: "All time" },
                { v: "today", t: "Today" },
                { v: "week", t: "This week" },
                { v: "month", t: "This month" },
                { v: "year", t: "This year" },
                { v: "custom", t: "Custom" },
              ]}
            />
            {period === "custom" && (
              <div className="adm-in flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-1.5 shadow-[0_2px_8px_-2px_rgba(15,23,42,.08)]">
                <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  From:
                  <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-8 rounded-lg px-1 text-[13px] font-semibold text-slate-800 outline-none" />
                </label>
                <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  To:
                  <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-8 rounded-lg px-1 text-[13px] font-semibold text-slate-800 outline-none" />
                </label>
              </div>
            )}
          </div>
        }
      />

      <Tabs
        value={tab}
        onChange={(t) => {
          setTab(t);
          setQ("");
        }}
        options={[
          { v: "revenue", t: "Revenue" },
          { v: "today", t: "Today's sales" },
          { v: "products", t: "Products" },
          { v: "tables", t: "Tables" },
          { v: "coupons", t: "Coupons" },
        ]}
      />

      {/* ============ REVENUE ============ */}
      {tab === "revenue" && (
        <div className="adm-in space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Total revenue" value={rupee(sum.revenue)} hint="Tables + counter combined" icon="rupee" tone="emerald" />
            <Kpi label="Completed bills" value={sum.count} hint="Table + counter bills" icon="billing" tone="amber" />
            <Kpi label="Table revenue" value={rupee(sum.tableRev)} hint="QR dine-in tabs" icon="utensils" tone="sky" />
            <Kpi label="Counter revenue" value={rupee(sum.counterRev)} hint="Walk-in counter sales" icon="bag" tone="violet" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi label="Table bills" value={sum.tableN} hint="Dine-in tabs settled" icon="tables" tone="rose" />
            <Kpi label="Counter bills" value={sum.counterN} hint="Walk-in bills" icon="bag" tone="sky" />
            <Kpi label="Total items sold" value={sum.items} hint="From completed bills" icon="box" tone="violet" />
            <Kpi label="Avg order value" value={rupee(Math.round(sum.aov))} hint="Per completed bill" icon="zap" tone="orange" />
            <Kpi label="Top product" value={sum.top} hint="Most sold item" icon="star" tone="amber" small />
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <div className="space-y-5 xl:col-span-2">
              <Card>
                <h2 className="text-[15px] font-bold text-slate-800">
                  Revenue Trend This Year <span className="text-red-600">{year}</span>
                </h2>
                <div className="mb-6 mt-2 flex flex-wrap items-center gap-3">
                  <b className="adm-num text-[26px] font-extrabold text-slate-900">{rupee(yearTotal)}</b>
                  <span className="rounded-md bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-800">Avg {rupee(Math.round(yearTotal / activeMonths))}/mo</span>
                </div>
                <Columns data={months.map((v, i) => ({ label: MONTHS[i], full: `${MONTHS[i]} ${year}`, value: v }))} empty="No revenue yet this year" />
              </Card>
              <Card>
                <h2 className="text-[15px] font-bold text-slate-800">
                  Revenue This Week{" "}
                  <span className="text-red-600">
                    (Week {wk.week} of {wk.year})
                  </span>
                </h2>
                <p className="mb-6 mt-1 text-[12px] text-slate-500">{rupee(week.reduce((a, b) => a + b, 0))} total</p>
                <Columns
                  height={180}
                  data={week.map((v, i) => {
                    const d = new Date(wkStart + i * 86400000 + 3600000);
                    return { label: DAYS[i], full: `${DAYS[i]} ${d.getDate()}/${d.getMonth() + 1}`, value: v };
                  })}
                  empty="No revenue yet this week"
                />
              </Card>
            </div>
            <div className="space-y-5">
              <Card title="Order Source">
                <SourceSplit table={sum.tableN} counter={sum.counterN} />
              </Card>
              <Card title="Top Items by Revenue">
                <TopItems bills={inPeriod} />
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ============ TODAY ============ */}
      {tab === "today" && (
        <div className="adm-in space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Today's revenue" value={rupee(tsum.revenue)} hint="Completed today" icon="rupee" tone="emerald" />
            <Kpi label="Today's bills" value={tsum.count} hint="Completed today" icon="billing" tone="sky" />
            <Kpi
              label="Today's items sold"
              value={
                <>
                  {tsum.items} <span className="text-[14px] font-bold">pcs</span>
                </>
              }
              hint="Quantity sold today"
              icon="box"
              tone="violet"
            />
            <Kpi label="Today's avg order value" value={rupee(Math.round(tsum.aov))} hint="Per invoice today" icon="zap" tone="orange" />
          </div>
          <div className="grid gap-5 xl:grid-cols-3">
            <Card
              className="xl:col-span-2"
              title={<span className="text-[14px] uppercase tracking-[0.14em] text-slate-900">Today&apos;s transactions</span>}
              right={<SearchBox value={q} onChange={setQ} placeholder="Search contact no…" className="w-full sm:w-64" />}
            >
              <div className="overflow-x-auto rounded-xl adm-scroll">
                <table className="w-full min-w-[560px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={th}>Invoice ID</th>
                      <th className={th}>Customer no</th>
                      <th className={th}>Source</th>
                      <th className={th}>Items</th>
                      <th className={cx(th, "text-right")}>Grand total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {today
                      .filter((b) => !needle || `${b.customerPhone} ${b.invoiceNo} ${b.customerName}`.toLowerCase().includes(needle))
                      .slice()
                      .reverse()
                      .map((b) => (
                        <tr key={b.id} className="border-b border-slate-100 last:border-0">
                          <td className={cx(td, "font-semibold text-slate-900")}>
                            {b.invoiceNo}
                            <span className="block text-[11px] font-normal text-slate-400">{fmtTime(b.createdAt)}</span>
                          </td>
                          <td className={cx(td, "text-slate-700")}>{b.customerPhone || "—"}</td>
                          <td className={td}>{b.source === "table" ? <Badge tone="red">Table {b.tableLabel}</Badge> : <Badge tone="green">Counter</Badge>}</td>
                          <td className={cx(td, "text-slate-700")}>{b.itemCount}</td>
                          <td className={cx(td, "text-right font-bold text-slate-900")}>{rupee(b.total)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!today.length && <p className="py-14 text-center text-[14px] italic text-slate-400">No transactions found for today.</p>}
              </div>
            </Card>
            <div className="space-y-5">
              <Card title={<span className="text-[14px] uppercase tracking-[0.14em] text-slate-900">Live right now</span>}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500">Open tabs</p>
                    <p className="adm-num mt-1 text-[22px] font-extrabold">{floor.filter((f) => f.session).length}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500">Unbilled</p>
                    <p className="adm-num mt-1 text-[22px] font-extrabold">{rupee(floor.reduce((a, f) => a + f.total, 0))}</p>
                  </div>
                </div>
              </Card>
              <Card title={<span className="text-[14px] uppercase tracking-[0.14em] text-slate-900">Today&apos;s channel split</span>}>
                {today.length ? <SourceSplit table={tsum.tableN} counter={tsum.counterN} /> : <p className="py-8 text-center text-[14px] text-slate-600">No sales today.</p>}
              </Card>
              <Card title={<span className="text-[14px] uppercase tracking-[0.14em] text-slate-900">Today&apos;s top items</span>}>
                <TopItems bills={today} empty="No items sold today." />
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ============ PRODUCTS ============ */}
      {tab === "products" && <ProductsTab bills={inPeriod} q={q} setQ={setQ} />}

      {/* ============ TABLES ============ */}
      {tab === "tables" && <TablesTab bills={inPeriod} />}

      {/* ============ COUPONS ============ */}
      {tab === "coupons" && (
        <div className="adm-in grid gap-5 xl:grid-cols-[minmax(300px,380px)_1fr]">
          <Card title="Discount Summary">
            <div className="space-y-4">
              {[
                { l: "Total discounts given", v: rupee(sum.discount), c: "text-red-600", i: "%" },
                { l: "Discounted orders", v: String(sum.discounted), c: "text-slate-900", i: "▦" },
                { l: "Avg discount per order", v: rupee(sum.discounted ? Math.round(sum.discount / sum.discounted) : 0), c: "text-slate-900", i: "₹" },
              ].map((x) => (
                <div key={x.l} className="rounded-2xl border border-stone-100 bg-[#f8f7f3] p-5">
                  <div className="flex items-start justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">{x.l}</span>
                    <span className="text-[15px] font-bold text-red-500">{x.i}</span>
                  </div>
                  <p className={cx("adm-num mt-3 text-[26px] font-extrabold", x.c)}>{x.v}</p>
                </div>
              ))}
              <div className="pt-1">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">By coupon</p>
                {(() => {
                  const m = new Map<string, { n: number; d: number }>();
                  for (const b of inPeriod) if (b.couponCode) m.set(b.couponCode, { n: (m.get(b.couponCode)?.n ?? 0) + 1, d: (m.get(b.couponCode)?.d ?? 0) + b.couponDiscount });
                  const rows = [...m.entries()].sort((a, b) => b[1].d - a[1].d);
                  return rows.length ? (
                    <ul className="space-y-2 text-[13px]">
                      {rows.map(([c, v]) => (
                        <li key={c} className="flex justify-between">
                          <b className="text-slate-800">{c}</b>
                          <span className="text-slate-500">
                            {v.n}× · <span className="font-semibold text-red-600">-{rupee(v.d)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] text-slate-400">No coupons redeemed in this period.</p>
                  );
                })()}
              </div>
            </div>
          </Card>
          <Card title="Promo Campaign Performance" right={<SearchBox value={q} onChange={setQ} placeholder="Search code/mobile/amount…" className="w-full sm:w-64" />}>
            <div className="overflow-x-auto adm-scroll">
              <table className="w-full min-w-[620px]">
                <thead className="bg-[#f8f7f3]">
                  <tr>
                    <th className={th}>Transaction ID</th>
                    <th className={th}>Customer mobile</th>
                    <th className={th}>Coupon</th>
                    <th className={cx(th, "text-right")}>Order total</th>
                    <th className={cx(th, "text-right")}>Discount applied</th>
                  </tr>
                </thead>
                <tbody>
                  {inPeriod
                    .filter((b) => b.discount > 0)
                    .filter((b) => !needle || `${b.invoiceNo} ${b.customerPhone} ${b.couponCode ?? ""} ${b.subtotal} ${b.discount}`.toLowerCase().includes(needle))
                    .slice()
                    .reverse()
                    .map((b) => (
                      <tr key={b.id} className="border-b border-slate-100 last:border-0">
                        <td className={cx(td, "font-semibold text-slate-900")}>{b.invoiceNo}</td>
                        <td className={cx(td, "font-medium text-slate-700")}>{b.customerPhone || "—"}</td>
                        <td className={td}>{b.couponCode ? <Badge tone="violet">{b.couponCode}</Badge> : <span className="text-[12px] text-slate-400">Manual</span>}</td>
                        <td className={cx(td, "text-right font-semibold text-slate-800")}>{rupee(b.subtotal)}</td>
                        <td className={cx(td, "text-right font-semibold text-red-600")}>-{rupee(b.discount)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {!inPeriod.some((b) => b.discount > 0) && <Empty icon="coupon" title="No discounted bills in this period" />}
            </div>
          </Card>
        </div>
      )}
    </Page>
  );
}

function ProductsTab({ bills, q, setQ }: { bills: Bill[]; q: string; setQ: (v: string) => void }) {
  const { s } = useAdmin();
  const stats = itemStats(bills);
  const total = stats.reduce((a, x) => a + x.revenue, 0) || 1;
  const rows = [
    ...stats,
    ...s.products.filter((p) => !stats.some((x) => x.productId === p.id)).map((p) => ({ key: p.id, productId: p.id, name: p.name, qty: 0, revenue: 0 })),
  ];
  const needle = q.trim().toLowerCase();
  const low = s.products.filter((p) => p.stock !== null && p.stock <= p.lowAt);
  const byQty = [...stats].sort((a, b) => b.qty - a.qty);
  return (
    <div className="adm-in space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Units sold" value={stats.reduce((a, x) => a + x.qty, 0)} hint="In the selected period" icon="box" tone="violet" />
        <Kpi label="Products sold" value={stats.length} hint={`of ${s.products.length} on the catalogue`} icon="list" tone="sky" />
        <Kpi label="Best seller" value={byQty[0]?.name ?? "—"} hint={byQty[0] ? `${byQty[0].qty} pcs` : "No sales yet"} icon="trophy" tone="amber" small />
        <Kpi label="Low / sold out" value={low.length} hint="Check the inventory" icon="alert" tone={low.length ? "red" : "slate"} />
      </div>
      <Card title="Product performance" right={<SearchBox value={q} onChange={setQ} placeholder="Search products…" className="w-full sm:w-64" />}>
        <div className="overflow-x-auto adm-scroll">
          <table className="w-full min-w-[720px]">
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>#</th>
                <th className={th}>Product</th>
                <th className={th}>Category</th>
                <th className={cx(th, "text-right")}>Units</th>
                <th className={cx(th, "text-right")}>Revenue</th>
                <th className={cx(th, "w-[22%]")}>Share</th>
                <th className={cx(th, "text-right")}>In stock</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((r) => !needle || r.name.toLowerCase().includes(needle))
                .map((r, i) => {
                  const p = r.productId ? s.products.find((x) => x.id === r.productId) : null;
                  return (
                    <tr key={r.key} className="border-b border-slate-100 last:border-0">
                      <td className={cx(td, "text-slate-400")}>{i + 1}</td>
                      <td className={cx(td, "font-semibold text-slate-900")}>{r.name}</td>
                      <td className={cx(td, "text-slate-500")}>{p?.category ?? "Custom item"}</td>
                      <td className={cx(td, "text-right font-semibold")}>{r.qty}</td>
                      <td className={cx(td, "text-right font-bold text-slate-900")}>{rupee(r.revenue)}</td>
                      <td className={td}>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                            {r.revenue > 0 && <div className="adm-fill h-full rounded-full bg-red-600" style={{ width: `${(r.revenue / total) * 100}%` }} />}
                          </div>
                          <span className="w-10 text-right text-[11px] text-slate-500">{Math.round((r.revenue / total) * 100)}%</span>
                        </div>
                      </td>
                      <td className={cx(td, "text-right")}>
                        {!p ? (
                          <span className="text-slate-300">—</span>
                        ) : p.stock === null ? (
                          <span className="text-slate-400">∞</span>
                        ) : (
                          <span className={cx("font-semibold", p.stock <= 0 ? "text-red-600" : p.stock <= p.lowAt ? "text-amber-600" : "text-slate-700")}>{p.stock}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function TablesTab({ bills }: { bills: Bill[] }) {
  const { s } = useAdmin();
  const tbills = bills.filter((b) => b.source === "table");
  const rows = s.tables
    .map((t) => {
      const mine = tbills.filter((b) => b.tableId === t.id);
      const revenue = mine.reduce((a, b) => a + b.total, 0);
      const durations = mine
        .map((b) => {
          const sess = s.sessions.find((x) => x.id === b.sessionId);
          return sess ? b.createdAt - sess.openedAt : null;
        })
        .filter((x): x is number => x !== null);
      return {
        t,
        visits: mine.length,
        revenue,
        avg: mine.length ? revenue / mine.length : 0,
        mins: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60000) : null,
        last: mine.length ? Math.max(...mine.map((b) => b.createdAt)) : null,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
  const max = rows[0]?.revenue || 1;
  const revenue = tbills.reduce((a, b) => a + b.total, 0);
  const allMins = rows.filter((r) => r.mins !== null);
  return (
    <div className="adm-in space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Table revenue" value={rupee(revenue)} hint="Dine-in bills in the period" icon="rupee" tone="emerald" />
        <Kpi label="Visits" value={tbills.length} hint="Tabs settled" icon="users" tone="sky" />
        <Kpi label="Avg spend / visit" value={rupee(tbills.length ? Math.round(revenue / tbills.length) : 0)} hint="Per settled tab" icon="zap" tone="orange" />
        <Kpi label="Avg time at table" value={allMins.length ? `${Math.round(allMins.reduce((a, r) => a + (r.mins ?? 0), 0) / allMins.length)} min` : "—"} hint="First order → bill" icon="clock" tone="violet" />
      </div>
      <Card title="Revenue by table">
        {!s.tables.length ? (
          <Empty icon="tables" title="No tables yet" />
        ) : (
          <div className="overflow-x-auto adm-scroll">
            <table className="w-full min-w-[720px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className={th}>Table</th>
                  <th className={cx(th, "w-[30%]")}>Revenue</th>
                  <th className={cx(th, "text-right")}>Visits</th>
                  <th className={cx(th, "text-right")}>Avg / visit</th>
                  <th className={cx(th, "text-right")}>Avg time</th>
                  <th className={cx(th, "text-right")}>Last visit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.t.id} className="border-b border-slate-100 last:border-0">
                    <td className={cx(td, "adm-num text-[15px] font-extrabold text-slate-900")}>{r.t.label}</td>
                    <td className={td}>
                      <div className="flex items-center gap-3">
                        <b className="adm-num w-24 shrink-0 text-slate-900">{rupee(r.revenue)}</b>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          {r.revenue > 0 && <div className="adm-fill h-full rounded-full bg-red-600" style={{ width: `${(r.revenue / max) * 100}%` }} />}
                        </div>
                      </div>
                    </td>
                    <td className={cx(td, "text-right font-semibold")}>{r.visits}</td>
                    <td className={cx(td, "text-right")}>{rupee(Math.round(r.avg))}</td>
                    <td className={cx(td, "text-right text-slate-600")}>{r.mins !== null ? `${r.mins} min` : "—"}</td>
                    <td className={cx(td, "text-right text-slate-500")}>{r.last ? fmtDate(r.last) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
