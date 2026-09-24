import { ApiError, mutate, read } from "./store";
import { code, uid } from "./seed";
import { computeBill, round2 } from "./money";
import { hashPassword } from "./auth";
import type { AdminState, Bill, Coupon, DB, MenuItem, Order, OrderItem, OrderStatus, PayMethod, Product, PublicUser, Session, StaffUser, Table, TableCard, TableClose, TableView } from "./types";

/* Every read/write the app makes, with validation. Route handlers are thin wrappers. */

type Args = Record<string, unknown>;

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

const find = <T extends { id: string }>(list: T[], id: unknown, what: string) => {
  const hit = list.find((x) => x.id === id);
  if (!hit) throw new ApiError(`${what} not found — it may have just been removed.`, 404);
  return hit;
};

/** The fields of a user that may leave the server. Named one by one on purpose:
    anything added to StaffUser later stays server-side until it is listed here. */
const publicUser = (u: StaffUser): PublicUser => ({ id: u.id, name: u.name, mobile: u.mobile, email: u.email, createdAt: u.createdAt });

function tableByCode(db: DB, c: string) {
  const t = db.tables.find((x) => x.code === String(c).toLowerCase());
  if (!t) throw new ApiError("This table's QR code is no longer active. Please ask our staff for help.", 404);
  return t;
}

export const openSession = (db: DB, t: Table) => (t.sessionId ? db.sessions.find((s) => s.id === t.sessionId && s.status === "open") ?? null : null);

/* ============================== customer side ============================== */

export function menuOf(db: DB): MenuItem[] {
  const order: string[] = [];
  for (const p of db.products) if (!order.includes(p.category)) order.push(p.category);
  return db.products
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

function lastClose(db: DB, t: Table): TableClose | null {
  let last: Session | null = null;
  for (const s of db.sessions) {
    if (s.tableId !== t.id || s.status === "open" || s.closedAt === null) continue;
    if (!last || s.closedAt > last.closedAt!) last = s;
  }
  if (!last || Date.now() - last.closedAt! > CLOSE_WINDOW) return null;
  const bill = last.billId ? db.bills.find((b) => b.id === last!.billId) ?? null : null;
  return bill && bill.status === "completed"
    ? { kind: "paid", invoiceNo: bill.invoiceNo, total: bill.total, itemCount: bill.itemCount, name: bill.customerName, at: last.closedAt! }
    : { kind: "cleared", invoiceNo: null, total: 0, itemCount: 0, name: last.customerName, at: last.closedAt! };
}

function view(db: DB, t: Table): TableView {
  const s = openSession(db, t);
  const orders = s ? db.orders.filter((o) => o.sessionId === s.id) : [];
  return {
    table: { label: t.label, seats: t.seats, code: t.code },
    shopName: db.settings.shopName,
    menu: menuOf(db),
    closed: s ? null : lastClose(db, t),
    tab: s
      ? {
          orders: orders.map((o) => ({ no: o.no, items: o.items, status: o.status, subtotal: o.subtotal, createdAt: o.createdAt })),
          total: round2(orders.filter((o) => o.status !== "cancelled").reduce((a, o) => a + o.subtotal, 0)),
          billRequested: !!s.billRequestedAt,
          name: s.customerName,
          hasPhone: !!s.customerPhone,
        }
      : null,
  };
}

export async function tableView(c: string) {
  const db = await read();
  return view(db, tableByCode(db, c));
}

/** The table directory the front door offers to a guest who couldn't scan the QR. */
export async function tableList(): Promise<TableCard[]> {
  const db = await read();
  return db.tables
    .map((t) => ({ label: t.label, seats: t.seats, code: t.code }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));
}

/** The shop's name, for pages that show it without loading a whole table. */
export async function shopName(): Promise<string> {
  return (await read()).settings.shopName;
}

/** Validates the lines, takes stock, opens a tab if needed and files the order. */
function addOrder(db: DB, t: Table, a: Args, opts: { fromCustomer: boolean }) {
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

  const items: OrderItem[] = [];
  const touched: Product[] = [];
  for (const [id, q] of want) {
    const p = db.products.find((x) => x.id === id);
    if (!p || (!p.active && opts.fromCustomer)) throw new ApiError("Something in your order was just taken off the menu. Please review it and try again.", 409);
    if (q > 30) throw new ApiError(`Maximum 30 × ${p.name} per order.`);
    if (p.stock !== null && p.stock < q) throw new ApiError(p.stock <= 0 ? `${p.name} just sold out.` : `Only ${p.stock} × ${p.name} left.`, 409);
    items.push({ productId: p.id, name: p.name, price: p.price, qty: q });
    touched.push(p);
  }

  let s = openSession(db, t);
  const name = str(a.name, 60);
  const phone = mobile(a.phone);
  if (phone === null) throw new ApiError("Please enter a valid 10-digit mobile number.");
  if (opts.fromCustomer && !s && !name) throw new ApiError("Please tell us your name.");
  if (opts.fromCustomer && !(s?.customerPhone || phone)) throw new ApiError("Please add your mobile number so we can send your bill.");

  if (!s) {
    s = {
      id: uid(),
      tableId: t.id,
      status: "open",
      openedAt: now,
      closedAt: null,
      customerName: name,
      customerPhone: phone,
      guests: int(a.guests, 1, 40, t.seats),
      billRequestedAt: null,
      billId: null,
    } satisfies Session;
    db.sessions.push(s);
    t.sessionId = s.id;
  } else {
    if (name && !s.customerName) s.customerName = name;
    if (phone && !s.customerPhone) s.customerPhone = phone;
    s.billRequestedAt = null;
  }

  touched.forEach((p, i) => {
    if (p.stock !== null) p.stock -= items[i].qty;
    p.updatedAt = now;
  });

  const o: Order = {
    id: uid(),
    no: ++db.seq.order,
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
  };
  db.orders.push(o);
  return o;
}

export function placeOrder(c: string, a: Args) {
  return mutate((db) => {
    const t = tableByCode(db, c);
    const o = addOrder(db, t, a, { fromCustomer: true });
    return { no: o.no, view: view(db, t) };
  });
}

export function requestBill(c: string) {
  return mutate((db) => {
    const t = tableByCode(db, c);
    const s = openSession(db, t);
    if (!s) throw new ApiError("There's nothing on your tab yet.");
    s.billRequestedAt ??= Date.now();
    return { view: view(db, t) };
  });
}

/* ================================ admin side ================================ */

export async function adminState(): Promise<AdminState> {
  const db = await read();
  const { settings, users, ...rest } = db;
  return {
    ...rest,
    settings: { shopName: settings.shopName, publicUrl: settings.publicUrl },
    users: users.map(publicUser),
  };
}

function restock(db: DB, items: OrderItem[], sign: 1 | -1) {
  for (const it of items) {
    const p = it.productId ? db.products.find((x) => x.id === it.productId) : null;
    if (p && p.stock !== null) p.stock = Math.max(0, p.stock + sign * it.qty);
  }
}

function saveProduct(db: DB, a: Args) {
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
  const dupe = db.products.find((p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== a.id);
  if (dupe) throw new ApiError(`"${dupe.name}" already exists.`);
  if (a.id) {
    const p = find(db.products, a.id, "Product");
    Object.assign(p, fields, { updatedAt: now });
    return p;
  }
  const p: Product = { id: uid(), ...fields, createdAt: now, updatedAt: now };
  db.products.push(p);
  return p;
}

function saveCoupon(db: DB, a: Args) {
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
  if (db.coupons.some((x) => x.code === c && x.id !== a.id)) throw new ApiError(`${c} already exists.`);
  const fields = { code: c, percent, minOrder: round2(minOrder), expiresAt: exp || null, limit: limit === null ? null : Math.floor(limit), active: a.active !== false };
  if (a.id) {
    const x = find(db.coupons, a.id, "Coupon");
    Object.assign(x, fields);
    return x;
  }
  const x: Coupon = { id: uid(), ...fields, used: 0, createdAt: Date.now() };
  db.coupons.unshift(x);
  return x;
}

function createBill(db: DB, a: Args): Bill {
  const now = Date.now();
  const source = a.source === "counter" ? "counter" : "table";
  let t: Table | null = null;
  let s: Session | null = null;
  if (source === "table") {
    t = find(db.tables, a.tableId, "Table");
    s = openSession(db, t);
    if (!s) throw new ApiError(`${t.label} has no open tab to bill.`);
  }

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
    items.push({ productId: pid && db.products.some((p) => p.id === pid) ? pid : null, name, price, qty });
  }
  if (!items.length) throw new ApiError("Add at least one item to the bill.");

  const cc = str(a.couponCode, 24).toUpperCase();
  const coupon = cc ? db.coupons.find((x) => x.code === cc) ?? null : null;
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
    for (const o of db.orders) {
      if (o.sessionId !== s.id || o.status === "cancelled") continue;
      for (const it of o.items) if (it.productId) delta.set(it.productId, (delta.get(it.productId) ?? 0) - it.qty);
    }
  }
  for (const [pid, d] of delta) {
    const p = db.products.find((x) => x.id === pid);
    if (p && p.stock !== null && d !== 0) p.stock = Math.max(0, p.stock - d);
  }

  let invoiceNo = "";
  do invoiceNo = `INV-${new Date(now).getFullYear()}-${code(7)}`;
  while (db.bills.some((b) => b.invoiceNo === invoiceNo));

  const bill: Bill = {
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
  };
  db.bills.push(bill);
  if (bill.couponCode && coupon) coupon.used += 1;

  if (s && t) {
    s.status = "closed";
    s.closedAt = now;
    s.billId = bill.id;
    s.customerName = bill.customerName;
    s.customerPhone = bill.customerPhone;
    t.sessionId = null;
    for (const o of db.orders) {
      if (o.sessionId === s.id && (o.status === "new" || o.status === "preparing")) {
        o.status = "served";
        o.updatedAt = now;
      }
    }
  }
  return bill;
}

export function adminOp(op: string, a: Args) {
  return mutate((db) => {
    const now = Date.now();
    switch (op) {
      /* ---------- settings ---------- */
      case "settings.update": {
        const url = str(a.publicUrl, 200).replace(/\/+$/, "");
        if (url && !/^https?:\/\/[^\s/]+/i.test(url)) throw new ApiError("Public URL should start with http:// or https://");
        db.settings.publicUrl = url;
        if (str(a.shopName, 60)) db.settings.shopName = str(a.shopName, 60);
        return null;
      }

      /* ---------- users ---------- */
      case "user.promote": {
        const m = mobile(a.mobile);
        if (!m) throw new ApiError("Enter a valid 10-digit mobile number.");
        if (db.users.some((u) => u.mobile === m)) throw new ApiError("That number already has admin access.");
        const password = typeof a.password === "string" ? a.password : "";
        if (password.length < 6) throw new ApiError("Give them a password of at least 6 characters.");
        const email = str(a.email, 120);
        if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) throw new ApiError("That email address doesn't look right.");
        const u: StaffUser = {
          id: uid(),
          name: str(a.name, 60) || "Unknown",
          mobile: m,
          email,
          passwordHash: hashPassword(password),
          createdAt: now,
        };
        db.users.push(u);
        return publicUser(u);
      }
      case "user.demote": {
        const u = find(db.users, a.id, "User");
        db.users = db.users.filter((x) => x.id !== u.id);
        return null;
      }

      /* ---------- tables ---------- */
      case "table.save": {
        const label = str(a.label, 24);
        const seats = int(a.seats, 1, 40, 4);
        if (!label) throw new ApiError("Give the table a name, like T7 or Patio 2.");
        const clash = db.tables.find((t) => t.label.toLowerCase() === label.toLowerCase() && t.id !== a.id);
        if (clash) throw new ApiError(`${clash.label} already exists.`);
        if (a.id) {
          const t = find(db.tables, a.id, "Table");
          t.label = label;
          t.seats = seats;
          return t;
        }
        let c = "";
        do c = code(6).toLowerCase();
        while (db.tables.some((t) => t.code === c));
        const t: Table = { id: uid(), label, seats, code: c, sessionId: null, createdAt: now };
        db.tables.push(t);
        return t;
      }
      case "table.delete": {
        const t = find(db.tables, a.id, "Table");
        if (openSession(db, t)) throw new ApiError(`${t.label} has an open tab. Bill it or clear it before deleting.`);
        db.tables = db.tables.filter((x) => x.id !== t.id);
        return null;
      }
      case "table.rotate": {
        const t = find(db.tables, a.id, "Table");
        let c = "";
        do c = code(6).toLowerCase();
        while (db.tables.some((x) => x.code === c));
        t.code = c;
        return t;
      }
      case "table.clear": {
        const t = find(db.tables, a.id, "Table");
        const s = openSession(db, t);
        if (s) {
          s.status = "void";
          s.closedAt = now;
          for (const o of db.orders) {
            if (o.sessionId === s.id && (o.status === "new" || o.status === "preparing")) {
              o.status = "cancelled";
              o.updatedAt = now;
              restock(db, o.items, 1);
            }
          }
        }
        t.sessionId = null;
        return null;
      }
      case "session.update": {
        const s = find(db.sessions, a.id, "Tab");
        const phone = mobile(a.customerPhone);
        if (phone === null) throw new ApiError("Mobile should be a 10-digit number.");
        s.customerName = str(a.customerName, 60);
        s.customerPhone = phone;
        s.guests = int(a.guests, 1, 40, s.guests);
        return s;
      }

      /* ---------- orders ---------- */
      case "order.create": {
        const t = find(db.tables, a.tableId, "Table");
        return addOrder(db, t, a, { fromCustomer: false });
      }
      case "order.status": {
        const o = find(db.orders, a.id, "Order");
        const next = a.status as OrderStatus;
        if (!["new", "preparing", "served", "cancelled"].includes(next)) throw new ApiError("Unknown status.");
        if (o.status === "cancelled" && next !== "cancelled") throw new ApiError("A cancelled order can't be reopened — ask the table to order again.");
        const s = db.sessions.find((x) => x.id === o.sessionId);
        if (s && s.status !== "open") throw new ApiError("This tab is already closed.");
        if (next === "cancelled" && o.status !== "cancelled") restock(db, o.items, 1);
        o.status = next;
        o.updatedAt = now;
        return o;
      }

      /* ---------- inventory ---------- */
      case "product.save":
        return saveProduct(db, a);
      case "product.delete": {
        const p = find(db.products, a.id, "Product");
        db.products = db.products.filter((x) => x.id !== p.id);
        return null;
      }
      case "product.stock": {
        const p = find(db.products, a.id, "Product");
        if (a.set === null) p.stock = null;
        else if (a.set !== undefined) p.stock = int(a.set, 0, 999999, 0);
        else p.stock = Math.max(0, (p.stock ?? 0) + int(a.delta, -99999, 99999, 0));
        p.updatedAt = now;
        return p;
      }
      case "product.toggle": {
        const p = find(db.products, a.id, "Product");
        p.active = !p.active;
        p.updatedAt = now;
        return p;
      }

      /* ---------- coupons ---------- */
      case "coupon.save":
        return saveCoupon(db, a);
      case "coupon.delete": {
        find(db.coupons, a.id, "Coupon");
        db.coupons = db.coupons.filter((x) => x.id !== a.id);
        return null;
      }

      /* ---------- billing ---------- */
      case "bill.create":
        return createBill(db, a);
      case "bill.void": {
        const b = find(db.bills, a.id, "Bill");
        if (b.status === "void") return b;
        b.status = "void";
        restock(db, b.items, 1);
        const c = b.couponCode ? db.coupons.find((x) => x.code === b.couponCode) : null;
        if (c) c.used = Math.max(0, c.used - 1);
        return b;
      }
    }
    throw new ApiError(`Unknown action: ${op}`);
  });
}
