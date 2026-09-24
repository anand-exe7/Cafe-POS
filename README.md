This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Table ordering & admin

- **Guests** scan a table QR → `/t/<code>`, which opens `/t/<code>/menu` straight away. Orders land in the admin instantly; guests can track status and ask for the bill, then pay at the counter. Anyone who couldn't scan gets a table picker at `/`.
- **The marketing landing page is parked, not deleted:** it lives in `landing/`, off the route tree, with `landing/README.md` explaining how to put it back at `/`.
- **Admin** lives at `/admin`: Tables (live floor, table CRUD, QR codes), Analytics, Orders, Billing (POS), Coupons, Inventory. The first visit asks you to choose the admin password; or set `ADMIN_PASSWORD` in `.env.local` to fix it from the server.
- **Billing a table** closes its tab and frees the table, so the next guests start fresh.
- **QR address:** set Settings → "Public address for QR codes" to the address phones can reach (your domain, or this computer's Wi-Fi IP like `http://192.168.1.20:3000`) before printing QR cards.
- **Data** is stored in `data/db.json` (git-ignored; created with the menu, 6 tables and one sample coupon on first run). Run it on one always-on Node server (`npm run build && npm start`). Serverless hosts such as Vercel don't keep files between requests, so this store won't persist there; use a real database if you deploy to one.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
