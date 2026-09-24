import type { Metadata, Viewport } from "next";
import { Fraunces, Instrument_Sans, Caveat } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["SOFT", "WONK", "opsz"],
});

const instrument = Instrument_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-hand",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Chef Loving Cakes | Kodaikanal",
  description: "Order to your table at Chef Loving Cakes — scan the QR card on your table, or pick your table here.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#1c110c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${instrument.variable} ${caveat.variable} antialiased`}
    >
      <body>{children}</body>
    </html>
  );
}
