"use client";

import { useEffect, useState, useRef } from "react";
import { createPublicClient, http, webSocket, formatEther, parseAbiItem } from "viem";
import { nativ } from "@/lib/chain";
import {
  AGENT_REGISTRY_ADDRESS,
  AGENT_REGISTRY_ABI,
  MESSAGE_RELAY_ADDRESS,
  MESSAGE_RELAY_ABI,
  TASK_ESCROW_ADDRESS,
  TASK_ESCROW_ABI,
} from "@/lib/contracts";

type FeedEvent = {
  id: string;
  type: "registration" | "message" | "task" | "transfer" | "deploy";
  text: string;
  timestamp: Date;
  from?: string;
  to?: string;
};

// Cache: address → name
const nameCache = new Map<string, string>();

async function resolveName(address: string, client: any): Promise<string> {
  const lower = address.toLowerCase();
  if (nameCache.has(lower)) return nameCache.get(lower)!;
  try {
    const agent = await client.readContract({
      address: AGENT_REGISTRY_ADDRESS,
      abi: AGENT_REGISTRY_ABI,
      functionName: "getAgent" as any,
      args: [address as `0x${string}`],
    });
    if ((agent as any)?.name) {
      const name = `${(agent as any).name}.init`;
      nameCache.set(lower, name);
      return name;
    }
  } catch {}
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
  nameCache.set(lower, short);
  return short;
}

export default function LivePage() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const httpClient = createPublicClient({ chain: nativ, transport: http() });
    let wsClient: any;
    const unwatchers: (() => void)[] = [];

    async function start() {
      try {
        wsClient = createPublicClient({
          chain: nativ,
          transport: webSocket("ws://localhost:8546"),
        });
        setConnected(true);
      } catch {
        setConnected(false);
        return;
      }

      // Watch agent registrations
      unwatchers.push(wsClient.watchContractEvent({
        address: AGENT_REGISTRY_ADDRESS,
        abi: AGENT_REGISTRY_ABI,
        eventName: "AgentRegistered",
        onLogs: async (logs: any[]) => {
          for (const log of logs) {
            const name = log.args.name ?? "unknown";
            const metadata = log.args.metadata ?? "";
            addEvent({
              type: "registration",
              text: `${name}.init registered on nativ${metadata ? ` — "${metadata}"` : ""}`,
              from: log.args.agent,
            });
          }
        },
      }));

      // Watch messages
      unwatchers.push(wsClient.watchContractEvent({
        address: MESSAGE_RELAY_ADDRESS,
        abi: MESSAGE_RELAY_ABI,
        eventName: "Message",
        onLogs: async (logs: any[]) => {
          for (const log of logs) {
            const from = await resolveName(log.args.from, httpClient);
            const to = await resolveName(log.args.to, httpClient);
            let preview = "";
            try {
              const raw = Buffer.from((log.args.payload as string).slice(2), "hex").toString("utf-8");
              if (raw.length < 100 && !raw.includes("\x00")) {
                preview = ` — "${raw.slice(0, 60)}"`;
              }
            } catch {}
            addEvent({
              type: "message",
              text: `${from} → ${to}${preview || " [encrypted]"}`,
              from: log.args.from,
              to: log.args.to,
            });
          }
        },
      }));

      // Watch task events
      unwatchers.push(wsClient.watchContractEvent({
        address: TASK_ESCROW_ADDRESS,
        abi: TASK_ESCROW_ABI,
        eventName: "TaskCreated",
        onLogs: async (logs: any[]) => {
          for (const log of logs) {
            const client = await resolveName(log.args.client, httpClient);
            addEvent({
              type: "task",
              text: `${client} created task #${log.args.taskId}`,
              from: log.args.client,
            });
          }
        },
      }));

      unwatchers.push(wsClient.watchContractEvent({
        address: TASK_ESCROW_ADDRESS,
        abi: TASK_ESCROW_ABI,
        eventName: "TaskCompleted",
        onLogs: async (logs: any[]) => {
          for (const log of logs) {
            const payout = formatEther(log.args.providerPayout ?? BigInt(0));
            addEvent({
              type: "task",
              text: `Task #${log.args.taskId} completed — ${payout} NATIV paid`,
            });
          }
        },
      }));

      // Watch all transactions for deploys and transfers
      unwatchers.push(wsClient.watchBlocks({
        onBlock: async (block: any) => {
          try {
            const fullBlock = await httpClient.getBlock({ blockNumber: block.number, includeTransactions: true });
            for (const tx of (fullBlock.transactions as any[])) {
              if (typeof tx === "string") continue;
              // Contract deployment (to === null)
              if (!tx.to) {
                const from = await resolveName(tx.from, httpClient);
                const receipt = await httpClient.getTransactionReceipt({ hash: tx.hash });
                addEvent({
                  type: "deploy",
                  text: `${from} deployed contract at ${receipt.contractAddress?.slice(0, 10)}...`,
                  from: tx.from,
                });
              }
              // Value transfers (not to known contracts)
              else if (tx.value && tx.value > BigInt(0)) {
                const knownContracts = [
                  AGENT_REGISTRY_ADDRESS.toLowerCase(),
                  MESSAGE_RELAY_ADDRESS.toLowerCase(),
                  TASK_ESCROW_ADDRESS.toLowerCase(),
                ];
                if (!knownContracts.includes(tx.to.toLowerCase())) {
                  const from = await resolveName(tx.from, httpClient);
                  const to = await resolveName(tx.to, httpClient);
                  const amount = formatEther(tx.value);
                  addEvent({
                    type: "transfer",
                    text: `${from} sent ${amount} NATIV to ${to}`,
                    from: tx.from,
                    to: tx.to,
                  });
                }
              }
            }
          } catch {}
        },
      }));
    }

    start();

    function addEvent(partial: Omit<FeedEvent, "id" | "timestamp">) {
      const event: FeedEvent = {
        ...partial,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date(),
      };
      setEvents((prev) => [event, ...prev].slice(0, 200));
    }

    return () => {
      unwatchers.forEach((fn) => fn());
    };
  }, []);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [events]);

  const typeColors: Record<string, string> = {
    registration: "text-success",
    message: "text-accent",
    task: "text-amber-400",
    transfer: "text-purple-400",
    deploy: "text-pink-400",
  };

  const typeLabels: Record<string, string> = {
    registration: "REG",
    message: "MSG",
    task: "TASK",
    transfer: "SEND",
    deploy: "DEPLOY",
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-pixel)" }}>
            live
          </h1>
          <p className="label-mono mt-1">real-time chain activity</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-success animate-pulse" : "bg-fail"}`} />
          <span className="label-mono">{connected ? "connected" : "disconnected"}</span>
        </div>
      </div>

      <div ref={feedRef} className="space-y-1">
        {events.length === 0 && (
          <div className="text-center py-20">
            <p className="text-text-dim text-sm">waiting for activity...</p>
            <p className="label-mono mt-2">events will appear here in real-time</p>
          </div>
        )}
        {events.map((event) => (
          <div
            key={event.id}
            className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-surface transition-colors duration-150"
          >
            <span className={`label-mono ${typeColors[event.type]} shrink-0 w-14`}>
              {typeLabels[event.type]}
            </span>
            <span className="text-xs text-text leading-relaxed flex-1">
              {event.text}
            </span>
            <span className="label-mono shrink-0 tabular-nums">
              {event.timestamp.toLocaleTimeString("en-US", {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
