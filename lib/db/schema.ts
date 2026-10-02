import { bigint, boolean, index, integer, jsonb, numeric, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { CouponSource, DiscountType, OrderItem, OrderSource, OrderStatus, PayMethod, SessionStatus, StockMoveType } from "../types";

/* One table per type in lib/types.ts. Ids stay the app's own short text ids and
   timestamps stay epoch milliseconds, so rows map 1:1 onto the shapes the UI
   already consumes. Money is numeric(12,2), read back as a JS number. */

const ms = (name: string) => bigint(name, { mode: "number" });
const money = (name: string) => numeric(name, { precision: 12, scale: 2, mode: "number" });

/** Single row (id = 1). */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  shopName: text("shop_name").notNull(),
  publicUrl: text("public_url").notNull().default(""),
});

/** Single row (id = 1): the change counter the admin panel polls, and the order-number sequence. */
export const meta = pgTable("meta", {
  id: integer("id").primaryKey().default(1),
  version: bigint("version", { mode: "number" }).notNull().default(1),
  orderSeq: integer("order_seq").notNull().default(0),
});

export const products = pgTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  price: money("price").notNull(),
  stock: integer("stock"),
  lowAt: integer("low_at").notNull().default(4),
  description: text("description").notNull().default(""),
  image: text("image").notNull().default(""),
  eggless: boolean("eggless").notNull().default(false),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  createdAt: ms("created_at").notNull(),
  updatedAt: ms("updated_at").notNull(),
});

export const tables = pgTable(
  "tables",
  {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    seats: integer("seats").notNull(),
    code: text("code").notNull(),
    sessionId: text("session_id"),
    createdAt: ms("created_at").notNull(),
  },
  (t) => [uniqueIndex("tables_code_uq").on(t.code)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    tableId: text("table_id").notNull(),
    status: text("status").$type<SessionStatus>().notNull(),
    openedAt: ms("opened_at").notNull(),
    closedAt: ms("closed_at"),
    customerName: text("customer_name").notNull().default(""),
    customerPhone: text("customer_phone").notNull().default(""),
    guests: integer("guests").notNull(),
    billRequestedAt: ms("bill_requested_at"),
    billId: text("bill_id"),
    /** coupon the guest applied from their phone; validated again when the bill is made */
    couponCode: text("coupon_code"),
  },
  (t) => [
    // a table can never have two open tabs
    uniqueIndex("sessions_one_open_per_table").on(t.tableId).where(sql`${t.status} = 'open'`),
    index("sessions_table_idx").on(t.tableId),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    no: integer("no").notNull(),
    tableId: text("table_id").notNull(),
    sessionId: text("session_id").notNull(),
    items: jsonb("items").$type<OrderItem[]>().notNull(),
    note: text("note").notNull().default(""),
    customerName: text("customer_name").notNull().default(""),
    customerPhone: text("customer_phone").notNull().default(""),
    status: text("status").$type<OrderStatus>().notNull(),
    source: text("source").$type<OrderSource>().notNull(),
    subtotal: money("subtotal").notNull(),
    createdAt: ms("created_at").notNull(),
    updatedAt: ms("updated_at").notNull(),
  },
  (t) => [index("orders_session_idx").on(t.sessionId), index("orders_created_idx").on(t.createdAt)],
);

export const bills = pgTable(
  "bills",
  {
    id: text("id").primaryKey(),
    invoiceNo: text("invoice_no").notNull(),
    source: text("source").$type<"table" | "counter">().notNull(),
    tableId: text("table_id"),
    tableLabel: text("table_label").notNull(),
    sessionId: text("session_id"),
    customerName: text("customer_name").notNull().default(""),
    customerPhone: text("customer_phone").notNull().default(""),
    items: jsonb("items").$type<OrderItem[]>().notNull(),
    itemCount: integer("item_count").notNull(),
    subtotal: money("subtotal").notNull(),
    couponCode: text("coupon_code"),
    couponPercent: money("coupon_percent").notNull().default(0),
    couponDiscount: money("coupon_discount").notNull().default(0),
    couponSource: text("coupon_source").$type<CouponSource>(),
    manualType: text("manual_type").$type<DiscountType>().notNull(),
    manualValue: money("manual_value").notNull().default(0),
    manualDiscount: money("manual_discount").notNull().default(0),
    discount: money("discount").notNull().default(0),
    extra: money("extra").notNull().default(0),
    total: money("total").notNull(),
    payment: text("payment").$type<PayMethod>().notNull(),
    cashAmount: money("cash_amount").notNull().default(0),
    upiAmount: money("upi_amount").notNull().default(0),
    cardAmount: money("card_amount").notNull().default(0),
    received: money("received").notNull(),
    change: money("change").notNull().default(0),
    status: text("status").$type<"completed" | "void">().notNull(),
    createdAt: ms("created_at").notNull(),
  },
  (t) => [uniqueIndex("bills_invoice_uq").on(t.invoiceNo), index("bills_created_idx").on(t.createdAt)],
);

export const coupons = pgTable(
  "coupons",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    percent: money("percent").notNull(),
    minOrder: money("min_order").notNull().default(0),
    expiresAt: text("expires_at"),
    limit: integer("usage_limit"),
    used: integer("used").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: ms("created_at").notNull(),
  },
  (t) => [uniqueIndex("coupons_code_uq").on(t.code)],
);

export const staffUsers = pgTable(
  "staff_users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    mobile: text("mobile").notNull(),
    email: text("email").notNull().default(""),
    passwordHash: text("password_hash").notNull(),
    createdAt: ms("created_at").notNull(),
  },
  (t) => [uniqueIndex("staff_mobile_uq").on(t.mobile)],
);

/** Failed admin sign-ins per client, so the lockout holds across serverless instances. */
export const loginAttempts = pgTable("login_attempts", {
  key: text("key").primaryKey(),
  fails: integer("fails").notNull().default(0),
  lockedUntil: ms("locked_until").notNull().default(0),
});

export const expenses = pgTable(
  "expenses",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    amount: money("amount").notNull(),
    paymentMode: text("payment_mode").notNull().default("cash"),
    notes: text("notes").notNull().default(""),
    /** YYYY-MM-DD, shop-local */
    expenseDate: text("expense_date").notNull(),
    createdAt: ms("created_at").notNull(),
  },
  (t) => [index("expenses_date_idx").on(t.expenseDate)],
);

/** Every change to a product's tracked stock, newest last. */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    productName: text("product_name").notNull(),
    type: text("type").$type<StockMoveType>().notNull(),
    /** signed: + into stock, − out of it */
    qty: integer("qty").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    note: text("note").notNull().default(""),
    /** what caused it: an order id, bill id or invoice number */
    ref: text("ref").notNull().default(""),
    createdAt: ms("created_at").notNull(),
  },
  (t) => [index("stock_moves_created_idx").on(t.createdAt), index("stock_moves_product_idx").on(t.productId)],
);
