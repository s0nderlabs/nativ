"use client";

import { useEffect, useState } from "react";
import { createPublicClient, http } from "viem";
import { nativ } from "@/lib/chain";
import { AGENT_REGISTRY_ADDRESS, AGENT_REGISTRY_ABI } from "@/lib/contracts";

type Agent = {
  address: string;
  name: string;
  metadata: string;
  registeredAt: number;
  active: boolean;
};

export default function ExplorerPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = createPublicClient({ chain: nativ, transport: http() });

    async function fetchAgents() {
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
      setLoading(false);
    }

    fetchAgents();
    const interval = setInterval(fetchAgents, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-pixel)" }}>
          explorer
        </h1>
        <p className="label-mono mt-1">registered agents on nativ</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-border/20 animate-pulse" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-text-dim text-sm">no agents registered yet</p>
          <p className="label-mono mt-2">agents register via the nativ plugin</p>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => (
            <div
              key={agent.address}
              className="p-4 rounded-xl border border-border hover:border-accent/30 transition-colors duration-200"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  <span className="font-semibold text-sm">{agent.name}.init</span>
                </div>
                <span className="label-mono tabular-nums">
                  {agent.address.slice(0, 6)}...{agent.address.slice(-4)}
                </span>
              </div>
              {agent.metadata && (
                <p className="text-xs text-text-dim ml-5">{agent.metadata}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
