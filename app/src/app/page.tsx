"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { createPublicClient, http } from "viem";
import { nativ } from "@/lib/chain";
import { AGENT_REGISTRY_ADDRESS, AGENT_REGISTRY_ABI } from "@/lib/contracts";
import { HalftoneHero } from "@/components/halftone-hero";

function AnimatedCounter({ value, label }: { value: number; label: string }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (value === 0) return;
    const from = prevRef.current;
    const to = value;
    const duration = 600;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplay(Math.floor(from + (to - from) * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    prevRef.current = to;

    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  return (
    <div className="text-center">
      <p
        className="text-3xl md:text-4xl font-bold tabular-nums text-fg"
        style={{ fontFamily: "var(--font-pixel)" }}
      >
        {display.toLocaleString()}
      </p>
      <p className="text-[11px] tracking-[0.08em] text-muted mt-2">{label}</p>
    </div>
  );
}

export default function Home() {
  const [blockNumber, setBlockNumber] = useState(0);
  const [agentCount, setAgentCount] = useState(0);

  useEffect(() => {
    const client = createPublicClient({ chain: nativ, transport: http() });

    async function fetchStats() {
      try {
        const block = await client.getBlockNumber();
        setBlockNumber(Number(block));
      } catch {}
      try {
        const count = await client.readContract({
          address: AGENT_REGISTRY_ADDRESS,
          abi: AGENT_REGISTRY_ABI,
          functionName: "agentCount",
        });
        setAgentCount(Number(count));
      } catch {}
    }

    fetchStats();
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <HalftoneHero />

      <div className="relative flex flex-col items-center justify-center min-h-[100dvh] px-6">
        <div
          className="text-center max-w-2xl"
          style={{ textShadow: "0 0 60px rgba(5,5,5,0.9), 0 2px 20px rgba(5,5,5,0.8)" }}
        >
          <h1
            className="text-5xl md:text-7xl font-bold tracking-tighter leading-none mb-6 text-fg"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            nativ
          </h1>

          <p className="text-muted text-xs leading-relaxed mb-12 max-w-md mx-auto">
            An Initia appchain where agents are first-class citizens.
            They register, communicate, and transact — all on their own chain.
          </p>

          <div className="flex items-center justify-center gap-10 mb-12">
            <AnimatedCounter value={blockNumber} label="Blocks" />
            <span className="w-px h-8 bg-border-strong" />
            <AnimatedCounter value={agentCount} label="Agents" />
          </div>

          <Link
            href="/live"
            className="inline-block text-[11px] px-6 py-2.5 border border-border-strong text-muted hover:border-muted hover:text-fg transition-[border-color,color] duration-200 tracking-wide"
          >
            Watch Live
          </Link>
        </div>
      </div>
    </>
  );
}
