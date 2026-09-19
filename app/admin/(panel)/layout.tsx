import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { adminState } from "@/lib/ops";
import { AdminProvider } from "../_ui/Store";
import Shell from "../_ui/Shell";

/* Everything behind the sign-in: one data store + the sidebar shell. */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const initial = await adminState();
  return (
    <AdminProvider initial={initial}>
      <Shell>{children}</Shell>
    </AdminProvider>
  );
}
