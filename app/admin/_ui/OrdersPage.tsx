"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import type { Bill, Order } from "@/lib/types";
import { rupee } from "@/lib/money";
import { inRange, rangeOf, type Period } from "@/lib/analytics";
import { useAdmin } from "./Store";
import { Receipt, billText, waLink } from "./receipt";
import { Badge, Btn, Empty, Icon, Modal, Page, PageHead, SearchBox, Tabs, WaIcon, csv, cx, downloadText, fmtDate, fmtDateTime, fmtTime, type BadgeTone } from "./kit";

type View = "orders" | "bills";
type DateF = Extract<Period, "today" | "week" | "month" | "custom"> | "any";

const ST: Record<Order["status"], [BadgeTone, string]> = {
  new: ["red", "New"],
  preparing: ["amber", "Preparing"],
  served: ["green", "Served"],
  cancelled: ["slate", "Cancelled"],
};
const PAY = { cash: "Cash", upi: "UPI", card: "Card" } as const;

const th = "px-4 py-4 text-left text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500 whitespace-nowrap";
const td = "px-4 py-4 text-[13px] whitespace-nowrap";

function Chip({ on, children, onClick, tone = "red" }: { on: boolean; children: React.ReactNode; onClick: () => void; tone?: "red" | "link" }) {
  if (tone === "link")
    return (
      <button type="button" onClick={onClick} className="h-8 rounded-full px-3 text-[13px] font-semibold text-red-600 hover:bg-red-50">
        {children}
      </button>
    );
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("h-8 whitespace-nowrap rounded-full px-4 text-[13px] font-semibold transition", on ? "bg-red-600 text-white shadow-[0_4px_10px_-4px_rgba(220,38,38,.9)]" : "bg-slate-100/80 text-slate-700 hover:bg-slate-200")}
    >
      {children}
    </button>
  );
}

export default function OrdersPage() {
  const { s, act, confirm, tableLabel, print } = useAdmin();
  const [view, setView] = useState<View>("orders");
  const [status, setStatus] = useState<"all" | Order["status"]>("all");
  const [type, setType] = useState<"all" | "table" | "counter">("all");
  const [date, setDate] = useState<DateF>("any");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(50);
  const [open, setOpen] = useState<string | null>(null);
  const [bill, setBill] = useState<Bill | null>(null);

  const range = date === "any" ? null : rangeOf(date, from, to);
  const needle = q.trim().toLowerCase();
  const fresh = s.orders.filter((o) => o.status === "new").length;

  const orders = useMemo(
    () =>
      s.orders
        .filter((o) => (status === "all" || o.status === status) && inRange(o.createdAt, range))
        .filter((o) => !needle || `#${o.no} ${o.no} ${tableLabel(o.tableId)} ${o.customerName} ${o.customerPhone} ${o.items.map((i) => i.name).join(" ")}`.toLowerCase().includes(needle))
        .sort((a, b) => b.createdAt - a.createdAt),
    [s.orders, status, range, needle, tableLabel],
  );
  const bills = useMemo(
    () =>
      s.bills
        .filter((b) => (type === "all" || b.source === type) && inRange(b.createdAt, range))
        .filter((b) => !needle || `${b.invoiceNo} ${b.customerName} ${b.customerPhone} ${b.tableLabel} ${b.couponCode ?? ""}`.toLowerCase().includes(needle))
        .sort((a, b) => b.createdAt - a.createdAt),
    [s.bills, type, range, needle],
  );

  const exportCsv = () => {
    if (view === "orders") {
      downloadText(
        `orders-${new Date().toISOString().slice(0, 10)}.csv`,
        csv([
          ["Order", "Table", "Customer", "Phone", "Items", "Qty", "Total", "Status", "Note", "Date", "Time"],
          ...orders.map((o) => [o.no, tableLabel(o.tableId), o.customerName, o.customerPhone, o.items.map((i) => `${i.qty}x ${i.name}`).join("; "), o.items.reduce((a, i) => a + i.qty, 0), o.subtotal, o.status, o.note, fmtDate(o.createdAt), fmtTime(o.createdAt)]),
        ]),
      );
    } else {
      downloadText(
        `bills-${new Date().toISOString().slice(0, 10)}.csv`,
        csv([
          ["Invoice", "Type", "Table", "Customer", "Phone", "Items", "Subtotal", "Coupon", "Coupon discount", "Manual discount", "Extra", "Total", "Payment", "Status", "Date", "Time"],
          ...bills.map((b) => [b.invoiceNo, b.source, b.tableLabel, b.customerName, b.customerPhone, b.itemCount, b.subtotal, b.couponCode ?? "", b.couponDiscount, b.manualDiscount, b.extra, b.total, b.payment, b.status, fmtDate(b.createdAt), fmtTime(b.createdAt)]),
        ]),
      );
    }
  };

  const move = async (o: Order, next: Order["status"]) => {
    if (next === "cancelled" && !(await confirm({ title: `Cancel order #${o.no}?`, body: "Its items go back into stock and drop off the table's bill.", ok: "Cancel order", danger: true }))) return;
    act("order.status", { id: o.id, status: next });
  };

  const count = view === "orders" ? orders.length : bills.length;

  return (
    <Page>
      <PageHead
        title="Order Management"
        right={
          <Link href="/admin/billing" className="inline-flex h-11 items-center gap-2 rounded-xl bg-red-600 px-5 text-[14px] font-bold text-white shadow-[0_6px_16px_-8px_rgba(220,38,38,.8)] hover:bg-red-700">
            <Icon name="cart" size={18} /> Open POS
          </Link>
        }
      />

      <Tabs
        value={view}
        onChange={(v) => {
          setView(v);
          setLimit(50);
        }}
        options={[
          { v: "orders", t: "Table orders", n: fresh },
          { v: "bills", t: "Bills & invoices" },
        ]}
      />

      <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-slate-100 p-5 shadow-[0_2px_10px_-2px_rgba(15,23,42,.08)] lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-14 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{view === "orders" ? "Status" : "Type"}</span>
            {view === "orders"
              ? (["all", "new", "preparing", "served", "cancelled"] as const).map((v) => (
                  <Chip key={v} on={status === v} onClick={() => setStatus(v)}>
                    {v === "all" ? "All orders" : ST[v][1]}
                  </Chip>
                ))
              : (
                  [
                    ["all", "All Bills"],
                    ["table", "Table"],
                    ["counter", "Counter"],
                  ] as const
                ).map(([v, t]) => (
                  <Chip key={v} on={type === v} onClick={() => setType(v)}>
                    {t}
                  </Chip>
                ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-14 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Date</span>
            {(
              [
                ["today", "Today"],
                ["week", "This Week"],
                ["month", "This Month"],
                ["custom", "Custom Range"],
              ] as const
            ).map(([v, t]) => (
              <Chip key={v} on={date === v} onClick={() => setDate(v)}>
                {t}
              </Chip>
            ))}
            {date !== "any" && (
              <Chip on={false} tone="link" onClick={() => (setDate("any"), setFrom(""), setTo(""))}>
                Clear Dates
              </Chip>
            )}
            {date === "custom" && (
              <span className="adm-in flex items-center gap-2 text-[12px] text-slate-500">
                <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-8 rounded-lg border border-slate-200 px-2 text-slate-800" />
                to
                <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-8 rounded-lg border border-slate-200 px-2 text-slate-800" />
              </span>
            )}
          </div>
        </div>
        <SearchBox value={q} onChange={setQ} placeholder={view === "orders" ? "Search order, table, name, phone…" : "Search invoice, name, phone…"} className="w-full shadow-[0_2px_8px_-2px_rgba(15,23,42,.1)] lg:w-80" />
      </div>

      <div className="mb-3 flex items-center justify-between px-1">
        <span className="text-[12.5px] font-semibold text-slate-600">{count} result(s)</span>
        <button type="button" onClick={exportCsv} disabled={!count} className="inline-flex items-center gap-1.5 text-[13px] font-bold text-red-600 hover:underline disabled:opacity-40">
          <Icon name="download" size={15} /> Export CSV
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 shadow-[0_2px_10px_-2px_rgba(15,23,42,.08)]">
        <div className="overflow-x-auto adm-scroll">
          {view === "orders" ? (
            <table className="w-full min-w-[1000px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className={th}>Order no</th>
                  <th className={th}>Table</th>
                  <th className={th}>Customer name</th>
                  <th className={th}>Phone</th>
                  <th className={th}>Items</th>
                  <th className={th}>Total</th>
                  <th className={th}>Date</th>
                  <th className={cx(th, "text-center")}>Status</th>
                  <th className={cx(th, "text-right")}>Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, limit).map((o) => {
                  const qty = o.items.reduce((a, i) => a + i.qty, 0);
                  const isOpen = open === o.id;
                  return (
                    <Fragment key={o.id}>
                      <tr className={cx("border-b border-slate-100 transition-colors hover:bg-slate-50/60", o.status === "new" && "bg-red-50/40")}>
                        <td className={td}>
                          <button type="button" onClick={() => setOpen(isOpen ? null : o.id)} className="inline-flex items-center gap-2 font-bold text-red-600">
                            #{o.no}
                            <span className={cx("grid h-6 w-6 place-items-center rounded-md bg-slate-50 text-slate-400 transition", isOpen && "rotate-90")}>
                              <Icon name="chevron" size={13} />
                            </span>
                          </button>
                        </td>
                        <td className={td}>
                          <span className="adm-num font-extrabold text-slate-900">{tableLabel(o.tableId)}</span>
                        </td>
                        <td className={cx(td, "font-semibold text-slate-800")}>{o.customerName || "Guest"}</td>
                        <td className={cx(td, "text-slate-600")}>{o.customerPhone || "—"}</td>
                        <td className={cx(td, "max-w-[260px] truncate text-slate-600")} title={o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}>
                          <b className="text-slate-800">{qty}</b> · {o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}
                        </td>
                        <td className={cx(td, "font-bold text-slate-900")}>{rupee(o.subtotal)}</td>
                        <td className={cx(td, "text-slate-600")}>
                          {fmtDate(o.createdAt)}
                          <span className="block text-[11px] text-slate-400">{fmtTime(o.createdAt)}</span>
                        </td>
                        <td className={cx(td, "text-center")}>
                          <Badge tone={ST[o.status][0]} className={o.status === "new" ? "adm-pulse" : undefined}>
                            {ST[o.status][1]}
                          </Badge>
                        </td>
                        <td className={cx(td, "text-right")}>
                          <span className="inline-flex gap-1.5">
                            {o.status === "new" && (
                              <Btn size="sm" kind="dark" onClick={() => move(o, "preparing")}>
                                Accept
                              </Btn>
                            )}
                            {(o.status === "new" || o.status === "preparing") && (
                              <Btn size="sm" kind={o.status === "preparing" ? "green" : "ghost"} onClick={() => move(o, "served")}>
                                Served
                              </Btn>
                            )}
                            {(o.status === "new" || o.status === "preparing") && (
                              <Btn size="sm" kind="plain" className="text-red-600" onClick={() => move(o, "cancelled")} aria-label={`Cancel order ${o.no}`}>
                                <Icon name="x" size={14} />
                              </Btn>
                            )}
                            {(o.status === "served" || o.status === "cancelled") && <span className="text-[12px] text-slate-300">—</span>}
                          </span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-slate-100 bg-slate-50/60">
                          <td colSpan={9} className="px-6 py-4">
                            <div className="grid gap-4 md:grid-cols-[1fr_280px]">
                              <ul className="space-y-1 text-[13px]">
                                {o.items.map((i, k) => (
                                  <li key={k} className="flex max-w-md justify-between">
                                    <span>
                                      <b>{i.qty}×</b> {i.name} <span className="text-slate-400">@ {rupee(i.price)}</span>
                                    </span>
                                    <b>{rupee(i.qty * i.price)}</b>
                                  </li>
                                ))}
                              </ul>
                              <div className="text-[13px] text-slate-600">{o.note ? <p className="rounded-xl bg-amber-50 p-3 text-amber-900">“{o.note}”</p> : <p className="text-slate-400">No note from the table.</p>}</div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className={th}>Invoice no</th>
                  <th className={th}>Customer name</th>
                  <th className={th}>Phone</th>
                  <th className={th}>Bill type</th>
                  <th className={th}>Coupon</th>
                  <th className={th}>Discount</th>
                  <th className={th}>Extra</th>
                  <th className={th}>Total</th>
                  <th className={th}>Payment</th>
                  <th className={th}>Date</th>
                  <th className={cx(th, "text-center")}>Status</th>
                </tr>
              </thead>
              <tbody>
                {bills.slice(0, limit).map((b) => (
                  <tr key={b.id} className={cx("border-b border-slate-100 transition-colors hover:bg-slate-50/60", b.status === "void" && "opacity-55")}>
                    <td className={td}>
                      <button type="button" onClick={() => setBill(b)} className="inline-flex items-center gap-2 font-bold text-red-600">
                        {b.invoiceNo}
                        <span className="grid h-6 w-6 place-items-center rounded-md bg-slate-50 text-slate-400">
                          <Icon name="external" size={13} />
                        </span>
                      </button>
                    </td>
                    <td className={cx(td, "font-semibold text-slate-800")}>{b.customerName || "—"}</td>
                    <td className={cx(td, "text-slate-600")}>{b.customerPhone || "—"}</td>
                    <td className={td}>{b.source === "table" ? <Badge tone="orange">Table {b.tableLabel}</Badge> : <Badge tone="sky">Counter</Badge>}</td>
                    <td className={cx(td, "text-slate-600")}>{b.couponCode ?? "—"}</td>
                    <td className={cx(td, "text-slate-500")}>{b.discount ? rupee(b.discount) : "—"}</td>
                    <td className={cx(td, "text-slate-500")}>{b.extra ? rupee(b.extra) : "—"}</td>
                    <td className={cx(td, "font-bold text-slate-900")}>{rupee(b.total)}</td>
                    <td className={cx(td, "text-slate-600")}>{PAY[b.payment]}</td>
                    <td className={cx(td, "text-slate-600")}>{fmtDate(b.createdAt)}</td>
                    <td className={cx(td, "text-center")}>{b.status === "completed" ? <Badge tone="green">Completed</Badge> : <Badge tone="slate">Void</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!count && (
            <Empty icon={view === "orders" ? "orders" : "billing"} title={view === "orders" ? "No orders match" : "No bills match"}>
              {view === "orders" ? "Orders from table QR codes land here instantly." : "Settled tabs and counter bills show up here."}
            </Empty>
          )}
        </div>
      </div>
      {count > limit && (
        <div className="mt-4 text-center">
          <Btn onClick={() => setLimit((n) => n + 50)}>Show more ({count - limit} left)</Btn>
        </div>
      )}

      {/* ---------- bill detail ---------- */}
      <Modal
        open={!!bill}
        onClose={() => setBill(null)}
        title={bill?.invoiceNo ?? ""}
        footer={
          bill && (
            <>
              {bill.status === "completed" && (
                <Btn
                  kind="plain"
                  className="mr-auto text-red-600"
                  onClick={async () => {
                    if (await confirm({ title: `Void ${bill.invoiceNo}?`, body: "It drops out of revenue, its items return to stock and any coupon use is given back. This can't be undone.", ok: "Void bill", danger: true })) {
                      const r = await act<Bill>("bill.void", { id: bill.id });
                      if (r.ok) setBill(r.result);
                    }
                  }}
                >
                  Void bill
                </Btn>
              )}
              {bill.customerPhone && (
                <a href={waLink(bill.customerPhone, billText(bill, s.settings.shopName))} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#22c55e] px-4 text-[13px] font-semibold text-white hover:bg-[#16a34a]">
                  <WaIcon size={16} /> WhatsApp
                </a>
              )}
              <Btn kind="dark" icon="print" onClick={() => print(<Receipt b={bill} shop={s.settings.shopName} />)}>
                Print
              </Btn>
            </>
          )
        }
      >
        {bill && (
          <div className="text-[13.5px]">
            <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4">
              <p>
                <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Customer</span>
                <b>{bill.customerName || "—"}</b>
                <span className="block text-slate-500">{bill.customerPhone || "no phone"}</span>
              </p>
              <p className="text-right">
                <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{bill.source === "table" ? `Table ${bill.tableLabel}` : "Counter"}</span>
                <b>{fmtDateTime(bill.createdAt)}</b>
                <span className="block">{bill.status === "completed" ? <Badge tone="green">Completed</Badge> : <Badge tone="slate">Void</Badge>}</span>
              </p>
            </div>
            <ul className="my-4 divide-y divide-dashed divide-slate-200">
              {bill.items.map((i, k) => (
                <li key={k} className="flex justify-between gap-3 py-2">
                  <span>
                    <b>{i.qty}×</b> {i.name} <span className="text-slate-400">@ {rupee(i.price)}</span>
                  </span>
                  <b>{rupee(i.qty * i.price)}</b>
                </li>
              ))}
            </ul>
            <dl className="space-y-1.5 border-t border-slate-200 pt-3">
              <div className="flex justify-between">
                <dt className="text-slate-500">Subtotal ({bill.itemCount} items)</dt>
                <dd>{rupee(bill.subtotal)}</dd>
              </div>
              {bill.couponDiscount > 0 && (
                <div className="flex justify-between text-red-600">
                  <dt>
                    Coupon {bill.couponCode} ({bill.couponPercent}%)
                  </dt>
                  <dd>-{rupee(bill.couponDiscount)}</dd>
                </div>
              )}
              {bill.manualDiscount > 0 && (
                <div className="flex justify-between text-red-600">
                  <dt>Discount{bill.manualType === "percent" ? ` (${bill.manualValue}%)` : ""}</dt>
                  <dd>-{rupee(bill.manualDiscount)}</dd>
                </div>
              )}
              {bill.extra > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Extra charges</dt>
                  <dd>{rupee(bill.extra)}</dd>
                </div>
              )}
              <div className="flex justify-between pt-2 text-[17px]">
                <dt className="font-bold">Grand total</dt>
                <dd className="adm-num font-extrabold">{rupee(bill.total)}</dd>
              </div>
              <div className="flex justify-between text-slate-500">
                <dt>Paid · {PAY[bill.payment]}</dt>
                <dd>
                  {rupee(bill.received)}
                  {bill.change > 0 && ` (change ${rupee(bill.change)})`}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </Modal>
    </Page>
  );
}
