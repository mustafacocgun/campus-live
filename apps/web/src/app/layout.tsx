import type { Metadata } from "next";
import { Overpass } from "next/font/google";
import "./globals.css";

// Self-hosted at build time: browsers never ask Google for it. latin-ext carries ş, ğ, ı and İ.
const overpass = Overpass({ subsets: ["latin", "latin-ext"], variable: "--font-overpass" });

export const metadata: Metadata = {
  title: "Campus Live",
  description: "Kampüsün canlı haritası: kalabalık, otopark ve trafik",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" className={overpass.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
