"use client";

import { useEffect, useState } from "react";
import { createPublicClient, http } from "viem";
import { motion } from "framer-motion";
import { nativ } from "@/lib/chain";
import { AGENT_REGISTRY_ADDRESS, AGENT_REGISTRY_ABI } from "@/lib/contracts";

type Agent = {
  address: string;
  name: string;
  metadata: string;
  registeredAt: number;
  active: boolean;
};

function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function AgentInitial({ name }: { name: string }) {
  // Deterministic shade from name — maps to a gray between #2a and #4a
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const shade = 0x2a + (Math.abs(hash) % 0x20);
  const hex = shade.toString(16);

  return (
    <div
      className="w-8 h-8 flex items-center justify-center text-[11px] font-bold text-fg shrink-0"
      style={{
        backgroundColor: `#${hex}${hex}${hex}`,
        fontFamily: "var(--font-pixel)",
      }}
    >
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function CopyableAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={handleCopy}
      className="label-mono tabular-nums hover:text-fg transition-[color] duration-150"
      title="Copy full address"
    >
      {copied ? "Copied" : `${address.slice(0, 6)}...${address.slice(-4)}`}
    </button>
  );
}

export default function ExplorerPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [blockNumber, setBlockNumber] = useState(0);

  useEffect(() => {
    const client = createPublicClient({ chain: nativ, transport: http() });

    async function fetchData() {
      try {
        const [addresses, agentData] = (await client.readContract({
          address: AGENT_REGISTRY_ADDRESS,
          abi: AGENT_REGISTRY_ABI,
          functionName: "getAgents",
        })) as [string[], any[]];

        setAgents(
          addresses.map((addr, i) => ({
            address: addr,
            name: agentData[i].name,
            metadata: agentData[i].metadata,
            registeredAt: Number(agentData[i].registeredAt),
            active: agentData[i].active,
          }))
        );
      } catch (err) {
        console.error("Failed to fetch agents:", err);
      }

      try {
        const block = await client.getBlockNumber();
        setBlockNumber(Number(block));
      } catch {}

      setLoading(false);
    }

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 pt-24 pb-10">
      {/* Header */}
      <div className="flex items-end justify-between mb-10">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            Explorer
          </h1>
          <p className="label-mono mt-1">Agent registry on nativ</p>
        </div>

        {/* Stats strip */}
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-sm font-bold tabular-nums text-fg">{agents.length}</p>
            <p className="label-mono">Agents</p>
          </div>
          <span className="w-px h-6 bg-border" />
          <div className="text-right">
            <p className="text-sm font-bold tabular-nums text-fg">
              {blockNumber.toLocaleString()}
            </p>
            <p className="label-mono">Block</p>
          </div>
          <span className="w-px h-6 bg-border" />
          <div className="text-right">
            <p className="text-sm font-bold text-fg">nativ-1</p>
            <p className="label-mono">Chain</p>
          </div>
        </div>
      </div>

      {/* Table header */}
      <div className="flex items-center px-4 py-2 border-b border-border mb-px">
        <span className="label-mono w-8 shrink-0" />
        <span className="label-mono flex-1 ml-3">Agent</span>
        <span className="label-mono w-32 text-right hidden md:block">Registered</span>
        <span className="label-mono w-36 text-right">Address</span>
      </div>

      {/* Agent list */}
      {loading ? (
        <div className="space-y-px">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-16 bg-surface animate-pulse"
              style={{ opacity: 1 - i * 0.2 }}
            />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-muted text-sm">No agents registered yet</p>
          <p className="label-mono mt-2">Agents register via the nativ plugin</p>
        </div>
      ) : (
        <div className="space-y-px">
          {agents.map((agent, i) => (
            <motion.div
              key={agent.address}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              className="group flex items-center px-4 py-3 border border-transparent hover:border-border-strong hover:bg-surface/50 transition-[border-color,background-color] duration-200"
            >
              {/* Avatar */}
              <AgentInitial name={agent.name} />

              {/* Name + metadata */}
              <div className="ml-3 flex-1 min-w-0">
                <p className="text-sm font-semibold text-fg">
                  {agent.name}
                  <span className="text-muted font-normal">.init</span>
                </p>
                {agent.metadata && (
                  <p className="text-xs text-muted truncate mt-0.5">{agent.metadata}</p>
                )}
              </div>

              {/* Registration time */}
              <span className="label-mono w-32 text-right hidden md:block">
                {timeAgo(agent.registeredAt)}
              </span>

              {/* Address */}
              <div className="w-36 text-right">
                <CopyableAddress address={agent.address} />
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
