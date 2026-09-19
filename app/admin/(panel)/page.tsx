import TablesPage from "../_ui/TablesPage";

export const metadata = { title: "Tables" };

export default async function Page({ searchParams }: PageProps<"/admin">) {
  const { table } = await searchParams;
  return <TablesPage focus={typeof table === "string" ? table : undefined} />;
}
