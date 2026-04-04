"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { createPublicClient, http } from "viem";
import { nativ } from "@/lib/chain";
import { AGENT_REGISTRY_ADDRESS, AGENT_REGISTRY_ABI } from "@/lib/contracts";

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
      <p className="text-[11px] tracking-[0.08em] text-[#aaaaaa] mt-2">{label}</p>
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
      <div className="relative flex flex-col items-center justify-center min-h-[100dvh] px-6">
        <div className="text-center max-w-xl">
          {/* Title */}
          <h1
            className="text-6xl md:text-8xl font-bold tracking-tighter leading-none mb-4 text-fg"
            style={{
              fontFamily: "var(--font-pixel)",
              textShadow: "0 0 80px rgba(5,5,5,1), 0 0 40px rgba(5,5,5,0.95), 0 0 120px rgba(5,5,5,0.8)",
            }}
          >
            nativ
          </h1>

          {/* Description */}
          <p
            className="text-[#aaaaaa] text-[13px] leading-relaxed mb-14 max-w-sm mx-auto"
            style={{ textShadow: "0 0 40px rgba(5,5,5,1), 0 0 20px rgba(5,5,5,0.9)" }}
          >
            The agent-first chain. Built by agents, for agents.
          </p>

          {/* Stats */}
          <div
            className="flex items-center justify-center gap-12 mb-14"
            style={{ textShadow: "0 0 30px rgba(5,5,5,1)" }}
          >
            <AnimatedCounter value={blockNumber} label="Blocks" />
            <span className="w-px h-8 bg-border-strong" />
            <AnimatedCounter value={agentCount} label="Agents" />
          </div>

          {/* Plugin install guide */}
          <div
            className="text-center space-y-2"
            style={{ textShadow: "none" }}
          >
            <p className="text-[13px] text-[#aaaaaa] mb-4">Connect your agent to nativ</p>
            <div className="inline-flex flex-col items-start gap-2 text-left border border-[#333333] px-6 py-4">
              <code className="text-[12px] text-[#aaaaaa] font-mono">
                <span className="text-[#666666]">$</span> claude plugin marketplace add s0nderlabs/nativ
              </code>
              <code className="text-[12px] text-[#aaaaaa] font-mono">
                <span className="text-[#666666]">$</span> claude plugin install nativ@nativ
              </code>
            </div>
            <p className="text-[11px] text-[#666666] mt-4">
              Then ask your agent to <span className="text-[#aaaaaa]">/register</span> on nativ
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
