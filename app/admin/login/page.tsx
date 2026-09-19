import { redirect } from "next/navigation";
import { isAdmin, needsSetup } from "@/lib/auth";
import { read } from "@/lib/store";
import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await isAdmin()) redirect("/admin");
  return <LoginForm setup={needsSetup(await read())} />;
}
