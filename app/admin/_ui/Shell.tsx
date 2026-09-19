"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAdmin } from "./Store";
import { Btn, Field, Icon, Modal, cx, inputCls, type IconName } from "./kit";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/admin", label: "Tables", icon: "tables" },
  { href: "/admin/analytics", label: "Analytics", icon: "chart" },
  { href: "/admin/orders", label: "Orders", icon: "orders" },
  { href: "/admin/billing", label: "Billing", icon: "billing" },
  { href: "/admin/coupons", label: "Coupons", icon: "coupon" },
  { href: "/admin/inventory", label: "Inventory", icon: "box" },
];

const Cherry = () => (
  <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
    <path d="M17 3c-1 6-4 10-8 14M17 3c2 5 5 9 8 11" stroke="#6b8f3a" strokeWidth="2" fill="none" strokeLinecap="round" />
    <path d="M17 3c3-1 6 0 8 2-3 1-6 0-8-2z" fill="#8fae55" />
    <circle cx="9" cy="22" r="6.5" fill="#d7263d" />
    <circle cx="23" cy="20" r="6.5" fill="#b81d33" />
    <circle cx="7" cy="20" r="1.8" fill="#fff" opacity=".55" />
  </svg>
);

function Settings({ onClose }: { onClose: () => void }) {
  const { s, act, toast } = useAdmin();
  const [url, setUrl] = useState(s.settings.publicUrl);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);

  const saveUrl = async () => {
    const r = await act("settings.update", { publicUrl: url });
    if (r.ok) toast({ kind: "ok", title: "Saved. Re-print QR cards if the address changed." });
  };
  const changePw = async () => {
    setBusy(true);
    const r = await fetch("/api/admin/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: cur, next }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return toast({ kind: "err", title: d.error ?? "Couldn't change the password." });
    setCur("");
    setNext("");
    toast({ kind: "ok", title: "Password changed. Other devices have been signed out." });
  };

  return (
    <Modal open onClose={onClose} title="Settings">
      <div className="space-y-6">
        <div>
          <Field label="Public address for QR codes" hint="The address phones use to reach this app, e.g. https://order.cheflovingcakes.in or http://192.168.1.20:3000. Leave blank to use the address you're on now.">
            <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </Field>
          <Btn kind="dark" className="mt-3" onClick={saveUrl}>
            Save address
          </Btn>
        </div>
        <div className="border-t border-slate-100 pt-5">
          <p className="mb-3 text-[13px] font-bold text-slate-800">Change admin password</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Current">
              <input type="password" className={inputCls} value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
            </Field>
            <Field label="New (6+ characters)">
              <input type="password" className={inputCls} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            </Field>
          </div>
          <Btn kind="red" className="mt-3" disabled={!cur || next.length < 6 || busy} onClick={changePw}>
            Change password
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { s, floor, toasts, dismiss, pending, answer, printNode, sound, setSound } = useAdmin();
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) {
    setLastPath(path);
    setMenu(false);
  }

  const fresh = s.orders.filter((o) => o.status === "new").length;
  const billReq = floor.filter((f) => f.billRequested).length;
  const busy = floor.filter((f) => f.session).length;
  const low = s.products.filter((p) => p.active && p.stock !== null && p.stock <= p.lowAt).length;

  const badge: Record<string, React.ReactNode> = {
    "/admin": busy ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{busy}/{s.tables.length}</span> : null,
    "/admin/orders": fresh ? <span className="adm-pulse grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{fresh}</span> : null,
    "/admin/billing": billReq ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-amber-950">{billReq}</span> : null,
    "/admin/inventory": low ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-700">{low}</span> : null,
  };

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = fresh ? `(${fresh}) ${base}` : base;
  }, [fresh, path]);

  const signOut = async () => {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.replace("/admin/login");
  };

  const active = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));

  const side = (
    <div className="flex h-full flex-col">
      <Link href="/admin" className="flex items-center gap-3 px-5 pb-6 pt-6">
        <Cherry />
        <span className="leading-tight">
          <b className="block text-[18px] italic text-slate-900" style={{ fontFamily: "var(--font-display), Georgia, serif", fontWeight: 500 }}>
            Chef Loving
          </b>
          <small className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Admin console</small>
        </span>
      </Link>
      <nav className="flex-1 space-y-1 px-3" aria-label="Admin">
        {NAV.map((n) => {
          const on = active(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cx(
                "group relative flex h-11 items-center gap-3 rounded-xl px-3 text-[14px] font-semibold transition",
                on ? "bg-red-50 text-red-600" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              {on && <span className="absolute -left-3 top-2 bottom-2 w-1 rounded-r bg-red-600" />}
              <Icon name={n.icon} size={19} />
              <span className="flex-1">{n.label}</span>
              {badge[n.href]}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-1 border-t border-slate-100 px-3 py-4">
        <button type="button" onClick={() => setSound(!sound)} className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[13px] font-semibold text-slate-600 hover:bg-slate-50">
          <Icon name={sound ? "bell" : "belloff"} size={17} />
          {sound ? "Order chime on" : "Order chime off"}
        </button>
        <a href="/" target="_blank" rel="noopener noreferrer" className="flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold text-slate-600 hover:bg-slate-50">
          <Icon name="globe" size={17} />
          Guest website
        </a>
        <button type="button" onClick={() => setSettings(true)} className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[13px] font-semibold text-slate-600 hover:bg-slate-50">
          <Icon name="sliders" size={17} />
          Settings
        </button>
        <button type="button" onClick={signOut} className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[13px] font-semibold text-slate-600 hover:bg-red-50 hover:text-red-600">
          <Icon name="logout" size={17} />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="adm-app">
        {/* sidebar — desktop */}
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-slate-200/70 bg-white lg:block">{side}</aside>

        {/* top bar — mobile */}
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
          <button type="button" onClick={() => setMenu(true)} className="grid h-10 w-10 place-items-center rounded-xl text-slate-700 hover:bg-slate-100" aria-label="Open menu">
            <Icon name="menu" size={20} />
          </button>
          <b className="flex-1 text-[16px] italic" style={{ fontFamily: "var(--font-display), Georgia, serif", fontWeight: 500 }}>
            Chef Loving · Admin
          </b>
          {fresh > 0 && (
            <Link href="/admin/orders" className="rounded-full bg-red-600 px-3 py-1 text-[12px] font-bold text-white">
              {fresh} new
            </Link>
          )}
        </header>
        {menu && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button type="button" className="adm-scrim absolute inset-0 bg-slate-900/40" onClick={() => setMenu(false)} aria-label="Close menu" />
            <aside className="adm-in absolute inset-y-0 left-0 w-[270px] bg-white shadow-2xl">{side}</aside>
          </div>
        )}

        <div className="lg:pl-[248px]">
          <main className="mx-auto max-w-[1480px] p-3 sm:p-6">{children}</main>
          <footer className="mx-auto flex max-w-[1480px] flex-col items-center gap-3 border-t border-slate-200 px-6 py-7 text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500 sm:flex-row sm:justify-between">
            <span>© 2026 All rights reserved. Chef Loving Cakes.</span>
            <span>
              Powered by <span className="text-red-600">Cenexa Systems</span> ©2026
            </span>
            <span className="text-[13px] normal-case tracking-normal text-red-600" style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic", fontWeight: 600 }}>
              • Baked fresh, served warm.
            </span>
          </footer>
        </div>

        {/* toasts */}
        <div className="pointer-events-none fixed right-3 top-3 z-[90] flex w-[min(380px,calc(100%-24px))] flex-col gap-2 sm:right-5 sm:top-5" aria-live="polite">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={cx(
                "adm-in pointer-events-auto flex items-start gap-3 rounded-2xl border bg-white p-4 shadow-[0_12px_32px_-12px_rgba(15,23,42,.35)]",
                t.kind === "err" ? "border-red-200" : t.kind === "order" ? "border-red-200" : t.kind === "bill" ? "border-amber-200" : "border-slate-200",
              )}
            >
              <span
                className={cx(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                  t.kind === "err" && "bg-red-50 text-red-600",
                  t.kind === "order" && "bg-red-600 text-white",
                  t.kind === "bill" && "bg-amber-400 text-amber-950",
                  (t.kind === "ok" || t.kind === "info") && "bg-emerald-50 text-emerald-600",
                )}
              >
                <Icon name={t.kind === "err" ? "alert" : t.kind === "order" ? "utensils" : t.kind === "bill" ? "billing" : "check"} size={17} />
              </span>
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  if (t.href) router.push(t.href);
                  dismiss(t.id);
                }}
              >
                <b className="block text-[13.5px] text-slate-900">{t.title}</b>
                {t.body && <span className="mt-0.5 block truncate text-[12.5px] text-slate-500">{t.body}</span>}
              </button>
              <button type="button" onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-slate-700" aria-label="Dismiss">
                <Icon name="x" size={15} />
              </button>
            </div>
          ))}
        </div>

        {/* confirm */}
        <Modal
          open={!!pending}
          onClose={() => answer(false)}
          title={pending?.title ?? ""}
          footer={
            <>
              <Btn onClick={() => answer(false)}>Cancel</Btn>
              <Btn kind={pending?.danger ? "red" : "dark"} onClick={() => answer(true)}>
                {pending?.ok ?? "Confirm"}
              </Btn>
            </>
          }
        >
          <div className="text-[14px] leading-relaxed text-slate-600">{pending?.body}</div>
        </Modal>

        {settings && <Settings onClose={() => setSettings(false)} />}
        <div id="adm-layer" />
      </div>
      <div className="adm-print">{printNode}</div>
    </>
  );
}
