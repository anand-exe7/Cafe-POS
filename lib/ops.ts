import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { ApiError, mutate, read } from "./store";
import { code, uid } from "./seed";
import { computeBill, round2 } from "./money";
import { hashPassword } from "./auth";
import { db, type Db, type Tx } from "./db";
import { bills, coupons, meta, orders, products, sessions, settings, staffUsers, tables } from "./db/schema";
import type { AdminState, Bill, MenuItem, Order, OrderItem, OrderStatus, PayMethod, Product, PublicUser, Session, StaffUser, Table, TableCard, TableClose, TableView } from "./types";

/* Every read/write the app makes, with validation. Route handlers are thin wrappers.
   Writes run inside store.mutate(), which serializes them and rolls back on error. */

type Args = Record<string, unknown>;
type Q = Db | Tx;

const str = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown) => {
  const n = typeof v === "string" && v.trim() === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const int = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Math.floor(num(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const optNum = (v: unknown) => (v === null || v === undefined || v === "" ? null : num(v));

/** 10-digit Indian mobile, tolerant of +91 / spaces. Returns "" if absent, null if invalid. */
function mobile(v: unknown): string | null {
  const d = str(v, 24).replace(/\D/g, "");
  if (!d) return "";
  const ten = d.length === 12 && d.startsWith("91") ? d.slice(2) : d.length === 11 && d.startsWith("0") ? d.slice(1) : d;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
}

const first = async <T>(rows: Promise<T[]>): Promise<T | null> => (await rows)[0] ?? null;

async function must<T>(rows: Promise<T[]>, what: string): Promise<T> {
  const hit = await first(rows);
  if (!hit) throw new ApiError(`${what} not found — it may have just been removed.`, 404);
  return hit;
}

/** The fields of a user that may leave the server. Named one by one on purpose:
    anything added to StaffUser later stays server-side until it is listed here. */
const publicUser = (u: StaffUser): PublicUser => ({ id: u.id, name: u.name, mobile: u.mobile, email: u.email, createdAt: u.createdAt });

async function tableByCode(q: Q, c: string) {
  const t = await first(q.select().from(tables).where(eq(tables.code, String(c).toLowerCase())));
  if (!t) throw new ApiError("This table's QR code is no longer active. Please ask our staff for help.", 404);
  return t;
}

export async function openSession(q: Q, t: Table): Promise<Session | null> {
  if (!t.sessionId) return null;
  return first(q.select().from(sessions).where(and(eq(sessions.id, t.sessionId), eq(sessions.status, "open"))));
}

/* ============================== customer side ============================== */

export function menuOf(all: Product[]): MenuItem[] {
  const order: string[] = [];
  for (const p of all) if (!order.includes(p.category)) order.push(p.category);
  return all
    .filter((p) => p.active)
    .sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || a.createdAt - b.createdAt)
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price,
      description: p.description,
      image: p.image,
      eggless: p.eggless,
      tags: p.tags,
      soldOut: p.stock !== null && p.stock <= 0,
      left: p.stock !== null && p.stock <= p.lowAt ? p.stock : null,
    }));
}

/** How long after a tab closes the guest's phone still gets the goodbye. */
const CLOSE_WINDOW = 20 * 60_000;

async function lastClose(q: Q, t: Table): Promise<TableClose | null> {
  const [hit] = await q
    .select({ s: sessions, b: bills })
    .from(sessions)
    .leftJoin(bills, eq(bills.id, sessions.billId))
    .where(and(eq(sessions.tableId, t.id), ne(sessions.status, "open"), sql`${sessions.closedAt} is not null`))
    .orderBy(desc(sessions.closedAt))
    .limit(1);
  if (!hit || Date.now() - hit.s.closedAt! > CLOSE_WINDOW) return null;
  const { s: last, b: bill } = hit;
  return bill && bill.status === "completed"
    ? { kind: "paid", invoiceNo: bill.invoiceNo, total: bill.total, itemCount: bill.itemCount, name: bill.customerName, at: last.closedAt! }
    : { kind: "cleared", invoiceNo: null, total: 0, itemCount: 0, name: last.customerName, at: last.closedAt! };
}

/* Every query is a network round trip to the database, so a view is built as two
   hops: the table, then everything else at once. */
async function view(q: Q, t: Table): Promise<TableView> {
  const sid = t.sessionId;
  const [all, name, s, list, closed] = await Promise.all([
    q.select().from(products).orderBy(asc(products.createdAt), asc(products.id)),
    shopNameOf(q),
    sid ? first(q.select().from(sessions).where(and(eq(sessions.id, sid), eq(sessions.status, "open")))) : Promise.resolve(null),
    sid ? q.select().from(orders).where(eq(orders.sessionId, sid)).orderBy(asc(orders.createdAt), asc(orders.no)) : Promise.resolve([] as Order[]),
    sid ? Promise.resolve(null) : lastClose(q, t),
  ]);
  const open = s ? list : [];
  return {
    table: { label: t.label, seats: t.seats, code: t.code },
    shopName: name,
    menu: menuOf(all),
    closed: s ? null : closed ?? (sid ? await lastClose(q, t) : null),
    tab: s
      ? {
          orders: open.map((o) => ({ no: o.no, items: o.items, status: o.status, subtotal: o.subtotal, createdAt: o.createdAt })),
          total: round2(open.filter((o) => o.status !== "cancelled").reduce((a, o) => a + o.subtotal, 0)),
          billRequested: !!s.billRequestedAt,
          name: s.customerName,
          hasPhone: !!s.customerPhone,
        }
      : null,
  };
}

async function shopNameOf(q: Q) {
  return (await first(q.select({ n: settings.shopName }).from(settings).where(eq(settings.id, 1))))?.n ?? "Cafe";
}

export function tableView(c: string) {
  return read(async (q) => view(q, await tableByCode(q, c)));
}

/** The table directory the front door offers to a guest who couldn't scan the QR. */
export async function tableList(): Promise<TableCard[]> {
  const rows = await db.select({ label: tables.label, seats: tables.seats, code: tables.code }).from(tables);
  return rows.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));
}

/** The shop's name, for pages that show it without loading a whole table. */
export function shopName(): Promise<string> {
  return shopNameOf(db);
}

/** Validates the lines, takes stock, opens a tab if needed and files the order. */
async function addOrder(tx: Tx, t: Table, a: Args, opts: { fromCustomer: boolean }): Promise<Order> {
  const now = Date.now();
  const raw = Array.isArray(a.items) ? (a.items as Args[]) : [];
  if (raw.length > 60) throw new ApiError("That's a big order — please split it in two.");
  const want = new Map<string, number>();
  for (const r of raw) {
    const id = str(r?.productId, 40);
    const q = Math.floor(num(r?.qty));
    if (id && q >= 1) want.set(id, (want.get(id) ?? 0) + q);
  }
  if (!want.size) throw new ApiError("The order is empty.");

  const found = await tx.select().from(products).where(inArray(products.id, [...want.keys()]));
  const items: OrderItem[] = [];
  for (const [id, q] of want) {
    const p = found.find((x) => x.id === id);
    if (!p || (!p.active && opts.fromCustomer)) throw new ApiError("Something in your order was just taken off the menu. Please review it and try again.", 409);
    if (q > 30) throw new ApiError(`Maximum 30 × ${p.name} per order.`);
    if (p.stock !== null && p.stock < q) throw new ApiError(p.stock <= 0 ? `${p.name} just sold out.` : `Only ${p.stock} × ${p.name} left.`, 409);
    items.push({ productId: p.id, name: p.name, price: p.price, qty: q });
  }

  let s = await openSession(tx, t);
  const name = str(a.name, 60);
  const phone = mobile(a.phone);
  if (phone === null) throw new ApiError("Please enter a valid 10-digit mobile number.");
  if (opts.fromCustomer && !s && !name) throw new ApiError("Please tell us your name.");
  if (opts.fromCustomer && !(s?.customerPhone || phone)) throw new ApiError("Please add your mobile number so we can send your bill.");

  if (!s) {
    const [created] = await tx
      .insert(sessions)
      .values({ id: uid(), tableId: t.id, status: "open", openedAt: now, closedAt: null, customerName: name, customerPhone: phone, guests: int(a.guests, 1, 40, t.seats), billRequestedAt: null, billId: null })
      .returning();
    s = created;
    await tx.update(tables).set({ sessionId: s.id }).where(eq(tables.id, t.id));
  } else {
    const patch: Partial<Session> = { billRequestedAt: null };
    if (name && !s.customerName) patch.customerName = name;
    if (phone && !s.customerPhone) patch.customerPhone = phone;
    [s] = await tx.update(sessions).set(patch).where(eq(sessions.id, s.id)).returning();
  }

  await moveStock(tx, tally(items, -1), now);

  const [seq] = await tx.update(meta).set({ orderSeq: sql`${meta.orderSeq} + 1` }).where(eq(meta.id, 1)).returning({ n: meta.orderSeq });
  const [o] = await tx
    .insert(orders)
    .values({
      id: uid(),
      no: seq.n,
      tableId: t.id,
      sessionId: s.id,
      items,
      note: str(a.note, 240),
      customerName: s.customerName,
      customerPhone: s.customerPhone,
      status: opts.fromCustomer ? "new" : "preparing",
      source: opts.fromCustomer ? "customer" : "counter",
      subtotal: round2(items.reduce((x, i) => x + i.price * i.qty, 0)),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return o;
}

export function placeOrder(c: string, a: Args) {
  return mutate(async (tx) => {
    const t = await tableByCode(tx, c);
    const o = await addOrder(tx, t, a, { fromCustomer: true });
    return { no: o.no, code: t.code };
  }).then(async ({ no, code }) => ({ no, view: await tableView(code) }));
}

export function requestBill(c: string) {
  return mutate(async (tx) => {
    const t = await tableByCode(tx, c);
    const s = await openSession(tx, t);
    if (!s) throw new ApiError("There's nothing on your tab yet.");
    if (!s.billRequestedAt) await tx.update(sessions).set({ billRequestedAt: Date.now() }).where(eq(sessions.id, s.id));
    return t.code;
  }).then(async (code) => ({ view: await tableView(code) }));
}

/* ================================ admin side ================================ */

export async function adminState(): Promise<AdminState> {
  const [m, st, prods, tabs, sess, ords, bls, cps, us] = await Promise.all([
    db.select().from(meta).where(eq(meta.id, 1)),
    db.select().from(settings).where(eq(settings.id, 1)),
    db.select().from(products).orderBy(asc(products.createdAt), asc(products.id)),
    db.select().from(tables).orderBy(asc(tables.createdAt), asc(tables.id)),
    db.select().from(sessions).orderBy(asc(sessions.openedAt), asc(sessions.id)),
    db.select().from(orders).orderBy(asc(orders.createdAt), asc(orders.no)),
    db.select().from(bills).orderBy(asc(bills.createdAt), asc(bills.id)),
    db.select().from(coupons).orderBy(desc(coupons.createdAt), desc(coupons.id)),
    db.select().from(staffUsers).orderBy(asc(staffUsers.createdAt), asc(staffUsers.id)),
  ]);
  return {
    version: m[0]?.version ?? 0,
    seq: { order: m[0]?.orderSeq ?? 0 },
    settings: { shopName: st[0]?.shopName ?? "Cafe", publicUrl: st[0]?.publicUrl ?? "" },
    products: prods,
    tables: tabs,
    sessions: sess,
    orders: ords,
    bills: bls,
    coupons: cps,
    users: us.map(publicUser),
  };
}

/** Moves stock for many products in one statement (untracked stock stays null). */
async function moveStock(tx: Tx, deltas: Map<string, number>, stamp?: number) {
  const rows = [...deltas].filter(([, d]) => d !== 0 || stamp !== undefined);
  if (!rows.length) return;
  const vals = sql.join(rows.map(([id, d]) => sql`(${id}::text, ${d}::int)`), sql`, `);
  await tx.execute(sql`
    update products p
    set stock = case when p.stock is null then null else greatest(0, p.stock + v.d) end,
        updated_at = ${stamp === undefined ? sql`p.updated_at` : sql`${stamp}::bigint`}
    from (values ${vals}) as v(id, d)
    where p.id = v.id`);
}

const tally = (items: OrderItem[], sign: 1 | -1, into = new Map<string, number>()) => {
  for (const it of items) if (it.productId) into.set(it.productId, (into.get(it.productId) ?? 0) + sign * it.qty);
  return into;
};

const restock = (tx: Tx, items: OrderItem[], sign: 1 | -1) => moveStock(tx, tally(items, sign));

async function saveProduct(tx: Tx, a: Args) {
  const now = Date.now();
  const name = str(a.name, 80);
  const category = str(a.category, 40) || "Uncategorised";
  const price = round2(num(a.price));
  const stockRaw = optNum(a.stock);
  if (!name) throw new ApiError("Give the product a name.");
  if (!(price >= 0)) throw new ApiError("Enter a valid price.");
  if (stockRaw !== null && !(stockRaw >= 0)) throw new ApiError("Stock can't be negative.");
  const fields = {
    name,
    category,
    price,
    stock: stockRaw === null ? null : Math.floor(stockRaw),
    lowAt: int(a.lowAt, 0, 9999, 4),
    description: str(a.description, 240),
    image: str(a.image, 600),
    eggless: !!a.eggless,
    tags: Array.isArray(a.tags) ? (a.tags as unknown[]).map((x) => str(x, 20).toLowerCase()).filter(Boolean).slice(0, 6) : [],
    active: a.active !== false,
  };
  const id = str(a.id, 40);
  const dupe = (await tx.select().from(products)).find((p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== id);
  if (dupe) throw new ApiError(`"${dupe.name}" already exists.`);
  if (id) {
    await must(tx.select().from(products).where(eq(products.id, id)), "Product");
    const [p] = await tx.update(products).set({ ...fields, updatedAt: now }).where(eq(products.id, id)).returning();
    return p;
  }
  const [p] = await tx.insert(products).values({ id: uid(), ...fields, createdAt: now, updatedAt: now }).returning();
  return p;
}

async function saveCoupon(tx: Tx, a: Args) {
  const c = str(a.code, 24).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const percent = round2(num(a.percent));
  const minOrder = optNum(a.minOrder) ?? 0;
  const limit = optNum(a.limit);
  const exp = str(a.expiresAt, 10);
  if (c.length < 3) throw new ApiError("Coupon code needs at least 3 letters or digits.");
  if (!(percent > 0 && percent <= 100)) throw new ApiError("Discount must be between 1 and 100%.");
  if (!(minOrder >= 0)) throw new ApiError("Minimum order can't be negative.");
  if (limit !== null && !(limit >= 1)) throw new ApiError("Usage limit must be at least 1 (or leave it blank).");
  if (exp && !/^\d{4}-\d{2}-\d{2}$/.test(exp)) throw new ApiError("Pick a valid expiry date.");
  const id = str(a.id, 40);
  const clash = await first(tx.select().from(coupons).where(eq(coupons.code, c)));
  if (clash && clash.id !== id) throw new ApiError(`${c} already exists.`);
  const fields = { code: c, percent, minOrder: round2(minOrder), expiresAt: exp || null, limit: limit === null ? null : Math.floor(limit), active: a.active !== false };
  if (id) {
    await must(tx.select().from(coupons).where(eq(coupons.id, id)), "Coupon");
    const [x] = await tx.update(coupons).set(fields).where(eq(coupons.id, id)).returning();
    return x;
  }
  const [x] = await tx.insert(coupons).values({ id: uid(), ...fields, used: 0, createdAt: Date.now() }).returning();
  return x;
}

async function createBill(tx: Tx, a: Args): Promise<Bill> {
  const now = Date.now();
  const source = a.source === "counter" ? "counter" : "table";
  let t: Table | null = null;
  let s: Session | null = null;
  if (source === "table") {
    t = await must(tx.select().from(tables).where(eq(tables.id, str(a.tableId, 40))), "Table");
    s = await openSession(tx, t);
    if (!s) throw new ApiError(`${t.label} has no open tab to bill.`);
  }

  const allProducts = await tx.select({ id: products.id }).from(products);
  const known = new Set(allProducts.map((p) => p.id));
  const raw = Array.isArray(a.items) ? (a.items as Args[]) : [];
  const items: OrderItem[] = [];
  for (const r of raw) {
    const name = str(r?.name, 120);
    const price = round2(num(r?.price));
    const qty = Math.floor(num(r?.qty));
    if (!name && !(price > 0)) continue; // untouched blank row
    if (!name) throw new ApiError("Every item needs a name.");
    if (!(price >= 0)) throw new ApiError(`Enter a price for "${name}".`);
    if (!(qty >= 1 && qty <= 999)) throw new ApiError(`Check the quantity for "${name}".`);
    const pid = str(r?.productId, 40);
    items.push({ productId: pid && known.has(pid) ? pid : null, name, price, qty });
  }
  if (!items.length) throw new ApiError("Add at least one item to the bill.");

  const cc = str(a.couponCode, 24).toUpperCase();
  const coupon = cc ? await first(tx.select().from(coupons).where(eq(coupons.code, cc))) : null;
  if (cc && !coupon) throw new ApiError(`Coupon ${cc} doesn't exist.`);
  const manualType = a.manualType === "percent" ? "percent" : "amount";
  const manualValue = Math.max(0, num(a.manualValue) || 0);
  const calc = computeBill({ items, coupon, manualType, manualValue, extra: num(a.extra) || 0 });
  if (coupon && calc.couponOk && !calc.couponOk.ok) throw new ApiError(`Coupon ${coupon.code}: ${calc.couponOk.reason}.`);

  const payment: PayMethod = a.payment === "upi" || a.payment === "card" ? a.payment : "cash";
  const got = num(a.received);
  const received = payment === "cash" && got > 0 ? round2(got) : calc.total;
  if (received < calc.total) throw new ApiError(`Amount received is less than the grand total.`);

  const phone = mobile(a.customerPhone);
  if (phone === null) throw new ApiError("Customer mobile should be a 10-digit number.");

  // Stock: table orders already took stock when they were placed, so only the
  // difference between what's billed and what was ordered moves stock now.
  const delta = new Map<string, number>();
  for (const it of items) if (it.productId) delta.set(it.productId, (delta.get(it.productId) ?? 0) + it.qty);
  if (s) {
    const placed = await tx.select().from(orders).where(eq(orders.sessionId, s.id));
    for (const o of placed) {
      if (o.status === "cancelled") continue;
      for (const it of o.items) if (it.productId) delta.set(it.productId, (delta.get(it.productId) ?? 0) - it.qty);
    }
  }
  await moveStock(tx, new Map([...delta].map(([pid, d]) => [pid, -d])));

  let invoiceNo = "";
  do invoiceNo = `INV-${new Date(now).getFullYear()}-${code(7)}`;
  while (await first(tx.select({ id: bills.id }).from(bills).where(eq(bills.invoiceNo, invoiceNo))));

  const [bill] = await tx
    .insert(bills)
    .values({
      id: uid(),
      invoiceNo,
      source,
      tableId: t?.id ?? null,
      tableLabel: t?.label ?? "Counter",
      sessionId: s?.id ?? null,
      customerName: str(a.customerName, 60) || s?.customerName || (source === "counter" ? "Walk-in customer" : ""),
      customerPhone: phone || s?.customerPhone || "",
      items,
      itemCount: calc.itemCount,
      subtotal: calc.subtotal,
      couponCode: coupon && calc.couponDiscount > 0 ? coupon.code : null,
      couponPercent: coupon && calc.couponDiscount > 0 ? coupon.percent : 0,
      couponDiscount: calc.couponDiscount,
      manualType,
      manualValue,
      manualDiscount: calc.manualDiscount,
      discount: calc.discount,
      extra: calc.extra,
      total: calc.total,
      payment,
      received,
      change: round2(received - calc.total),
      status: "completed",
      createdAt: now,
    })
    .returning();
  if (bill.couponCode && coupon) await tx.update(coupons).set({ used: sql`${coupons.used} + 1` }).where(eq(coupons.id, coupon.id));

  if (s && t) {
    await tx.update(sessions).set({ status: "closed", closedAt: now, billId: bill.id, customerName: bill.customerName, customerPhone: bill.customerPhone }).where(eq(sessions.id, s.id));
    await tx.update(tables).set({ sessionId: null }).where(eq(tables.id, t.id));
    await tx
      .update(orders)
      .set({ status: "served", updatedAt: now })
      .where(and(eq(orders.sessionId, s.id), inArray(orders.status, ["new", "preparing"])));
  }
  return bill;
}

async function freshCode(tx: Tx) {
  let c = "";
  do c = code(6).toLowerCase();
  while (await first(tx.select({ id: tables.id }).from(tables).where(eq(tables.code, c))));
  return c;
}

export function adminOp(op: string, a: Args) {
  return mutate(async (tx) => {
    const now = Date.now();
    const id = str(a.id, 40);
    switch (op) {
      /* ---------- settings ---------- */
      case "settings.update": {
        const url = str(a.publicUrl, 200).replace(/\/+$/, "");
        if (url && !/^https?:\/\/[^\s/]+/i.test(url)) throw new ApiError("Public URL should start with http:// or https://");
        const name = str(a.shopName, 60);
        await tx
          .update(settings)
          .set(name ? { publicUrl: url, shopName: name } : { publicUrl: url })
          .where(eq(settings.id, 1));
        return null;
      }

      /* ---------- users ---------- */
      case "user.promote": {
        const m = mobile(a.mobile);
        if (!m) throw new ApiError("Enter a valid 10-digit mobile number.");
        if (await first(tx.select({ id: staffUsers.id }).from(staffUsers).where(eq(staffUsers.mobile, m)))) throw new ApiError("That number already has admin access.");
        const password = typeof a.password === "string" ? a.password : "";
        if (password.length < 6) throw new ApiError("Give them a password of at least 6 characters.");
        const email = str(a.email, 120);
        if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) throw new ApiError("That email address doesn't look right.");
        const [u] = await tx
          .insert(staffUsers)
          .values({ id: uid(), name: str(a.name, 60) || "Unknown", mobile: m, email, passwordHash: hashPassword(password), createdAt: now })
          .returning();
        return publicUser(u);
      }
      case "user.demote": {
        const u = await must(tx.select().from(staffUsers).where(eq(staffUsers.id, id)), "User");
        await tx.delete(staffUsers).where(eq(staffUsers.id, u.id));
        return null;
      }

      /* ---------- tables ---------- */
      case "table.save": {
        const label = str(a.label, 24);
        const seats = int(a.seats, 1, 40, 4);
        if (!label) throw new ApiError("Give the table a name, like T7 or Patio 2.");
        const clash = (await tx.select().from(tables)).find((t) => t.label.toLowerCase() === label.toLowerCase() && t.id !== id);
        if (clash) throw new ApiError(`${clash.label} already exists.`);
        if (id) {
          await must(tx.select().from(tables).where(eq(tables.id, id)), "Table");
          const [t] = await tx.update(tables).set({ label, seats }).where(eq(tables.id, id)).returning();
          return t;
        }
        const [t] = await tx.insert(tables).values({ id: uid(), label, seats, code: await freshCode(tx), sessionId: null, createdAt: now }).returning();
        return t;
      }
      case "table.delete": {
        const t = await must(tx.select().from(tables).where(eq(tables.id, id)), "Table");
        if (await openSession(tx, t)) throw new ApiError(`${t.label} has an open tab. Bill it or clear it before deleting.`);
        await tx.delete(tables).where(eq(tables.id, t.id));
        return null;
      }
      case "table.rotate": {
        await must(tx.select().from(tables).where(eq(tables.id, id)), "Table");
        const [t] = await tx.update(tables).set({ code: await freshCode(tx) }).where(eq(tables.id, id)).returning();
        return t;
      }
      case "table.clear": {
        const t = await must(tx.select().from(tables).where(eq(tables.id, id)), "Table");
        const s = await openSession(tx, t);
        if (s) {
          await tx.update(sessions).set({ status: "void", closedAt: now }).where(eq(sessions.id, s.id));
          const live = await tx
            .select()
            .from(orders)
            .where(and(eq(orders.sessionId, s.id), inArray(orders.status, ["new", "preparing"])));
          if (live.length) {
            await tx.update(orders).set({ status: "cancelled", updatedAt: now }).where(inArray(orders.id, live.map((o) => o.id)));
            await restock(tx, live.flatMap((o) => o.items), 1);
          }
        }
        await tx.update(tables).set({ sessionId: null }).where(eq(tables.id, t.id));
        return null;
      }
      case "session.update": {
        const s = await must(tx.select().from(sessions).where(eq(sessions.id, id)), "Tab");
        const phone = mobile(a.customerPhone);
        if (phone === null) throw new ApiError("Mobile should be a 10-digit number.");
        const [u] = await tx
          .update(sessions)
          .set({ customerName: str(a.customerName, 60), customerPhone: phone, guests: int(a.guests, 1, 40, s.guests) })
          .where(eq(sessions.id, s.id))
          .returning();
        return u;
      }

      /* ---------- orders ---------- */
      case "order.create": {
        const t = await must(tx.select().from(tables).where(eq(tables.id, str(a.tableId, 40))), "Table");
        return addOrder(tx, t, a, { fromCustomer: false });
      }
      case "order.status": {
        const o = await must(tx.select().from(orders).where(eq(orders.id, id)), "Order");
        const next = a.status as OrderStatus;
        if (!["new", "preparing", "served", "cancelled"].includes(next)) throw new ApiError("Unknown status.");
        if (o.status === "cancelled" && next !== "cancelled") throw new ApiError("A cancelled order can't be reopened — ask the table to order again.");
        const s = await first(tx.select().from(sessions).where(eq(sessions.id, o.sessionId)));
        if (s && s.status !== "open") throw new ApiError("This tab is already closed.");
        if (next === "cancelled" && o.status !== "cancelled") await restock(tx, o.items, 1);
        const [u] = await tx.update(orders).set({ status: next, updatedAt: now }).where(eq(orders.id, o.id)).returning();
        return u;
      }

      /* ---------- inventory ---------- */
      case "product.save":
        return saveProduct(tx, a);
      case "product.delete": {
        const p = await must(tx.select().from(products).where(eq(products.id, id)), "Product");
        await tx.delete(products).where(eq(products.id, p.id));
        return null;
      }
      case "product.stock": {
        const p = await must(tx.select().from(products).where(eq(products.id, id)), "Product");
        let stock: number | null;
        if (a.set === null) stock = null;
        else if (a.set !== undefined) stock = int(a.set, 0, 999999, 0);
        else stock = Math.max(0, (p.stock ?? 0) + int(a.delta, -99999, 99999, 0));
        const [u] = await tx.update(products).set({ stock, updatedAt: now }).where(eq(products.id, p.id)).returning();
        return u;
      }
      case "product.toggle": {
        const p = await must(tx.select().from(products).where(eq(products.id, id)), "Product");
        const [u] = await tx.update(products).set({ active: !p.active, updatedAt: now }).where(eq(products.id, p.id)).returning();
        return u;
      }

      /* ---------- coupons ---------- */
      case "coupon.save":
        return saveCoupon(tx, a);
      case "coupon.delete": {
        await must(tx.select().from(coupons).where(eq(coupons.id, id)), "Coupon");
        await tx.delete(coupons).where(eq(coupons.id, id));
        return null;
      }

      /* ---------- billing ---------- */
      case "bill.create":
        return createBill(tx, a);
      case "bill.void": {
        const b = await must(tx.select().from(bills).where(eq(bills.id, id)), "Bill");
        if (b.status === "void") return b;
        const [u] = await tx.update(bills).set({ status: "void" }).where(eq(bills.id, b.id)).returning();
        await restock(tx, b.items, 1);
        if (b.couponCode) await tx.update(coupons).set({ used: sql`greatest(0, ${coupons.used} - 1)` }).where(eq(coupons.code, b.couponCode));
        return u;
      }
    }
    throw new ApiError(`Unknown action: ${op}`);
  });
}
