import BillingPage from "../../_ui/BillingPage";

export const metadata = { title: "Billing" };

export default async function Page({ searchParams }: PageProps<"/admin/billing">) {
  const { table } = await searchParams;
  const tableId = typeof table === "string" ? table : undefined;
  return <BillingPage key={tableId ?? "none"} tableId={tableId} />;
}
