import Landing from "./_components/Landing";
import { tableList } from "@/lib/ops";

/* Read per request, so a table added in the admin panel shows up in the picker right away. */
export const dynamic = "force-dynamic";

export default async function Home() {
  return <Landing tables={await tableList()} />;
}
