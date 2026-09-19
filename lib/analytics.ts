import type { Bill } from "./types";

/* Pure analytics over completed bills. Runs in the browser, in the viewer's local time. */

export type Period = "all" | "today" | "week" | "month" | "year" | "custom";
export type Range = { from: number; to: number } | null;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Monday 00:00 of the week containing `d`. */
export function startOfWeek(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x.getTime();
}

export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { week: Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7), year: t.getUTCFullYear() };
}

export function rangeOf(p: Period, from = "", to = "", now = new Date()): Range {
  switch (p) {
    case "all":
      return null;
    case "today":
      return { from: startOfDay(now), to: Infinity };
    case "week":
      return { from: startOfWeek(now), to: Infinity };
    case "month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), to: Infinity };
    case "year":
      return { from: new Date(now.getFullYear(), 0, 1).getTime(), to: Infinity };
    case "custom":
      return {
        from: from ? new Date(`${from}T00:00:00`).getTime() : -Infinity,
        to: to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity,
      };
  }
}

export const inRange = (t: number, r: Range) => !r || (t >= r.from && t <= r.to);
export const completedIn = (bills: Bill[], r: Range) => bills.filter((b) => b.status === "completed" && inRange(b.createdAt, r));

const keyOf = (i: { productId: string | null; name: string }) => i.productId ?? `custom:${i.name.trim().toLowerCase()}`;

export type ItemStat = { key: string; productId: string | null; name: string; qty: number; revenue: number };

export function itemStats(bills: Bill[]): ItemStat[] {
  const m = new Map<string, ItemStat>();
  for (const b of bills)
    for (const i of b.items) {
      const k = keyOf(i);
      const cur = m.get(k) ?? { key: k, productId: i.productId, name: i.name, qty: 0, revenue: 0 };
      cur.qty += i.qty;
      cur.revenue += i.qty * i.price;
      m.set(k, cur);
    }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue);
}

export function summary(bills: Bill[]) {
  let revenue = 0, tableRev = 0, counterRev = 0, tableN = 0, counterN = 0, items = 0, discount = 0, discounted = 0;
  for (const b of bills) {
    revenue += b.total;
    items += b.itemCount;
    discount += b.discount;
    if (b.discount > 0) discounted++;
    if (b.source === "table") {
      tableRev += b.total;
      tableN++;
    } else {
      counterRev += b.total;
      counterN++;
    }
  }
  const byQty = itemStats(bills).sort((a, b) => b.qty - a.qty);
  return {
    revenue,
    count: bills.length,
    tableRev,
    counterRev,
    tableN,
    counterN,
    items,
    discount,
    discounted,
    aov: bills.length ? revenue / bills.length : 0,
    top: byQty[0]?.name ?? "—",
  };
}

export function monthly(bills: Bill[], year: number) {
  const out = Array(12).fill(0) as number[];
  for (const b of bills) {
    const d = new Date(b.createdAt);
    if (b.status === "completed" && d.getFullYear() === year) out[d.getMonth()] += b.total;
  }
  return out;
}

export function weekly(bills: Bill[], weekStart: number) {
  const out = Array(7).fill(0) as number[];
  for (const b of bills) {
    if (b.status !== "completed" || b.createdAt < weekStart) continue;
    const day = Math.floor((startOfDay(new Date(b.createdAt)) - weekStart) / 86400000 + 0.5);
    if (day >= 0 && day < 7) out[day] += b.total;
  }
  return out;
}
