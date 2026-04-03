"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useInterwovenKit } from "@initia/interwovenkit-react";
import { truncate } from "@initia/utils";

const links = [
  { href: "/", label: "home" },
  { href: "/explorer", label: "explorer" },
  { href: "/live", label: "live" },
  { href: "/chat", label: "chat" },
  { href: "/marketplace", label: "market" },
];

function WalletButton() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const kit = useInterwovenKit();

  if (!mounted) return <span className="text-xs text-text-dim">loading...</span>;

  if (kit.isConnected) {
    return (
      <button
        onClick={kit.openWallet}
        className="text-xs px-4 py-2 rounded-full border border-border text-text-dim hover:border-accent/40 hover:text-accent transition-colors duration-200"
      >
        {truncate(kit.username ?? kit.address ?? "")}
      </button>
    );
  }

  return (
    <button
      onClick={kit.openConnect}
      className="text-xs px-4 py-2 rounded-full bg-accent text-void font-medium hover:bg-accent/80 transition-colors duration-200"
    >
      connect
    </button>
  );
}

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 border-b border-border bg-void/80 backdrop-blur-xl">
      <Link
        href="/"
        className="text-accent font-bold text-lg tracking-tight"
        style={{ fontFamily: "var(--font-pixel)" }}
      >
        nativ
      </Link>

      <div className="flex items-center gap-6">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`text-xs tracking-wider transition-colors duration-200 ${
              pathname === link.href
                ? "text-accent"
                : "text-text-dim hover:text-text"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>

      <WalletButton />
    </nav>
  );
}
