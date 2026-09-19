"use client";

import { useState } from "react";
import type { Coupon } from "@/lib/types";
import { couponStatus, rupee } from "@/lib/money";
import { useAdmin } from "./Store";
import { Btn, Empty, Icon, Page, PageHead, SearchBox, cx, labelCls } from "./kit";

type Form = { id?: string; code: string; percent: string; minOrder: string; expiresAt: string; limit: string; active: boolean };
const EMPTY: Form = { code: "", percent: "", minOrder: "", expiresAt: "", limit: "", active: true };

const field = "h-12 w-full rounded-xl bg-slate-50 px-4 text-[14px] font-medium text-slate-900 outline-none ring-red-100 transition placeholder:text-slate-400 focus:bg-white focus:ring-4";
const STATUS = {
  active: ["Active", "text-emerald-600"],
  expired: ["Expired", "text-red-600"],
  exhausted: ["Used up", "text-red-600"],
  paused: ["Paused", "text-slate-500"],
} as const;

function gen() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const r = new Uint32Array(7);
  crypto.getRandomValues(r);
  return Array.from(r, (n) => A[n % A.length]).join("");
}

const ddmmyyyy = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return `${day}/${m}/${y}`;
};

export default function CouponsPage() {
  const { s, act, confirm, toast, refresh } = useAdmin();
  const [f, setF] = useState<Form>(EMPTY);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await act<Coupon>("coupon.save", { ...f, limit: f.limit || null, minOrder: f.minOrder || 0 });
    setBusy(false);
    if (r.ok) {
      toast({ kind: "ok", title: f.id ? `${r.result.code} updated` : `${r.result.code} created — it's ready in Billing.` });
      setF(EMPTY);
    }
  };

  const edit = (c: Coupon) =>
    setF({ id: c.id, code: c.code, percent: String(c.percent), minOrder: c.minOrder ? String(c.minOrder) : "", expiresAt: c.expiresAt ?? "", limit: c.limit === null ? "" : String(c.limit), active: c.active });

  const list = s.coupons.filter((c) => !q || c.code.toLowerCase().includes(q.toLowerCase()));

  return (
    <Page>
      <PageHead
        title="Coupon Management"
        right={
          <Btn icon="refresh" onClick={() => refresh()} className="h-11 shadow-sm">
            Refresh
          </Btn>
        }
      />
      <p className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3.5 text-[13.5px] font-medium text-blue-700">
        Coupon discount applies to the item subtotal only — not extra charges. Active coupons appear instantly in the Billing screen.
      </p>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* ---------- form ---------- */}
        <form onSubmit={save} className="rounded-[26px] border border-slate-100 bg-white p-6 shadow-[0_2px_12px_-4px_rgba(15,23,42,.1)] sm:p-8">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-[18px] font-bold text-slate-900">{f.id ? "Edit Coupon" : "+ New Coupon"}</h2>
            {f.id && (
              <button type="button" onClick={() => setF(EMPTY)} className="text-[12.5px] font-semibold text-slate-500 hover:text-slate-900">
                Cancel edit
              </button>
            )}
          </div>
          <label className="block">
            <span className={labelCls}>Coupon code *</span>
            <span className="relative block">
              <input className={cx(field, "pr-28 uppercase")} placeholder="E.G. SUMMER20" value={f.code} maxLength={24} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} required />
              <button type="button" onClick={() => setF({ ...f, code: gen() })} className="absolute right-2 top-1/2 h-8 -translate-y-1/2 rounded-lg bg-red-600 px-4 text-[12.5px] font-bold text-white hover:bg-red-700">
                Generate
              </button>
            </span>
          </label>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label>
              <span className={labelCls}>Discount % *</span>
              <input className={field} type="number" min={1} max={100} step="0.5" placeholder="e.g. 15" value={f.percent} onChange={(e) => setF({ ...f, percent: e.target.value })} required />
            </label>
            <label>
              <span className={labelCls}>Min order (₹)</span>
              <input className={field} type="number" min={0} placeholder="e.g. 1000" value={f.minOrder} onChange={(e) => setF({ ...f, minOrder: e.target.value })} />
            </label>
            <label>
              <span className={labelCls}>Expiry date</span>
              <input className={field} type="date" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} />
            </label>
            <label>
              <span className={labelCls}>Usage limit</span>
              <input className={field} type="number" min={1} placeholder="e.g. 50" value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value })} />
            </label>
          </div>
          <label className="mt-5 flex cursor-pointer items-center gap-3 text-[13px] font-semibold text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-red-600" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
            Active — can be applied at billing
          </label>
          <button type="submit" disabled={busy} className="mt-6 h-[52px] w-full rounded-xl bg-red-600 text-[14px] font-extrabold uppercase tracking-[0.06em] text-white shadow-[0_10px_22px_-12px_rgba(220,38,38,.9)] transition hover:bg-red-700 active:scale-[.99] disabled:opacity-50">
            {f.id ? "Save changes" : "Create coupon"}
          </button>
        </form>

        {/* ---------- list ---------- */}
        <section className="rounded-[26px] border border-slate-100 bg-white p-6 shadow-[0_2px_12px_-4px_rgba(15,23,42,.1)] sm:p-8">
          <h2 className="mb-5 text-[18px] font-bold text-slate-900">All Coupons ({s.coupons.length})</h2>
          <SearchBox value={q} onChange={setQ} placeholder="Search coupons by code…" className="mb-5 h-11 rounded-xl bg-slate-50 shadow-none" />
          {!list.length ? (
            <Empty icon="coupon" title={s.coupons.length ? "No coupons match" : "No coupons yet"}>
              {s.coupons.length ? null : "Create one on the left — it shows up in Billing straight away."}
            </Empty>
          ) : (
            <ul className="adm-scroll max-h-[640px] space-y-3 overflow-y-auto pr-1">
              {list.map((c) => {
                const st = couponStatus(c);
                return (
                  <li key={c.id} className={cx("rounded-2xl border border-stone-200/70 bg-[#f8f7f2] p-4 transition", f.id === c.id && "ring-2 ring-red-300")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[15px] font-extrabold tracking-wide text-slate-900">{c.code}</p>
                        <p className="mt-1 text-[13px] font-semibold text-emerald-700">
                          {c.percent}% off · min {rupee(c.minOrder)}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {c.limit === null ? "Unlimited uses" : `${Math.max(0, c.limit - c.used)} remaining`} · used {c.used}× · {c.expiresAt ? `expires ${ddmmyyyy(c.expiresAt)}` : "no expiry"}
                        </p>
                        <p className={cx("mt-1 text-[11.5px] font-bold", STATUS[st][1])}>{STATUS[st][0]}</p>
                      </div>
                      <div className="flex shrink-0 gap-3 text-[11px] font-extrabold uppercase">
                        <button type="button" className="text-slate-500 hover:text-slate-900" onClick={() => act("coupon.save", { ...c, active: !c.active })}>
                          {c.active ? "Pause" : "Resume"}
                        </button>
                        <button type="button" className="text-blue-600 hover:underline" onClick={() => edit(c)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-red-600 hover:underline"
                          onClick={async () => {
                            if (await confirm({ title: `Delete ${c.code}?`, body: "Past bills keep the coupon code on record.", ok: "Delete", danger: true })) {
                              const r = await act("coupon.delete", { id: c.id });
                              if (r.ok && f.id === c.id) setF(EMPTY);
                            }
                          }}
                        >
                          Del
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 flex items-center gap-2 text-[12px] text-slate-400">
            <Icon name="billing" size={14} /> Apply a coupon from the Billing screen&apos;s “Apply coupon” menu.
          </p>
        </section>
      </div>
    </Page>
  );
}
