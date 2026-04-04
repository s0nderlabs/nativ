"use client";

import { useEffect, useState, useRef } from "react";
import { createPublicClient, http, webSocket, formatEther } from "viem";
import { motion, AnimatePresence } from "framer-motion";
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

const typeConfig: Record<string, { label: string; icon: string }> = {
  registration: { label: "REG", icon: "+" },
  message: { label: "MSG", icon: "→" },
  task: { label: "TASK", icon: "◇" },
  transfer: { label: "SEND", icon: "↗" },
  deploy: { label: "DEPLOY", icon: "■" },
};

function EventCount({ count, label }: { count: number; label: string }) {
  return (
    <div className="text-right">
      <p className="text-sm font-bold tabular-nums text-fg">{count}</p>
      <p className="label-mono">{label}</p>
    </div>
  );
}

export default function LivePage() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [blockNumber, setBlockNumber] = useState(0);

  useEffect(() => {
    const httpClient = createPublicClient({ chain: nativ, transport: http() });
    let wsClient: any;
    const unwatchers: (() => void)[] = [];

    // Fetch initial block number
    httpClient.getBlockNumber().then((b) => setBlockNumber(Number(b))).catch(() => {});

    async function start() {
      try {
        wsClient = createPublicClient({
          chain: nativ,
          transport: webSocket("wss://nativ-ws.s0nderlabs.xyz"),
        });
        setConnected(true);
      } catch {
        setConnected(false);
        return;
      }

      unwatchers.push(
        wsClient.watchContractEvent({
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
        })
      );

      unwatchers.push(
        wsClient.watchContractEvent({
          address: MESSAGE_RELAY_ADDRESS,
          abi: MESSAGE_RELAY_ABI,
          eventName: "Message",
          onLogs: async (logs: any[]) => {
            for (const log of logs) {
              const from = await resolveName(log.args.from, httpClient);
              const to = await resolveName(log.args.to, httpClient);
              let preview = "";
              try {
                const raw = Buffer.from(
                  (log.args.payload as string).slice(2),
                  "hex"
                ).toString("utf-8");
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
        })
      );

      unwatchers.push(
        wsClient.watchContractEvent({
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
        })
      );

      unwatchers.push(
        wsClient.watchContractEvent({
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
        })
      );

      unwatchers.push(
        wsClient.watchBlocks({
          onBlock: async (block: any) => {
            setBlockNumber(Number(block.number));
            try {
              const fullBlock = await httpClient.getBlock({
                blockNumber: block.number,
                includeTransactions: true,
              });
              for (const tx of fullBlock.transactions as any[]) {
                if (typeof tx === "string") continue;
                if (!tx.to) {
                  const from = await resolveName(tx.from, httpClient);
                  const receipt = await httpClient.getTransactionReceipt({
                    hash: tx.hash,
                  });
                  addEvent({
                    type: "deploy",
                    text: `${from} deployed contract at ${receipt.contractAddress?.slice(0, 10)}...`,
                    from: tx.from,
                  });
                } else if (tx.value && tx.value > BigInt(0)) {
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
        })
      );
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

  // Event type counts
  const counts = events.reduce(
    (acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="max-w-5xl mx-auto px-6 pt-24 pb-10">
      {/* Header */}
      <div className="flex items-end justify-between mb-10">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            Live
          </h1>
          <p className="label-mono mt-1">Real-time chain activity</p>
        </div>

        <div className="flex items-center gap-6">
          {/* Connection status */}
          <div className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 ${connected ? "bg-fg animate-pulse" : "bg-muted"}`}
            />
            <span className="label-mono">
              {connected ? "Connected" : "Disconnected"}
            </span>
          </div>

          <span className="w-px h-6 bg-border" />

          <EventCount count={events.length} label="Events" />
          <span className="w-px h-6 bg-border" />
          <div className="text-right">
            <p className="text-sm font-bold tabular-nums text-fg">
              {blockNumber.toLocaleString()}
            </p>
            <p className="label-mono">Block</p>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div>
        {/* Column headers */}
        <div className="flex items-center px-4 py-2 border-b border-border mb-px">
          <span className="label-mono w-6 shrink-0" />
          <span className="label-mono w-16 shrink-0">Type</span>
          <span className="label-mono flex-1">Event</span>
          <span className="label-mono w-20 text-right">Time</span>
        </div>

        {events.length === 0 ? (
          <div className="text-center py-24">
            <p
              className="text-muted text-lg mb-2"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              {connected ? "Listening..." : "Connecting..."}
            </p>
            <p className="label-mono">
              {connected
                ? "Events will appear here as they happen on-chain"
                : "Waiting for WebSocket connection to nativ"}
            </p>

            {/* Pulse indicator */}
            {connected && (
              <div className="flex items-center justify-center gap-1 mt-8">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="w-1 h-1 bg-muted"
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      delay: i * 0.3,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {events.map((event) => {
              const config = typeConfig[event.type];
              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, height: 0, y: -4 }}
                  animate={{ opacity: 1, height: "auto", y: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="flex items-start gap-0 px-4 py-2.5 hover:bg-surface/50 transition-[background-color] duration-150 border-b border-border/50">
                    {/* Icon */}
                    <span className="w-6 shrink-0 text-muted text-xs mt-px">
                      {config.icon}
                    </span>

                    {/* Type label */}
                    <span className="w-16 shrink-0 text-[11px] tracking-[0.08em] text-fg font-medium mt-px">
                      {config.label}
                    </span>

                    {/* Event text */}
                    <span className="text-xs text-[#aaaaaa] leading-relaxed flex-1">
                      {event.text}
                    </span>

                    {/* Timestamp */}
                    <span className="label-mono shrink-0 tabular-nums w-20 text-right mt-px">
                      {event.timestamp.toLocaleTimeString("en-US", {
                        hour12: false,
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
