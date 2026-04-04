"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useInterwovenKit } from "@initia/interwovenkit-react";
import { truncate } from "@initia/utils";
const links = [
  { href: "/explorer", label: "Explorer" },
  { href: "/live", label: "Live" },
  { href: "/chat", label: "Chat" },
  { href: "/marketplace", label: "Market" },
];

function navLink(link: { href: string; label: string }, pathname: string) {
  return (
    <Link
      key={link.href}
      href={link.href}
      className={`relative text-[11px] tracking-wide px-3 py-1.5 transition-[color] duration-200 ${
        pathname === link.href ? "text-fg" : "text-muted hover:text-fg"
      }`}
    >
      {link.label}
      {pathname === link.href && (
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-px bg-fg" />
      )}
    </Link>
  );
}

function WalletButton() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const kit = useInterwovenKit();

  if (!mounted) return null;

  if (kit.isConnected) {
    return (
      <button
        onClick={kit.openWallet}
        className="text-[11px] px-3 py-1.5 border border-border text-muted hover:border-border-strong hover:text-fg transition-[border-color,color] duration-200"
      >
        {truncate(kit.username ?? kit.address ?? "")}
      </button>
    );
  }

  return (
    <button
      onClick={kit.openConnect}
      className="text-[11px] px-3 py-1.5 bg-fg text-bg font-medium hover:opacity-80 transition-opacity duration-200"
    >
      Connect
    </button>
  );
}

export function Nav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      {/* Logo — top left */}
      <Link
        href="/"
        className="fixed top-3 left-6 z-50 text-fg font-bold leading-none tracking-tighter"
        style={{ fontFamily: "var(--font-pixel)", fontSize: "2.5rem" }}
      >
        ti
      </Link>

      {/* Navigation bar — centered */}
      <nav
        className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-1.5 py-1.5 border transition-[background-color,border-color,backdrop-filter] duration-500"
        style={{
          backgroundColor: scrolled
            ? `color-mix(in srgb, var(--bg) 75%, transparent)`
            : `color-mix(in srgb, var(--bg) 40%, transparent)`,
          borderColor: scrolled ? "var(--border-strong)" : "var(--border)",
          backdropFilter: scrolled ? "blur(20px)" : "blur(12px)",
          WebkitBackdropFilter: scrolled ? "blur(20px)" : "blur(12px)",
        }}
      >
        {links.map((link) => navLink(link, pathname))}

        <span className="w-px h-4 bg-border mx-1" />

        <WalletButton />
      </nav>
    </>
  );
}
