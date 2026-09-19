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
  description:
    "Chef Loving Cakes — a family-run bakery in Kodaikanal crafting handmade cakes for every celebration since 2015. Design your cake and order on WhatsApp.",
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
