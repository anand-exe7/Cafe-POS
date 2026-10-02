# Chef Loving — Cafe POS

A point-of-sale and table-ordering app for a cafe. Guests scan a QR code at their table and order from their phone; staff run the floor, billing, inventory and reports from an admin panel.

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · Tailwind CSS 4 · Postgres on Supabase · Drizzle ORM

## What it does

### For guests — `/t/<code>`
- Scan the table QR to open the menu. Orders reach the admin instantly.
- Track order status, apply a coupon, and ask for the bill. Payment is at the counter.
- Anyone who can't scan gets a table picker at `/`.

### For staff — `/admin`
Sign in with `ADMIN_PASSWORD`.

| Screen | What you do there |
| --- | --- |
| **Tables** | Live floor view, add / rename / delete tables, rotate or print QR cards, clear or bill a tab. |
| **Billing** | Bill a table tab or a walk-in counter sale. Customer name and phone, catalog or custom items, coupon, manual discount, extra charges, payment by **Cash / UPI / Card / Split**. |
| **Orders** | All bills with filters and search. Each bill has **WhatsApp, View, Print, Delete**. Export to CSV. |
| **Analytics** | Revenue, expenses and net earnings, order sources, top items, **payment-mode breakdown**, stock summary, customers, coupon performance. |
| **Live queue** | Incoming orders for the kitchen: accept, serve, cancel. |
| **Inventory** | Products, categories, prices, tracked stock, low-stock alerts, and **Stock in / out** with a note. |
| **Stock movement** | Timeline of every stock change (added, removed, sold, cancelled, voided, adjusted) with filters and pagination. |
| **Expenses** | Record and review expenses; they feed into Analytics. |
| **Coupons / Users** | Create and manage discount codes; manage staff users. |

### Saving a bill
In Billing, **Save order** opens a modal with three choices:

1. **Send to WhatsApp** — saves the bill and opens WhatsApp with the invoice text (needs a 10-digit mobile).
2. **Print** — pick the printer and paper:
   - Thermal printer: **2 inch roll** or **3 inch roll**
   - Sheet printer: **A3**, **A4** or **A5**

   The receipt or invoice resizes to match. Print from Orders uses the same picker.
3. **Save bill** — saves without sending or printing.

### Split payment
Choose **Split** and enter the cash and card amounts. Typing one fills the other with the remainder, and it only saves when the two add up to the total. Each bill stores how much was paid in cash, UPI and card, so Analytics counts a split bill's cash part under Cash and its card part under Card.

## Getting started

### 1. Prerequisites
- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier is fine)

### 2. Install
```bash
npm install
```

### 3. Configure
Copy `.env.example` to `.env.local` and fill it in:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Supabase **transaction pooler** (port 6543). Used by the app. |
| `DATABASE_URL_UNPOOLED` | Supabase **session pooler** (port 5432). Used by `db:migrate`. |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Live "something changed" signal. Optional — without them the admin refreshes on a slow timer instead. |
| `ADMIN_PASSWORD` | Admin sign-in password. |
| `AUTH_SECRET` | Session signing secret. Generate with `openssl rand -hex 32`. |

### 4. Set up the database
```bash
npm run db:migrate   # create / update tables
npm run db:seed      # sample menu, 6 tables, one coupon
```

### 5. Run
```bash
npm run dev
```
Open `http://localhost:3000` (Next uses the next free port if 3000 is taken — check the terminal). Admin is at `/admin`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate a migration after editing `lib/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Load sample data |

## Printing QR codes
Set **Settings → "Public address for QR codes"** to an address phones can reach — your domain, or this computer's Wi-Fi IP such as `http://192.168.1.20:3000` — **before** printing QR cards. Cards print two per A4 page.

## Project layout

```
app/
  admin/            Admin panel (pages in (panel)/, UI in _ui/)
  t/[code]/         Guest ordering flow
  invoice/[id]/     Public, printable invoice page
  api/              admin op/state/auth, stock-movements, table routes
lib/
  ops.ts            Every read/write, with validation
  analytics.ts      Reporting maths (runs in the browser)
  money.ts          Bill totals and coupon rules
  db/schema.ts      Drizzle schema
  store.ts          Serialized, all-or-nothing writes
drizzle/            SQL migrations
scripts/seed.ts     Sample data
landing/            Parked marketing page (see landing/README.md)
```

## Deploying (Vercel)
Add the same environment variables as above — `DATABASE_URL` (transaction pooler), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ADMIN_PASSWORD`, `AUTH_SECRET` — and set the function region next to your database. Run `npm run db:migrate` against the production database before the first deploy and after any schema change.

## Notes
- Billing a table closes its tab and frees the table, so the next guests start fresh.
- Deleting a bill returns its items to stock and gives back any coupon use. Voiding keeps the bill on record but removes it from revenue.
- The landing page is parked, not deleted: it lives in `landing/`, off the route tree.
- This project targets a newer Next.js than most documentation covers. See `AGENTS.md` before changing framework-level code.
