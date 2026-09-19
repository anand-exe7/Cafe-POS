import type { Bill } from "@/lib/types";
import { rupee } from "@/lib/money";
import { fmtDateTime } from "./kit";

const PAY = { cash: "Cash", upi: "UPI", card: "Card" } as const;

export function billText(b: Bill, shop: string) {
  const L = [
    `*${shop}*`,
    `Invoice: ${b.invoiceNo}`,
    `Date: ${fmtDateTime(b.createdAt)}`,
    b.source === "table" ? `Table: ${b.tableLabel}` : "Counter bill",
    b.customerName ? `Customer: ${b.customerName}` : "",
    "------------------------------",
    ...b.items.map((i) => `${i.qty} × ${i.name} — ${rupee(i.price * i.qty)}`),
    "------------------------------",
    `Subtotal (${b.itemCount} items): ${rupee(b.subtotal)}`,
    b.couponDiscount ? `Coupon ${b.couponCode} (${b.couponPercent}%): -${rupee(b.couponDiscount)}` : "",
    b.manualDiscount ? `Discount: -${rupee(b.manualDiscount)}` : "",
    b.extra ? `Extra charges: ${rupee(b.extra)}` : "",
    `*Grand total: ${rupee(b.total)}*`,
    `Paid by ${PAY[b.payment]}`,
    "",
    "Thank you for visiting — see you again soon! 🍒",
  ];
  return L.filter((l, i) => l !== "" || i === L.length - 2).join("\n");
}

export const waLink = (phone: string, text: string) => `https://wa.me/${phone.length === 10 ? `91${phone}` : phone}?text=${encodeURIComponent(text)}`;

/** 80mm thermal receipt, rendered into the print area. */
export function Receipt({ b, shop }: { b: Bill; shop: string }) {
  return (
    <div className="rcpt">
      <h1>{shop}</h1>
      <p className="c">Observatory Rd, Kodaikanal 624101 · +91 80568 95352</p>
      <hr />
      <div className="row">
        <span>{b.invoiceNo}</span>
        <span>{b.source === "table" ? `Table ${b.tableLabel}` : "Counter"}</span>
      </div>
      <div>{fmtDateTime(b.createdAt)}</div>
      {b.customerName && <div>{b.customerName}{b.customerPhone ? ` · ${b.customerPhone}` : ""}</div>}
      <hr />
      {b.items.map((i, k) => (
        <div key={k}>
          <div>{i.name}</div>
          <div className="row">
            <span>
              {i.qty} × {rupee(i.price)}
            </span>
            <span>{rupee(i.qty * i.price)}</span>
          </div>
        </div>
      ))}
      <hr />
      <div className="row">
        <span>Subtotal ({b.itemCount})</span>
        <span>{rupee(b.subtotal)}</span>
      </div>
      {b.couponDiscount > 0 && (
        <div className="row">
          <span>
            {b.couponCode} ({b.couponPercent}%)
          </span>
          <span>-{rupee(b.couponDiscount)}</span>
        </div>
      )}
      {b.manualDiscount > 0 && (
        <div className="row">
          <span>Discount</span>
          <span>-{rupee(b.manualDiscount)}</span>
        </div>
      )}
      {b.extra > 0 && (
        <div className="row">
          <span>Extra charges</span>
          <span>{rupee(b.extra)}</span>
        </div>
      )}
      <hr />
      <div className="row big">
        <span>TOTAL</span>
        <span>{rupee(b.total)}</span>
      </div>
      <div className="row">
        <span>Paid · {PAY[b.payment]}</span>
        <span>{rupee(b.received)}</span>
      </div>
      {b.change > 0 && (
        <div className="row">
          <span>Change</span>
          <span>{rupee(b.change)}</span>
        </div>
      )}
      <hr />
      <p className="c">✺ thank you — come again ✺</p>
    </div>
  );
}
