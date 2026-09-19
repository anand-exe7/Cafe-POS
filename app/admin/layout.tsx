import type { Metadata } from "next";
import { Inter, Lexend } from "next/font/google";
import "./admin.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-adm" });
const lexend = Lexend({ subsets: ["latin"], variable: "--font-adm-num" });

export const metadata: Metadata = {
  title: { default: "Admin · Chef Loving Cakes", template: "%s · Admin · Chef Loving" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <div className={`adm ${inter.variable} ${lexend.variable}`}>{children}</div>;
}
