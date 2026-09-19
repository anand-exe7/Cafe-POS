"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { MenuItem, OrderStatus, TableView } from "@/lib/types";
import { rupee } from "@/lib/money";
import { Arrow, Cherry } from "../../../_components/bits";

/* ============================================================
   TABLE MENU — what a guest sees after scanning the table QR.
   Browse → add → send to kitchen → watch status → ask for the bill.
   ============================================================ */

type CSSVars = React.CSSProperties & Record<`--${string}`, string | number>;
type Cart = Record<string, number>;

const sized = (src: string, w: number) => (src.includes("images.unsplash.com") ? src.replace(/([?&])w=\d+/, `$1w=${w}`) : src);

const STEPS: OrderStatus[] = ["new", "preparing", "served"];
const STEP_LABEL: Record<OrderStatus, string> = { new: "Received", preparing: "Preparing", served: "Served", cancelled: "Cancelled" };

/* Cart + remembered guest details live in localStorage, read as an external
   store (in-memory copy is the source of truth if storage is blocked). */
const mem = new Map<string, unknown>();
const subs = new Set<() => void>();
const subscribe = (cb: () => void) => (subs.add(cb), () => void subs.delete(cb));
function peek<T>(key: string, fallback: T): T {
  if (!mem.has(key)) {
    let v: unknown = fallback;
    try {
      const raw = localStorage.getItem(key);
      if (raw) v = JSON.parse(raw);
    } catch {}
    mem.set(key, v);
  }
  return mem.get(key) as T;
}
function put(key: string, v: unknown) {
  mem.set(key, v);
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {}
  subs.forEach((f) => f());
}
function useStored<T>(key: string, fallback: T) {
  const v = useSyncExternalStore(subscribe, () => peek(key, fallback), () => fallback);
  const set = useCallback((next: T | ((prev: T) => T)) => put(key, typeof next === "function" ? (next as (p: T) => T)(peek(key, fallback)) : next), [key, fallback]);
  return [v, set] as const;
}
const NO_CART: Cart = {};
const NO_GUEST = { name: "", phone: "" };
const noop = () => () => {};
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

const time = (t: number) => new Date(t).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

/* ---------------- bottom sheet ---------------- */
function Sheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    panel.current?.focus({ preventScroll: true });
    return () => {
      html.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div className={`tm-sheet ${open ? "is-open" : ""}`} role="dialog" aria-modal="true" aria-label={label} aria-hidden={!open} inert={!open}>
      <button type="button" className="tm-sheet__scrim" aria-label="Close" onClick={onClose} tabIndex={-1} />
      <div className="tm-sheet__panel" ref={panel} tabIndex={-1}>
        <span className="tm-sheet__grip" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

/* ---------------- − qty + ---------------- */
function Stepper({ qty, onChange, max, size = "md", name }: { qty: number; onChange: (n: number) => void; max: number; size?: "md" | "sm"; name: string }) {
  return (
    <span className={`tm-step tm-step--${size}`}>
      <button type="button" onClick={() => onChange(qty - 1)} aria-label={`One less ${name}`}>
        −
      </button>
      <b key={qty} aria-live="polite">
        {qty}
      </b>
      <button type="button" onClick={() => onChange(qty + 1)} disabled={qty >= max} aria-label={`One more ${name}`}>
        +
      </button>
    </span>
  );
}

export default function TableMenu({ initial }: { initial: TableView }) {
  const code = initial.table.code;
  const [view, setView] = useState(initial);
  const [cart, setCart] = useStored<Cart>(`clc-cart-${code}`, NO_CART);
  const [saved] = useStored("clc-guest", NO_GUEST);
  const [q, setQ] = useState("");
  const [eggless, setEggless] = useState(false);
  const [active, setActive] = useState(0);
  const [sheet, setSheet] = useState<null | "cart" | "tab">(null);
  const [placed, setPlaced] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const hello = useSyncExternalStore(noop, greeting, () => "Welcome");
  // null = not typed yet → fall back to what this phone remembered last time
  const [form, setForm] = useState<{ name: string | null; phone: string | null; guests: number; note: string }>({
    name: null,
    phone: null,
    guests: Math.min(12, Math.max(1, initial.table.seats)),
    note: "",
  });
  const guest = { ...form, name: form.name ?? saved.name, phone: form.phone ?? saved.phone };
  const setGuest = (g: typeof guest) => setForm(g);
  const [askDetails, setAskDetails] = useState(false);

  const railRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);

  /* ---------- live refresh (order status, sold-out items) ---------- */
  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/table/${code}`, { cache: "no-store" });
      if (r.ok) setView(await r.json());
    } catch {}
  }, [code]);

  const cooking = !!view.tab?.orders.some((o) => o.status === "new" || o.status === "preparing");
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      t = setTimeout(async () => {
        if (document.visibilityState === "visible") await refresh();
        tick();
      }, cooking ? 5000 : 20000);
    };
    tick();
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [cooking, refresh]);

  /* ---------- derived ---------- */
  const byId = useMemo(() => new Map(view.menu.map((m) => [m.id, m])), [view.menu]);
  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ item: byId.get(id), id, qty }))
    .filter((l) => l.qty > 0);
  const count = lines.reduce((s, l) => s + (l.item ? l.qty : 0), 0);
  const total = lines.reduce((s, l) => s + (l.item ? l.item.price * l.qty : 0), 0);
  const unavailable = lines.filter((l) => !l.item || l.item.soldOut || (l.item.left !== null && l.qty > l.item.left));

  const needle = q.trim().toLowerCase();
  const cats = useMemo(() => {
    const out: { name: string; items: MenuItem[] }[] = [];
    for (const m of view.menu) {
      if (eggless && !m.eggless) continue;
      if (needle && !`${m.name} ${m.description} ${m.category}`.toLowerCase().includes(needle)) continue;
      const c = out.find((x) => x.name === m.category);
      if (c) c.items.push(m);
      else out.push({ name: m.category, items: [m] });
    }
    return out;
  }, [view.menu, eggless, needle]);

  const maxFor = (m: MenuItem) => Math.min(30, m.left ?? 30);

  /* ---------- scroll-spy for the category rail ---------- */
  useEffect(() => {
    const secs = Array.from(document.querySelectorAll<HTMLElement>("[data-cat]"));
    if (!secs.length) return;
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.cat));
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    secs.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [cats.length, needle, eggless]);

  useEffect(() => {
    const rail = railRef.current;
    const chip = rail?.querySelector<HTMLElement>(`[data-chip="${active}"]`);
    if (rail && chip) rail.scrollTo({ left: chip.offsetLeft - rail.clientWidth / 2 + chip.clientWidth / 2, behavior: "smooth" });
  }, [active]);

  const jump = (i: number) => {
    document.querySelector(`[data-cat="${i}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /* ---------- cart ops (+ a little arc from the button to the basket) ---------- */
  const fly = (from: HTMLElement) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const a = from.getBoundingClientRect();
    const b = count > 0 && badgeRef.current ? badgeRef.current.getBoundingClientRect() : { left: window.innerWidth / 2 - 90, top: window.innerHeight - 52, width: 28, height: 28 };
    const x0 = a.left + a.width / 2 - 8, y0 = a.top + a.height / 2 - 8;
    const x1 = b.left + b.width / 2 - 8, y1 = b.top + b.height / 2 - 8;
    const outer = document.createElement("span");
    const inner = document.createElement("i");
    outer.className = "tm-fly";
    outer.appendChild(inner);
    document.body.appendChild(outer);
    const dur = 620;
    outer.animate([{ transform: `translateX(${x0}px)` }, { transform: `translateX(${x1}px)` }], { duration: dur, easing: "linear", fill: "forwards" });
    inner
      .animate([{ transform: `translateY(${y0}px) scale(1)` }, { transform: `translateY(${y1}px) scale(.55)` }], { duration: dur, easing: "cubic-bezier(.45,-0.7,.75,1)", fill: "forwards" })
      .finished.then(() => outer.remove(), () => outer.remove());
  };

  const setQty = (id: string, n: number) =>
    setCart((c) => {
      const next = { ...c };
      if (n <= 0) delete next[id];
      else next[id] = n;
      return next;
    });

  const add = (m: MenuItem, e: React.MouseEvent<HTMLElement>) => {
    fly(e.currentTarget);
    setQty(m.id, Math.min(maxFor(m), (cart[m.id] ?? 0) + 1));
  };

  /* ---------- place order ---------- */
  const needDetails = !view.tab || !view.tab.hasPhone || askDetails;

  const place = async () => {
    setErr("");
    if (!count) return;
    if (unavailable.length) return setErr("Some items changed — please adjust the ones marked below.");
    if (needDetails) {
      if (!view.tab && !guest.name.trim()) return setErr("Please tell us your name.");
      if (!/^(\+?91)?[6-9]\d{9}$/.test(guest.phone.replace(/[\s-]/g, ""))) return setErr("Please enter a valid 10-digit mobile number.");
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/table/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "order",
          items: lines.map((l) => ({ productId: l.id, qty: l.qty })),
          name: guest.name,
          phone: needDetails ? guest.phone : "",
          guests: guest.guests,
          note: guest.note,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setErr(data.error || "Couldn't send your order. Please try again.");
        if (/mobile/i.test(data.error ?? "")) setAskDetails(true);
        refresh();
        return;
      }
      put("clc-guest", { name: guest.name, phone: guest.phone });
      setView(data.view);
      setCart(NO_CART);
      setForm((g) => ({ ...g, note: "" }));
      setAskDetails(false);
      setSheet(null);
      setPlaced(data.no);
    } catch {
      setErr("You seem to be offline. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const askBill = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/table/${code}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "bill" }) });
      const data = await r.json();
      if (r.ok) setView(data.view);
    } finally {
      setBusy(false);
    }
  };

  const closeSheet = useCallback(() => setSheet(null), []);
  const tab = view.tab;
  const liveOrders = tab?.orders.filter((o) => o.status !== "cancelled").length ?? 0;

  return (
    <div className="tm">
      {/* ================= header ================= */}
      <header className="tm-top">
        <Link href={`/t/${code}`} className="tm-top__back" aria-label="Back to the welcome page">
          <Arrow size={18} />
        </Link>
        <Link href={`/t/${code}`} className="tm-brand">
          <Cherry size={22} />
          <em>Chef Loving</em>
        </Link>
        {tab ? (
          <button type="button" className="tm-tabbtn" onClick={() => setSheet("tab")}>
            <span>Your tab</span>
            <b>{rupee(tab.total)}</b>
          </button>
        ) : (
          <span className="tm-table" aria-label={`You're at table ${view.table.label}`}>
            <small>Table</small>
            <b>{view.table.label}</b>
          </span>
        )}
      </header>

      {/* ================= intro ================= */}
      <section className="tm-hero">
        <p className="tm-hero__hi">
          {hello}
          {tab?.name ? `, ${tab.name.split(" ")[0]}` : ""} ✺
        </p>
        <h1 className="tm-hero__t">
          What are we <em>having?</em>
        </h1>
        <p className="tm-hero__sub">
          Order from <b>Table {view.table.label}</b>. We&apos;ll bring it over — pay at the counter when you&apos;re done.
        </p>
        <div className="tm-tools">
          <label className="tm-search">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="m20 20-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="sr-only">Search the menu</span>
            <input type="search" placeholder="Brownie, chai, cheesecake…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <button type="button" className="tm-egg" aria-pressed={eggless} onClick={() => setEggless((v) => !v)}>
            <i className="tm-mark tm-mark--veg" aria-hidden="true" />
            Eggless only
          </button>
        </div>
      </section>

      {/* ================= category rail ================= */}
      {!needle && cats.length > 1 && (
        <nav className="tm-rail" ref={railRef} aria-label="Menu sections">
          {cats.map((c, i) => (
            <button type="button" key={c.name} data-chip={i} className={active === i ? "is-on" : ""} onClick={() => jump(i)}>
              {c.name}
              <small>{c.items.length}</small>
            </button>
          ))}
        </nav>
      )}

      {/* ================= menu ================= */}
      <main className="tm-menu">
        {cats.length === 0 && (
          <p className="tm-empty">
            Nothing matches{needle ? <> &ldquo;{q}&rdquo;</> : ""}. <button type="button" onClick={() => { setQ(""); setEggless(false); }}>Show everything</button>
          </p>
        )}
        {cats.map((c, ci) => (
          <section key={c.name} className="tm-cat" data-cat={ci} aria-labelledby={`cat-${ci}`}>
            <header className="tm-cat__head">
              <span>({String(ci + 1).padStart(2, "0")})</span>
              <h2 id={`cat-${ci}`}>{c.name}</h2>
            </header>
            <ul>
              {c.items.map((m, i) => {
                const qty = cart[m.id] ?? 0;
                return (
                  <li key={m.id} className={`tm-item ${m.soldOut ? "is-out" : ""} ${qty ? "is-in" : ""}`} style={{ "--i": Math.min(i, 8) } as CSSVars}>
                    <div className="tm-item__img">
                      {m.image ? <img src={sized(m.image, 280)} alt="" loading={ci < 1 ? "eager" : "lazy"} decoding="async" /> : <span className="tm-item__ph">{m.name.slice(0, 1)}</span>}
                      {m.soldOut && <span className="tm-item__out">Sold out</span>}
                    </div>
                    <div className="tm-item__body">
                      <h3>
                        <i className={`tm-mark ${m.eggless ? "tm-mark--veg" : "tm-mark--egg"}`} title={m.eggless ? "Eggless" : "Contains egg"} aria-label={m.eggless ? "Eggless" : "Contains egg"} />
                        {m.name}
                      </h3>
                      {m.tags.includes("bestseller") && <span className="tm-tag">★ Bestseller</span>}
                      {m.tags.includes("new") && <span className="tm-tag tm-tag--new">New</span>}
                      {m.description && <p>{m.description}</p>}
                      <div className="tm-item__foot">
                        <b className="tm-price">{rupee(m.price)}</b>
                        {m.left !== null && !m.soldOut && <span className="tm-left">Only {m.left} left</span>}
                        <span className="tm-item__act">
                          {m.soldOut ? null : qty ? (
                            <Stepper qty={qty} max={maxFor(m)} name={m.name} onChange={(n) => setQty(m.id, n)} />
                          ) : (
                            <button type="button" className="tm-add" onClick={(e) => add(m, e)} aria-label={`Add ${m.name}`}>
                              Add <span aria-hidden="true">+</span>
                            </button>
                          )}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <footer className="tm-foot">
          <Cherry size={20} />
          <p>
            Allergies or a celebration at the table? Add a note with your order — the kitchen reads every one.
          </p>
        </footer>
      </main>

      {/* ================= cart bar ================= */}
      <div className={`tm-cbar ${count ? "is-on" : ""}`} aria-hidden={!count}>
        <button type="button" onClick={() => setSheet("cart")} tabIndex={count ? 0 : -1}>
          <span className="tm-cbar__n" ref={badgeRef} key={count}>
            {count}
          </span>
          <span className="tm-cbar__t">
            View order
            <small>{count === 1 ? "1 item" : `${count} items`} · Table {view.table.label}</small>
          </span>
          <b>{rupee(total)}</b>
          <Arrow size={18} />
        </button>
      </div>

      {/* ================= cart sheet ================= */}
      <Sheet open={sheet === "cart"} onClose={closeSheet} label="Your order">
        <div className="tm-ticket">
          <div className="tm-ticket__head">
            <span>Order ticket</span>
            <span>Table {view.table.label}</span>
          </div>
          {lines.length === 0 ? (
            <p className="tm-ticket__empty">Your order is empty. Add something tasty!</p>
          ) : (
            <ul className="tm-lines">
              {lines.map((l) => {
                const bad = !l.item || l.item.soldOut || (l.item.left !== null && l.qty > l.item.left);
                return (
                  <li key={l.id} className={bad ? "is-bad" : ""}>
                    <div>
                      <b>{l.item?.name ?? "Item no longer available"}</b>
                      {l.item && <small>{rupee(l.item.price)} each</small>}
                      {bad && l.item && <em>{l.item.soldOut ? "Just sold out" : `Only ${l.item.left} left`}</em>}
                    </div>
                    {l.item && !l.item.soldOut ? (
                      <Stepper size="sm" qty={l.qty} max={maxFor(l.item)} name={l.item.name} onChange={(n) => setQty(l.id, n)} />
                    ) : (
                      <button type="button" className="tm-linkbtn" onClick={() => setQty(l.id, 0)}>
                        Remove
                      </button>
                    )}
                    <span className="tm-lines__amt">{l.item ? rupee(l.item.price * l.qty) : "—"}</span>
                  </li>
                );
              })}
            </ul>
          )}

          <label className="tm-field">
            <span>Anything the kitchen should know?</span>
            <textarea rows={2} maxLength={240} placeholder="Less sugar in the chai, warm the brownie, a candle for the birthday…" value={guest.note} onChange={(e) => setGuest({ ...guest, note: e.target.value })} />
          </label>

          {needDetails && (
            <div className="tm-details">
              <p className="tm-details__why">So we can send your bill on WhatsApp</p>
              <div className="tm-details__row">
                {!view.tab && (
                  <label className="tm-field">
                    <span>Your name</span>
                    <input autoComplete="given-name" maxLength={60} value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} placeholder="Priya" />
                  </label>
                )}
                <label className="tm-field">
                  <span>Mobile (WhatsApp)</span>
                  <input inputMode="tel" autoComplete="tel-national" maxLength={14} value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} placeholder="98765 43210" />
                </label>
              </div>
              {!view.tab && (
                <div className="tm-guests">
                  <span>Guests at the table</span>
                  <Stepper size="sm" qty={guest.guests} max={20} name="guest" onChange={(n) => setGuest({ ...guest, guests: Math.max(1, n) })} />
                </div>
              )}
            </div>
          )}

          <div className="tm-ticket__total">
            <span>Total</span>
            <b>{rupee(total)}</b>
          </div>
          {err && (
            <p className="tm-err" role="alert">
              {err}
            </p>
          )}
          <button type="button" className="tm-send" disabled={!count || busy} onClick={place}>
            {busy ? "Sending…" : "Send to the kitchen"}
            {!busy && <Arrow size={18} />}
          </button>
          <p className="tm-fine">Pay at the counter when you leave · prices include taxes</p>
        </div>
      </Sheet>

      {/* ================= tab sheet ================= */}
      <Sheet open={sheet === "tab"} onClose={closeSheet} label="Your tab">
        {tab ? (
          <div className="tm-tab">
            <div className="tm-tab__head">
              <div>
                <small>Your tab · Table {view.table.label}</small>
                <b>{rupee(tab.total)}</b>
              </div>
              <span>{liveOrders === 1 ? "1 order" : `${liveOrders} orders`}</span>
            </div>
            <ol className="tm-orders">
              {[...tab.orders].reverse().map((o) => {
                const at = STEPS.indexOf(o.status);
                return (
                  <li key={o.no} className={o.status === "cancelled" ? "is-x" : ""}>
                    <div className="tm-orders__top">
                      <b>Order #{o.no}</b>
                      <span>{time(o.createdAt)}</span>
                    </div>
                    {o.status === "cancelled" ? (
                      <p className="tm-orders__x">Cancelled by the kitchen — please ask our staff.</p>
                    ) : (
                      <div className="tm-track" style={{ "--at": at } as CSSVars}>
                        {STEPS.map((s, i) => (
                          <span key={s} className={i < at ? "is-done" : i === at ? "is-now" : ""}>
                            <i />
                            {STEP_LABEL[s]}
                          </span>
                        ))}
                      </div>
                    )}
                    <ul>
                      {o.items.map((it, i) => (
                        <li key={i}>
                          <span>
                            {it.qty} × {it.name}
                          </span>
                          <span>{rupee(it.price * it.qty)}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ol>
            {tab.billRequested ? (
              <div className="tm-billed">
                <b>We&apos;re getting your bill ready.</b>
                <span>Please pay at the counter on your way out — thank you for visiting!</span>
              </div>
            ) : (
              <button type="button" className="tm-send tm-send--ghost" disabled={busy} onClick={askBill}>
                I&apos;m done — get my bill ready
              </button>
            )}
            <button type="button" className="tm-send" onClick={() => setSheet(null)}>
              Order something else
            </button>
          </div>
        ) : (
          <p className="tm-ticket__empty">Nothing on your tab yet.</p>
        )}
      </Sheet>

      {/* ================= sent! ================= */}
      {placed !== null && (
        <div className="tm-done" role="status">
          <div className="tm-done__card">
            <svg viewBox="0 0 80 80" className="tm-done__tick" aria-hidden="true">
              <circle cx="40" cy="40" r="36" />
              <path d="M24 41 l11 11 l22 -24" />
            </svg>
            <small>Order #{placed}</small>
            <h2>
              Sent to the <em>kitchen!</em>
            </h2>
            <p>We&apos;ll bring it to Table {view.table.label}. You can keep adding to your order anytime.</p>
            <div className="tm-done__btns">
              <button type="button" className="tm-send tm-send--ghost" onClick={() => { setPlaced(null); setSheet("tab"); }}>
                Track order
              </button>
              <button type="button" className="tm-send" onClick={() => setPlaced(null)}>
                Keep browsing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
