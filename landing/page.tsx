import Landing from "./components/Landing";
import { tableList } from "@/lib/ops";
import "./landing.css";

/* The magazine landing page, parked. Drop this file back at `app/page.tsx`
   (fixing the two relative imports above) to serve it at "/" again — see
   landing/README.md. */

/* Read per request, so a table added in the admin panel shows up in the picker right away. */
export const dynamic = "force-dynamic";

export default async function Home() {
  return <Landing tables={await tableList()} />;
}
