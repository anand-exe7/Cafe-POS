"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Order, Table } from "@/lib/types";
import { rupee } from "@/lib/money";
import { useAdmin, type FloorTable } from "./Store";
import { Qr, downloadQrPng } from "./Qr";
import Catalog from "./Catalog";
import { Badge, Btn, Drawer, Empty, Field, Icon, Kpi, Modal, Page, PageHead, Pills, ago, cx, fmtTime, inputCls, type BadgeTone } from "./kit";

const ORDER_BADGE: Record<Order["status"], [BadgeTone, string]> = {
  new: ["red", "New"],
  preparing: ["amber", "Preparing"],
  served: ["green", "Served"],
  cancelled: ["slate", "Cancelled"],
};

function status(f: FloorTable): { tone: BadgeTone; label: string; bar: string } {
  if (!f.session) return { tone: "slate", label: "Free", bar: "bg-slate-200" };
  if (f.billRequested) return { tone: "amber", label: "Bill requested", bar: "bg-amber-400" };
  if (f.fresh) return { tone: "red", label: `${f.fresh} new order${f.fresh > 1 ? "s" : ""}`, bar: "bg-red-600" };
  return { tone: "green", label: "Occupied", bar: "bg-emerald-500" };
}

export function QrSheet({ tables, base, shop }: { tables: Table[]; base: string; shop: string }) {
  return (
    <div className="qr-sheet">
      {tables.map((t) => (
        <div className="qr-card" key={t.id}>
          <span className="qr-card__brand">{shop}</span>
          <span className="qr-card__table">
            <small>Table</small>
            {t.label}
          </span>
          <div className="qr-card__qr">
            <Qr text={`${base}/t/${t.code}`} />
          </div>
          <span className="qr-card__cta">Scan to see the menu &amp; order</span>
          <span className="qr-card__url">{`${base}/t/${t.code}`}</span>
        </div>
      ))}
    </div>
  );
}

export default function TablesPage({ focus }: { focus?: string }) {
  const { s, floor, act, confirm, toast, base, now, print } = useAdmin();
  const [sel, setSel] = useState<string | null>(focus ?? null);
  const [form, setForm] = useState<null | { id?: string; label: string; seats: string }>(null);
  const [guestForm, setGuestForm] = useState<null | { id: string; customerName: string; customerPhone: string; guests: string }>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [addFor, setAddFor] = useState<string | null>(null);
  const [view, setView] = useState<"all" | "busy" | "free">("all");

  const [lastFocus, setLastFocus] = useState(focus);
  if (focus !== lastFocus) {
    setLastFocus(focus);
    if (focus) setSel(focus);
  }

  const f = floor.find((x) => x.table.id === sel) ?? null;
  const shown = floor.filter((x) => (view === "busy" ? x.session : view === "free" ? !x.session : true));
  const busy = floor.filter((x) => x.session);
  const running = busy.reduce((a, x) => a + x.total, 0);
  const fresh = floor.reduce((a, x) => a + x.fresh, 0);
  const billReq = floor.filter((x) => x.billRequested).length;
  const localOnly = /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(base);

  const nextLabel = useMemo(() => {
    let n = s.tables.length + 1;
    while (s.tables.some((t) => t.label.toLowerCase() === `t${n}`)) n++;
    return `T${n}`;
  }, [s.tables]);

  const saveTable = async () => {
    if (!form) return;
    const r = await act<Table>("table.save", { id: form.id, label: form.label, seats: form.seats });
    if (r.ok) {
      toast({ kind: "ok", title: form.id ? "Table updated" : `${r.result.label} added — print its QR card next.` });
      setForm(null);
      if (!form.id) setSel(r.result.id);
    }
  };

  const setOrder = async (o: Order, next: Order["status"]) => {
    if (next === "cancelled") {
      const ok = await confirm({ title: `Cancel order #${o.no}?`, body: "Its items go back into stock and drop off the table's bill.", ok: "Cancel order", danger: true });
      if (!ok) return;
    }
    await act("order.status", { id: o.id, status: next });
  };

  const link = (t: Table) => `${base}/t/${t.code}`;

  return (
    <Page>
      <PageHead
        title="Tables"
        sub="Live floor — every scan, order and running bill, per table."
        right={
          <>
            <Btn
              icon="print"
              onClick={() => {
                setPicked(new Set(s.tables.map((t) => t.id)));
                setPrintOpen(true);
              }}
              disabled={!s.tables.length}
            >
              Print QR cards
            </Btn>
            <Btn kind="red" icon="plus" onClick={() => setForm({ label: nextLabel, seats: "4" })}>
              Add table
            </Btn>
          </>
        }
      />

      {localOnly && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <Icon name="alert" size={18} className="text-amber-600" />
          <span className="flex-1">
            QR codes point to <b>{base}</b>, which guests&apos; phones can&apos;t open. Set the address phones use (your domain or this computer&apos;s Wi-Fi IP) in <b>Settings</b> before printing.
          </span>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi label="Occupied" value={`${busy.length} / ${s.tables.length}`} hint="Tables with an open tab" icon="users" tone="emerald" />
        <Kpi label="Running on tabs" value={rupee(running)} hint="Not yet billed" icon="rupee" tone="sky" />
        <Kpi label="New orders" value={fresh} hint="Waiting to be accepted" icon="utensils" tone={fresh ? "red" : "slate"} />
        <Kpi label="Bill requests" value={billReq} hint="Guests ready to pay" icon="billing" tone={billReq ? "amber" : "slate"} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Pills
          label="Show"
          value={view}
          onChange={setView}
          options={[
            { v: "all", t: `All (${floor.length})` },
            { v: "busy", t: `Occupied (${busy.length})` },
            { v: "free", t: `Free (${floor.length - busy.length})` },
          ]}
        />
        <span className="text-[12px] text-slate-400">QR links → {base}/t/…</span>
      </div>

      {!s.tables.length ? (
        <Empty icon="tables" title="No tables yet">
          Add your first table to get its QR code.
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {shown.map((x) => {
            const st = status(x);
            return (
              <button
                key={x.table.id}
                type="button"
                onClick={() => setSel(x.table.id)}
                className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 text-left shadow-[0_2px_10px_-2px_rgba(15,23,42,.08)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-12px_rgba(15,23,42,.25)]"
              >
                <span className={cx("absolute inset-x-0 top-0 h-1", st.bar)} />
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="adm-num text-[30px] font-extrabold leading-none text-slate-900">{x.table.label}</p>
                    <p className="mt-1.5 text-[12px] font-medium text-slate-400">
                      {x.table.seats} seats{x.session ? ` · ${x.session.guests} guest${x.session.guests === 1 ? "" : "s"}` : ""}
                    </p>
                  </div>
                  <Badge tone={st.tone} className={cx((x.fresh > 0 || x.billRequested) && "adm-pulse")}>
                    {st.label}
                  </Badge>
                </div>
                <div className="mt-4 border-t border-dashed border-slate-200 pt-4">
                  {x.session ? (
                    <>
                      <div className="flex items-end justify-between gap-2">
                        <p className="adm-num text-[24px] font-extrabold text-slate-900">{rupee(x.total)}</p>
                        <p className="flex items-center gap-1 text-[12px] font-medium text-slate-400">
                          <Icon name="clock" size={13} /> {ago(x.session.openedAt, now)}
                        </p>
                      </div>
                      <p className="mt-1 text-[12.5px] text-slate-500">
                        {(() => {
                          const n = x.orders.filter((o) => o.status !== "cancelled").length;
                          return `${n} order${n === 1 ? "" : "s"} · ${x.items} item${x.items === 1 ? "" : "s"}`;
                        })()}
                        {x.cooking ? <span className="text-amber-600"> · {x.cooking} cooking</span> : null}
                      </p>
                      <p className="mt-1 truncate text-[12.5px] font-semibold text-slate-700">
                        {x.session.customerName || "Guest"}
                        {x.session.customerPhone && <span className="font-normal text-slate-400"> · {x.session.customerPhone}</span>}
                      </p>
                    </>
                  ) : (
                    <div className="flex items-center gap-3 text-slate-400">
                      <Icon name="qr" size={30} stroke={1.6} />
                      <p className="text-[12.5px] leading-snug">
                        Free — ready for guests.
                        <br />
                        Orders appear the moment they scan.
                      </p>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ================= table drawer ================= */}
      <Drawer open={!!f} onClose={() => setSel(null)}>
        {f && (
          <>
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-100 bg-white px-6 py-4">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h2 className="adm-num text-[26px] font-extrabold text-slate-900">{f.table.label}</h2>
                  <Badge tone={status(f).tone}>{status(f).label}</Badge>
                </div>
                <p className="text-[12px] text-slate-400">{f.table.seats} seats</p>
              </div>
              <button type="button" className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100" title="Edit table" onClick={() => setForm({ id: f.table.id, label: f.table.label, seats: String(f.table.seats) })}>
                <Icon name="edit" size={17} />
              </button>
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-red-50 hover:text-red-600"
                title="Delete table"
                onClick={async () => {
                  if (await confirm({ title: `Delete ${f.table.label}?`, body: "Its QR code stops working. Past bills stay in your records.", ok: "Delete table", danger: true })) {
                    const r = await act("table.delete", { id: f.table.id });
                    if (r.ok) setSel(null);
                  }
                }}
              >
                <Icon name="trash" size={17} />
              </button>
              <button type="button" className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100" onClick={() => setSel(null)} aria-label="Close">
                <Icon name="x" />
              </button>
            </div>

            <div className="space-y-6 px-6 py-5">
              {f.session ? (
                <>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Running total</p>
                        <p className="adm-num mt-1 text-[30px] font-extrabold text-slate-900">{rupee(f.total)}</p>
                      </div>
                      <div className="text-right text-[12px] text-slate-500">
                        <p>Seated {fmtTime(f.session.openedAt)}</p>
                        <p>{ago(f.session.openedAt, now)} ago</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200 pt-3 text-[13px]">
                      <span className="min-w-0 truncate">
                        <b className="text-slate-800">{f.session.customerName || "Guest"}</b>
                        <span className="text-slate-500"> · {f.session.customerPhone || "no phone"} · {f.session.guests} guests</span>
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-[12px] font-bold text-sky-600 hover:underline"
                        onClick={() => setGuestForm({ id: f.session!.id, customerName: f.session!.customerName, customerPhone: f.session!.customerPhone, guests: String(f.session!.guests) })}
                      >
                        EDIT
                      </button>
                    </div>
                    {f.billRequested && (
                      <p className="mt-3 flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-[12.5px] font-semibold text-amber-900">
                        <Icon name="billing" size={15} /> Guests asked for the bill
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Link href={`/admin/billing?table=${f.table.id}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 text-[13px] font-semibold text-white shadow-[0_6px_16px_-8px_rgba(220,38,38,.8)] hover:bg-red-700">
                      <Icon name="billing" size={16} /> Bill this table
                    </Link>
                    <Btn size="lg" icon="plus" onClick={() => setAddFor(f.table.id)} className="h-11">
                      Add items
                    </Btn>
                  </div>

                  <div>
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Orders on this tab</p>
                    <ol className="space-y-3">
                      {[...f.orders].reverse().map((o) => (
                        <li key={o.id} className={cx("rounded-2xl border p-4", o.status === "new" ? "border-red-200 bg-red-50/30" : "border-slate-100", o.status === "cancelled" && "opacity-55")}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[14px] font-bold text-slate-900">
                              #{o.no} <span className="font-medium text-slate-400">· {fmtTime(o.createdAt)}</span>
                            </p>
                            <Badge tone={ORDER_BADGE[o.status][0]}>{ORDER_BADGE[o.status][1]}</Badge>
                          </div>
                          <ul className="mt-2 space-y-1 text-[13px]">
                            {o.items.map((it, i) => (
                              <li key={i} className="flex justify-between gap-3">
                                <span className={cx("text-slate-700", o.status === "cancelled" && "line-through")}>
                                  <b>{it.qty}×</b> {it.name}
                                </span>
                                <span className="text-slate-500">{rupee(it.price * it.qty)}</span>
                              </li>
                            ))}
                          </ul>
                          {o.note && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">“{o.note}”</p>}
                          {(o.status === "new" || o.status === "preparing") && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {o.status === "new" ? (
                                <Btn size="sm" kind="dark" icon="check" onClick={() => setOrder(o, "preparing")}>
                                  Accept &amp; prepare
                                </Btn>
                              ) : (
                                <Btn size="sm" kind="green" icon="check" onClick={() => setOrder(o, "served")}>
                                  Mark served
                                </Btn>
                              )}
                              {o.status === "new" && (
                                <Btn size="sm" onClick={() => setOrder(o, "served")}>
                                  Served
                                </Btn>
                              )}
                              <Btn size="sm" kind="plain" className="text-red-600" onClick={() => setOrder(o, "cancelled")}>
                                Cancel
                              </Btn>
                            </div>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>

                  <button
                    type="button"
                    className="text-[12.5px] font-semibold text-slate-400 underline-offset-2 hover:text-red-600 hover:underline"
                    onClick={async () => {
                      if (
                        await confirm({
                          title: `Clear ${f.table.label} without billing?`,
                          body:
                            f.total > 0
                              ? `${rupee(f.total)} on this tab will NOT be recorded as a sale — it drops out of Billing and Analytics for good. Unserved orders are cancelled and their stock returned. To take the payment and keep the sale, use “Bill this table” instead.`
                              : "Use this if guests left without ordering or the tab was opened by mistake. Unserved orders are cancelled and their stock returned.",
                          ok: "Clear table",
                          danger: true,
                        })
                      )
                        act("table.clear", { id: f.table.id });
                    }}
                  >
                    Clear table without billing
                  </button>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center">
                  <p className="font-semibold text-slate-700">This table is free</p>
                  <p className="mt-1 text-[13px] text-slate-500">A tab opens automatically when guests scan the QR and order. Taking an order by hand? Start it here.</p>
                  <Btn className="mt-3" icon="plus" onClick={() => setAddFor(f.table.id)}>
                    Start a tab
                  </Btn>
                </div>
              )}

              {/* QR */}
              <div className="rounded-2xl border border-slate-100 p-4">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Table QR code</p>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="adm-qr w-[150px] shrink-0 self-center rounded-xl border border-slate-100 p-2">
                    <Qr text={link(f.table)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-[12px] text-slate-700">{link(f.table)}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Btn
                        size="sm"
                        icon="copy"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(link(f.table));
                            toast({ kind: "ok", title: "Link copied" });
                          } catch {
                            toast({ kind: "err", title: "Couldn't copy — select the link and copy it manually." });
                          }
                        }}
                      >
                        Copy
                      </Btn>
                      <Btn size="sm" icon="download" onClick={() => downloadQrPng(link(f.table), `table-${f.table.label}-qr.png`)}>
                        PNG
                      </Btn>
                      <Btn size="sm" icon="print" onClick={() => print(<QrSheet tables={[f.table]} base={base} shop={s.settings.shopName} />)}>
                        Print
                      </Btn>
                      <a href={link(f.table)} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50">
                        <Icon name="external" size={14} /> Open
                      </a>
                    </div>
                    <button
                      type="button"
                      className="mt-3 text-[12px] font-semibold text-slate-400 hover:text-red-600"
                      onClick={async () => {
                        if (await confirm({ title: `New QR for ${f.table.label}?`, body: "The printed QR stops working immediately — you'll need to print and place the new card.", ok: "Make new QR", danger: true }))
                          act("table.rotate", { id: f.table.id });
                      }}
                    >
                      Replace QR code…
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </Drawer>

      {/* ================= add / edit table ================= */}
      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "Edit table" : "Add table"}
        footer={
          <>
            <Btn onClick={() => setForm(null)}>Cancel</Btn>
            <Btn kind="red" onClick={saveTable}>
              {form?.id ? "Save" : "Add table"}
            </Btn>
          </>
        }
      >
        {form && (
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveTable();
            }}
          >
            <Field label="Table name">
              <input className={inputCls} value={form.label} maxLength={24} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="T7, Patio 2…" />
            </Field>
            <Field label="Seats">
              <input className={inputCls} type="number" min={1} max={40} value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} />
            </Field>
            <button type="submit" hidden />
          </form>
        )}
      </Modal>

      {/* ================= guest details ================= */}
      <Modal
        open={!!guestForm}
        onClose={() => setGuestForm(null)}
        title="Guest details"
        footer={
          <>
            <Btn onClick={() => setGuestForm(null)}>Cancel</Btn>
            <Btn
              kind="red"
              onClick={async () => {
                const r = await act("session.update", guestForm!);
                if (r.ok) setGuestForm(null);
              }}
            >
              Save
            </Btn>
          </>
        }
      >
        {guestForm && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name" className="sm:col-span-3">
              <input className={inputCls} value={guestForm.customerName} onChange={(e) => setGuestForm({ ...guestForm, customerName: e.target.value })} />
            </Field>
            <Field label="Mobile" className="sm:col-span-2">
              <input className={inputCls} inputMode="tel" value={guestForm.customerPhone} onChange={(e) => setGuestForm({ ...guestForm, customerPhone: e.target.value })} />
            </Field>
            <Field label="Guests">
              <input className={inputCls} type="number" min={1} value={guestForm.guests} onChange={(e) => setGuestForm({ ...guestForm, guests: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      {/* ================= add items to a tab ================= */}
      <Catalog
        open={!!addFor}
        onClose={() => setAddFor(null)}
        title={`Add items · ${s.tables.find((t) => t.id === addFor)?.label ?? ""}`}
        addLabel="Add to tab"
        onAdd={async (items) => {
          const r = await act("order.create", { tableId: addFor, items });
          if (r.ok) toast({ kind: "ok", title: "Added to the tab — marked as preparing." });
          return r.ok;
        }}
      />

      {/* ================= print QR cards ================= */}
      <Modal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        title="Print QR cards"
        footer={
          <>
            <Btn onClick={() => setPrintOpen(false)}>Cancel</Btn>
            <Btn
              kind="red"
              icon="print"
              disabled={!picked.size}
              onClick={() => {
                print(<QrSheet tables={s.tables.filter((t) => picked.has(t.id))} base={base} shop={s.settings.shopName} />);
                setPrintOpen(false);
              }}
            >
              Print {picked.size} card{picked.size === 1 ? "" : "s"}
            </Btn>
          </>
        }
      >
        <p className="mb-4 text-[13px] text-slate-500">
          Two cards per A4 page. Each code opens <b className="text-slate-700">{base}/t/…</b>
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {s.tables.map((t) => {
            const on = picked.has(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  setPicked((p) => {
                    const n = new Set(p);
                    if (on) n.delete(t.id);
                    else n.add(t.id);
                    return n;
                  })
                }
                className={cx("flex h-12 items-center justify-center gap-2 rounded-xl border text-[14px] font-bold transition", on ? "border-red-300 bg-red-50 text-red-700" : "border-slate-200 text-slate-500")}
              >
                {on && <Icon name="check" size={15} />}
                {t.label}
              </button>
            );
          })}
        </div>
      </Modal>
    </Page>
  );
}
