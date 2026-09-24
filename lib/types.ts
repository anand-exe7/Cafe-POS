/* Shared shapes for the table-ordering system (server + client). */

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

export type Table = {
  id: string;
  label: string;
  seats: number;
  /** slug printed in the QR code: /t/<code> */
  code: string;
  /** the open tab, if someone is seated */
  sessionId: string | null;
  createdAt: number;
};

export type SessionStatus = "open" | "closed" | "void";

/** One visit to a table: opens with the first order, closes when the bill is paid. */
export type Session = {
  id: string;
  tableId: string;
  status: SessionStatus;
  openedAt: number;
  closedAt: number | null;
  customerName: string;
  customerPhone: string;
  guests: number;
  billRequestedAt: number | null;
  billId: string | null;
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
  tableId: string;
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

export type BillSource = "table" | "counter";
export type PayMethod = "cash" | "upi" | "card";
export type DiscountType = "amount" | "percent";

export type Bill = {
  id: string;
  invoiceNo: string;
  source: BillSource;
  tableId: string | null;
  tableLabel: string;
  sessionId: string | null;
  customerName: string;
  customerPhone: string;
  items: OrderItem[];
  itemCount: number;
  subtotal: number;
  couponCode: string | null;
  couponPercent: number;
  couponDiscount: number;
  manualType: DiscountType;
  manualValue: number;
  manualDiscount: number;
  discount: number;
  extra: number;
  total: number;
  payment: PayMethod;
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

/* Guests never hold an account — they order from a QR code and are known by the
   mobile they leave with the order. So every stored user is someone who has been
   given admin access, keyed by that same mobile, which is what lets a regular at
   a table be promoted straight from the Users page. */
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
  tables: Table[];
  sessions: Session[];
  orders: Order[];
  bills: Bill[];
  coupons: Coupon[];
  users: StaffUser[];
};

/** What the admin panel receives (no secrets). */
export type AdminState = Omit<DB, "settings" | "users"> & {
  settings: { shopName: string; publicUrl: string };
  users: PublicUser[];
};

/** One entry in the landing page's "pick your table" directory. */
export type TableCard = Pick<Table, "label" | "seats" | "code">;

/** A tab that closed in the last few minutes — "paid" once it was billed, "cleared"
    if staff wiped it without taking payment. Lets the guest's phone close the loop
    and reset itself for whoever sits down next. */
export type TableClose = {
  kind: "paid" | "cleared";
  invoiceNo: string | null;
  total: number;
  itemCount: number;
  name: string;
  at: number;
};

/** What a customer at a table receives. */
export type TableView = {
  table: { label: string; seats: number; code: string };
  shopName: string;
  menu: MenuItem[];
  closed: TableClose | null;
  tab: {
    orders: { no: number; items: OrderItem[]; status: OrderStatus; subtotal: number; createdAt: number }[];
    total: number;
    billRequested: boolean;
    name: string;
    hasPhone: boolean;
  } | null;
};

export type MenuItem = Pick<Product, "id" | "name" | "category" | "price" | "description" | "image" | "eggless" | "tags"> & {
  soldOut: boolean;
  left: number | null;
};
