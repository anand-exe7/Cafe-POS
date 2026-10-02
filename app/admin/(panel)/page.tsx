import TabsPage from "../_ui/TabsPage";

export const metadata = { title: "Open tabs" };

export default async function Page({ searchParams }: PageProps<"/admin">) {
  const { tab } = await searchParams;
  return <TabsPage focus={typeof tab === "string" ? tab : undefined} />;
}
