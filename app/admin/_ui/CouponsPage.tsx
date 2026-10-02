"use client";

import { useState } from "react";
import type { Coupon } from "@/lib/types";
import { couponStatus, rupee } from "@/lib/money";
import { useAdmin } from "./Store";
import { Btn, Empty, Modal, Page, PageHead, SearchBox, cx, labelCls } from "./kit";

type Form = { id?: string; code: string; percent: string; minOrder: string; expiresAt: string; limit: string; active: boolean };
const EMPTY: Form = { code: "", percent: "", minOrder: "", expiresAt: "", limit: "", active: true };

const field = "h-10 w-full rounded-lg bg-slate-50 px-3 text-[13.5px] font-medium text-slate-900 outline-none ring-red-100 transition placeholder:text-slate-400 focus:bg-white focus:ring-4";
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
  const [open, setOpen] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await act<Coupon>("coupon.save", { ...f, limit: f.limit || null, minOrder: f.minOrder || 0 });
    setBusy(false);
    if (r.ok) {
      toast({ kind: "ok", title: f.id ? `${r.result.code} updated` : `${r.result.code} created — it's ready in Billing.` });
      setF(EMPTY);
      setOpen(false);
    }
  };

  const edit = (c: Coupon) =>
    setF({ id: c.id, code: c.code, percent: String(c.percent), minOrder: c.minOrder ? String(c.minOrder) : "", expiresAt: c.expiresAt ?? "", limit: c.limit === null ? "" : String(c.limit), active: c.active });

  const list = s.coupons.filter((c) => !q || c.code.toLowerCase().includes(q.toLowerCase()));

  const editOpen = (c: Coupon) => {
    edit(c);
    setOpen(true);
  };
  const newOpen = () => {
    setF(EMPTY);
    setOpen(true);
  };
  const stat = (c: Coupon) => {
    const st = couponStatus(c);
    return <span className={cx("text-[11.5px] font-bold", STATUS[st][1])}>{STATUS[st][0]}</span>;
  };

  return (
    <Page>
      <PageHead
        title="Coupon Management"
        sub="Discounts apply to the item subtotal only. Guests can enter a code from their phone; staff can apply one in Billing."
        right={
          <span className="flex gap-2">
            <Btn icon="refresh" onClick={() => refresh()} className="h-10">
              Refresh
            </Btn>
            <Btn kind="red" icon="plus" onClick={newOpen} className="h-10">
              New coupon
            </Btn>
          </span>
        }
      />

      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,.1)] sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[16px] font-bold text-slate-900">All Coupons ({s.coupons.length})</h2>
          <SearchBox value={q} onChange={setQ} placeholder="Search by code…" className="h-10 w-full rounded-xl bg-slate-50 shadow-none sm:w-64" />
        </div>
        {!list.length ? (
          <Empty icon="coupon" title={s.coupons.length ? "No coupons match" : "No coupons yet"}>
            {s.coupons.length ? null : "Create one — guests and staff can use it straight away."}
          </Empty>
        ) : (
          <ul className="adm-scroll max-h-[640px] divide-y divide-slate-100 overflow-y-auto">
            {list.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <b className="w-32 shrink-0 truncate text-[14px] tracking-wide text-slate-900">{c.code}</b>
                <span className="w-28 shrink-0 text-[13px] font-semibold text-emerald-700">
                  {c.percent}% off{c.minOrder ? ` · min ${rupee(c.minOrder)}` : ""}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-slate-400">
                  {c.limit === null ? "Unlimited" : `${Math.max(0, c.limit - c.used)} left`} · used {c.used}× · {c.expiresAt ? `expires ${ddmmyyyy(c.expiresAt)}` : "no expiry"}
                </span>
                {stat(c)}
                <div className="flex shrink-0 gap-3 text-[11px] font-extrabold uppercase">
                  <button type="button" className="text-slate-500 hover:text-slate-900" onClick={() => act("coupon.save", { ...c, active: !c.active })}>
                    {c.active ? "Pause" : "Resume"}
                  </button>
                  <button type="button" className="text-blue-600 hover:underline" onClick={() => editOpen(c)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    onClick={async () => {
                      if (await confirm({ title: `Delete ${c.code}?`, body: "Past bills keep the coupon code on record.", ok: "Delete", danger: true })) await act("coupon.delete", { id: c.id });
                    }}
                  >
                    Del
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={f.id ? "Edit coupon" : "New coupon"}
        footer={
          <>
            <Btn onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn kind="red" disabled={busy} onClick={() => (document.getElementById("coupon-form") as HTMLFormElement | null)?.requestSubmit()}>
              {f.id ? "Save changes" : "Create coupon"}
            </Btn>
          </>
        }
      >
        <form id="coupon-form" onSubmit={save} className="space-y-4">
          <label className="block">
            <span className={labelCls}>Coupon code *</span>
            <span className="relative block">
              <input className={cx(field, "pr-24 uppercase")} placeholder="E.G. SUMMER20" value={f.code} maxLength={24} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} required />
              <button type="button" onClick={() => setF({ ...f, code: gen() })} className="absolute right-1.5 top-1/2 h-7 -translate-y-1/2 rounded-md bg-red-600 px-3 text-[12px] font-bold text-white hover:bg-red-700">
                Generate
              </button>
            </span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className={labelCls}>Discount % *</span>
              <input className={field} type="number" min={1} max={100} step="0.5" placeholder="15" value={f.percent} onChange={(e) => setF({ ...f, percent: e.target.value })} required />
            </label>
            <label>
              <span className={labelCls}>Min order (₹)</span>
              <input className={field} type="number" min={0} placeholder="1000" value={f.minOrder} onChange={(e) => setF({ ...f, minOrder: e.target.value })} />
            </label>
            <label>
              <span className={labelCls}>Expiry date</span>
              <input className={field} type="date" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} />
            </label>
            <label>
              <span className={labelCls}>Usage limit</span>
              <input className={field} type="number" min={1} placeholder="50" value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value })} />
            </label>
          </div>
          <label className="flex cursor-pointer items-center gap-3 text-[13px] font-semibold text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-red-600" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
            Active — can be applied by guests and at billing
          </label>
        </form>
      </Modal>
    </Page>
  );
}
