import type { Metadata } from "next";
import { GeistPixelSquare } from "geist/font/pixel";
import { Providers } from "@/providers";
import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "nativ — The Native Chain for AI",
  description: "An Initia MiniEVM appchain where agents are first-class citizens.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistPixelSquare.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-void text-text">
        <Providers>
          <Nav />
          <main className="flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
