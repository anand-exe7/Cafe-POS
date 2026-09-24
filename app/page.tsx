import type { Metadata } from "next";
import { Arrow, Cherry } from "./_components/bits";
import { shopName, tableList } from "@/lib/ops";
import "./home.css";

/* The front door for a guest who is sitting down but didn't scan the QR card:
   pick a table, land straight on that table's menu. The old magazine landing
   page is parked in `landing/` — it isn't served. */

/* Read per request, so a table added in the admin panel shows up right away. */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const shop = await shopName();
  return { title: `Order at your table | ${shop}`, robots: { index: false } };
}

export default async function Home() {
  const [shop, tables] = await Promise.all([shopName(), tableList()]);

  return (
    <main className="hm">
      <header className="hm__top">
        <Cherry size={34} />
        <span className="hm__brand">{shop}</span>
      </header>

      <h1 className="hm__t">
        Sitting with us? <em>Pick your table.</em>
      </h1>
      <p className="hm__sub">
        Tap your table and the menu opens right here on your phone — order, keep adding to the tab, pay whenever
        you&apos;re done. Every table has its own QR card too, if you&apos;d rather scan.
      </p>

      {tables.length ? (
        <>
          <ul className="hm__tables">
            {tables.map((t, i) => (
              <li key={t.code} style={{ ["--i" as string]: Math.min(i, 8) }}>
                <a href={`/t/${t.code}/menu`} className="tkt">
                  <span className="tkt__stub">
                    <small>Table</small>
                    <b>{t.label}</b>
                  </span>
                  <span className="tkt__body">
                    <span className="tkt__seats">
                      {t.seats} {t.seats === 1 ? "seat" : "seats"}
                    </span>
                    <span className="tkt__go">
                      Open menu <Arrow size={16} />
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <p className="hm__note">psst — your table number is on the little card in the middle of the table ↑</p>
        </>
      ) : (
        <p className="hm__note hm__note--empty">
          No tables are set up yet. Staff can add them in the admin panel.
        </p>
      )}
    </main>
  );
}
