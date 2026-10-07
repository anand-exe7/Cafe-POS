/* Shared shapes for the phone-number ordering system (server + client). */

export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  /** null = not tracked (always available) */
  stock: number | null;
  /** warn in admin when stock falls to this or below */
  lowAt: number;
  description: string;
  image: string;
  eggless: boolean;
  tags: string[];
  /** hidden from the customer menu when false */
  active: boolean;
  createdAt: number;
  updatedAt: number;
};

export type SessionStatus = "open" | "closed" | "void";

/** One customer's tab, found by their mobile: opens with the first order, closes when the bill is paid. */
export type Session = {
  id: string;
  status: SessionStatus;
  openedAt: number;
  closedAt: number | null;
  customerName: string;
  customerPhone: string;
  billRequestedAt: number | null;
  billId: string | null;
  couponCode: string | null;
};

export type OrderItem = {
  productId: string | null;
  name: string;
  price: number;
  qty: number;
};

export type OrderStatus = "new" | "preparing" | "served" | "cancelled";

/** Who put the order in: the guest's phone, or staff at the counter. */
export type OrderSource = "customer" | "counter";

export type Order = {
  id: string;
  no: number;
  sessionId: string;
  items: OrderItem[];
  note: string;
  customerName: string;
  customerPhone: string;
  status: OrderStatus;
  source: OrderSource;
  subtotal: number;
  createdAt: number;
  updatedAt: number;
};

export type BillSource = "tab" | "counter";
/** "split" = part cash, part card; cashAmount / cardAmount on the bill say how much each. */
export type PayMethod = "cash" | "upi" | "card" | "split";
export type DiscountType = "amount" | "percent";
/** Who applied the coupon on a bill: the guest from their phone, or staff at billing. */
export type CouponSource = "guest" | "staff";

export type Bill = {
  id: string;
  invoiceNo: string;
  source: BillSource;
  sessionId: string | null;
  customerName: string;
  customerPhone: string;
  items: OrderItem[];
  itemCount: number;
  subtotal: number;
  couponCode: string | null;
  couponPercent: number;
  couponDiscount: number;
  couponSource: CouponSource | null;
  manualType: DiscountType;
  manualValue: number;
  manualDiscount: number;
  discount: number;
  extra: number;
  /** true = GST invoice (tax added on top); false = non-GST bill */
  isGst: boolean;
  gstPercent: number;
  /** amount GST is charged on: subtotal − discount + extra */
  taxableAmount: number;
  gstAmount: number;
  total: number;
  payment: PayMethod;
  /** How the total was tendered. Always sums to `total`, whichever method was used. */
  cashAmount: number;
  upiAmount: number;
  cardAmount: number;
  received: number;
  change: number;
  status: "completed" | "void";
  createdAt: number;
};

export type Coupon = {
  id: string;
  code: string;
  percent: number;
  minOrder: number;
  /** YYYY-MM-DD, valid through the end of that day */
  expiresAt: string | null;
  /** null = unlimited */
  limit: number | null;
  used: number;
  active: boolean;
  createdAt: number;
};

export type Expense = {
  id: string;
  title: string;
  category: string;
  amount: number;
  paymentMode: string;
  notes: string;
  /** YYYY-MM-DD */
  expenseDate: string;
  createdAt: number;
};

export type ExpenseCategory = {
  id: string;
  name: string;
  createdAt: number;
};

export type StockMoveType = "initial" | "added" | "removed" | "sale" | "cancelled_order" | "void_bill" | "adjustment";

/** One page of the stock ledger plus totals for the whole selected period. */
export type StockLedger = {
  rows: StockMovement[];
  total: number;
  page: number;
  pages: number;
  stats: { added: number; sold: number; removed: number; returned: number; adjusted: number; net: number };
  perProduct: { id: string; name: string; in: number; out: number; close: number | null }[];
  products: { id: string; name: string }[];
};

export type StockMovement = {
  id: string;
  productId: string;
  productName: string;
  type: StockMoveType;
  qty: number;
  balanceAfter: number;
  note: string;
  ref: string;
  createdAt: number;
};

/* Guests never hold an account — they order from the shop's QR code and are known
   by the mobile they leave with the order. So every stored user is someone who has
   been given admin access, keyed by that same mobile, which is what lets a regular
   be promoted straight from the Users page. */
export type StaffUser = {
  id: string;
  name: string;
  /** 10-digit mobile: the identity this app actually collects */
  mobile: string;
  email: string;
  passwordHash: string;
  createdAt: number;
};

/** A user as the admin panel sees one — never the hash. */
export type PublicUser = Omit<StaffUser, "passwordHash">;

export type Settings = {
  shopName: string;
  /** origin printed into QR codes, e.g. https://order.cheflovingcakes.in */
  publicUrl: string;
  adminHash: string | null;
  secret: string;
};

export type DB = {
  version: number;
  seq: { order: number };
  settings: Settings;
  products: Product[];
  sessions: Session[];
  orders: Order[];
  bills: Bill[];
  coupons: Coupon[];
  users: StaffUser[];
  expenses: Expense[];
  expenseCategories: ExpenseCategory[];
};

/** What the admin panel receives (no secrets). */
export type AdminState = Omit<DB, "settings" | "users"> & {
  settings: { shopName: string; publicUrl: string };
  users: PublicUser[];
};

/** A tab that closed in the last few minutes — "paid" once it was billed, "cleared"
    if staff wiped it without taking payment. Lets the guest's phone close the loop
    and reset itself for the next visit. */
export type TabClose = {
  kind: "paid" | "cleared";
  invoiceNo: string | null;
  total: number;
  itemCount: number;
  name: string;
  at: number;
};

/** What a customer receives: the menu, plus their tab when their mobile has one open. */
export type TabView = {
  shopName: string;
  menu: MenuItem[];
  closed: TabClose | null;
  tab: {
    orders: { no: number; items: OrderItem[]; status: OrderStatus; subtotal: number; createdAt: number }[];
    total: number;
    billRequested: boolean;
    /** first name only — a phone number is not a password */
    name: string;
    /** the coupon this guest applied, with what it saves right now */
    coupon: { code: string; percent: number; discount: number; ok: boolean; reason: string } | null;
    /** what the guest should expect to pay: total minus the coupon */
    payable: number;
  } | null;
};

export type MenuItem = Pick<Product, "id" | "name" | "category" | "price" | "description" | "image" | "tags"> & {
  soldOut: boolean;
  left: number | null;
};
