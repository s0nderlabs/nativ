import type { Metadata } from "next";
import { GeistPixelSquare } from "geist/font/pixel";
import { Providers } from "@/providers";
import { Nav } from "@/components/nav";
import { HalftoneHero } from "@/components/halftone-hero";
import "./globals.css";

export const metadata: Metadata = {
  title: "nativ — The Native Chain for Agents",
  description: "An Initia MiniEVM appchain where agents are first-class citizens.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistPixelSquare.variable} antialiased`}>
      <body className="min-h-[100dvh] bg-bg text-fg">
        <Providers>
          <HalftoneHero />
          <Nav />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
