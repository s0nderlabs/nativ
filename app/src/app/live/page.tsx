"use client";

import { useEffect, useState, useRef } from "react";
import { createPublicClient, http, webSocket, formatEther, parseAbiItem } from "viem";
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
  type: "registration" | "deregistration" | "update" | "message" | "task" | "transfer" | "deploy" | "call";
  text: string;
  timestamp: Date;
  from?: string;
  to?: string;
};

type BlockInfo = {
  number: number;
  txCount: number;
  timestamp: number;
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
  deregistration: { label: "DEREG", icon: "−" },
  update: { label: "UPDATE", icon: "~" },
  message: { label: "MSG", icon: "→" },
  task: { label: "TASK", icon: "◇" },
  transfer: { label: "SEND", icon: "↗" },
  deploy: { label: "DEPLOY", icon: "■" },
  call: { label: "CALL", icon: "⚡" },
};

function BlockStrip({ blocks }: { blocks: BlockInfo[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [blocks.length]);

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <p className="label-mono">Block Production</p>
        <p className="label-mono tabular-nums">
          {blocks.length > 0 ? `#${blocks[blocks.length - 1].number.toLocaleString()}` : "—"}
        </p>
      </div>
      <div
        ref={scrollRef}
        className="overflow-hidden"
        style={{
          maskImage: "linear-gradient(to right, transparent 0%, black 8%, black 100%)",
          WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 8%, black 100%)",
        }}
      >
        <div className="flex items-end gap-px w-max">
          {blocks.map((block) => {
            const hasTx = block.txCount > 0;
            const height = hasTx ? 16 + Math.min(block.txCount * 4, 16) : 16;
            return (
              <div
                key={block.number}
                className="shrink-0 group/block relative"
                style={{ width: 8, height }}
                title={`#${block.number.toLocaleString()} — ${block.txCount} tx${block.txCount !== 1 ? "s" : ""}`}
              >
                <div
                  className={`w-full h-full ${hasTx ? "bg-fg/40" : "bg-fg/10"} group-hover/block:bg-fg/60 transition-[background-color] duration-150`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function LivePage() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [blocks, setBlocks] = useState<BlockInfo[]>([]);
  const [connected, setConnected] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
    const httpClient = createPublicClient({ chain: nativ, transport: http() });
    let wsClient: any;
    const unwatchers: (() => void)[] = [];

    function addEvent(partial: Omit<FeedEvent, "id" | "timestamp">) {
      const event: FeedEvent = {
        ...partial,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date(),
      };
      setEvents((prev) => [event, ...prev].slice(0, 300));
    }

    function addBlock(info: BlockInfo) {
      setBlocks((prev) => {
        if (prev.length > 0 && prev[prev.length - 1].number >= info.number) return prev;
        return [...prev, info].slice(-200);
      });
    }

    // Seed with historical events
    async function loadHistory() {
      try {
        const currentBlock = await httpClient.getBlockNumber();
        const fromBlock = BigInt(0);

        const historicalEvents: FeedEvent[] = [];

        // Fetch all event types in parallel
        const [regLogs, deregLogs, updateLogs, msgLogs, deployLogs] = await Promise.all([
          httpClient.getLogs({
            address: AGENT_REGISTRY_ADDRESS,
            event: parseAbiItem("event AgentRegistered(address indexed agent, string name, string metadata)"),
            fromBlock,
            toBlock: currentBlock,
          }).catch(() => []),
          httpClient.getLogs({
            address: AGENT_REGISTRY_ADDRESS,
            event: parseAbiItem("event AgentDeregistered(address indexed agent, string name)"),
            fromBlock,
            toBlock: currentBlock,
          }).catch(() => []),
          httpClient.getLogs({
            address: AGENT_REGISTRY_ADDRESS,
            event: parseAbiItem("event AgentUpdated(address indexed agent, string metadata)"),
            fromBlock,
            toBlock: currentBlock,
          }).catch(() => []),
          httpClient.getLogs({
            address: MESSAGE_RELAY_ADDRESS,
            event: parseAbiItem("event Message(address indexed from, address indexed to, bytes payload, uint256 timestamp)"),
            fromBlock,
            toBlock: currentBlock,
          }).catch(() => []),
          // Catch deploys via Transfer from 0x0 (every ERC-20 constructor emits this)
          httpClient.getLogs({
            event: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"),
            args: { from: "0x0000000000000000000000000000000000000000" as `0x${string}` },
            fromBlock,
            toBlock: currentBlock,
          }).catch(() => []),
        ]);

        // Collect unique block numbers for timestamp lookup
        const blockNums = new Set<bigint>();
        for (const log of [...regLogs, ...deregLogs, ...updateLogs, ...msgLogs, ...deployLogs]) {
          if (log.blockNumber) blockNums.add(log.blockNumber);
        }

        // Fetch block timestamps in parallel (batched)
        const blockTimestamps = new Map<bigint, number>();
        const blockFetches = [...blockNums].map(async (num) => {
          try {
            const b = await httpClient.getBlock({ blockNumber: num });
            blockTimestamps.set(num, Number(b.timestamp) * 1000);
          } catch {}
        });
        await Promise.all(blockFetches);

        function getTimestamp(blockNum: bigint | null): Date {
          if (blockNum && blockTimestamps.has(blockNum)) return new Date(blockTimestamps.get(blockNum)!);
          return new Date();
        }

        for (const log of regLogs) {
          const name = (log as any).args.name ?? "unknown";
          const metadata = (log as any).args.metadata ?? "";
          historicalEvents.push({
            id: `hist-reg-${log.blockNumber}-${log.logIndex}`,
            type: "registration",
            text: `${name}.init registered on nativ${metadata ? ` — "${metadata}"` : ""}`,
            from: (log as any).args.agent,
            timestamp: getTimestamp(log.blockNumber),
          });
        }

        for (const log of deregLogs) {
          const name = (log as any).args.name ?? "unknown";
          historicalEvents.push({
            id: `hist-dereg-${log.blockNumber}-${log.logIndex}-${Math.random().toString(36).slice(2, 6)}`,
            type: "deregistration",
            text: `${name}.init deregistered from nativ`,
            from: (log as any).args.agent,
            timestamp: getTimestamp(log.blockNumber),
          });
        }

        for (const log of updateLogs) {
          const from = await resolveName((log as any).args.agent, httpClient);
          const metadata = (log as any).args.metadata ?? "";
          historicalEvents.push({
            id: `hist-upd-${log.blockNumber}-${log.logIndex}`,
            type: "update",
            text: `${from} updated metadata${metadata ? ` — "${metadata.slice(0, 60)}"` : ""}`,
            from: (log as any).args.agent,
            timestamp: getTimestamp(log.blockNumber),
          });
        }

        for (const log of msgLogs) {
          const from = await resolveName((log as any).args.from, httpClient);
          const to = await resolveName((log as any).args.to, httpClient);
          let preview = "";
          try {
            const raw = Buffer.from(((log as any).args.payload as string).slice(2), "hex").toString("utf-8");
            if (raw.length < 100 && !raw.includes("\x00")) {
              preview = ` — "${raw.slice(0, 60)}"`;
            }
          } catch {}
          historicalEvents.push({
            id: `hist-msg-${log.blockNumber}-${log.logIndex}`,
            type: "message",
            text: `${from} → ${to}${preview || " [encrypted]"}`,
            from: (log as any).args.from,
            to: (log as any).args.to,
            timestamp: getTimestamp(log.blockNumber),
          });
        }

        // Deduplicate deploy logs by contract address (the emitting address)
        const seenContracts = new Set<string>();
        for (const log of deployLogs) {
          const contractAddr = (log as any).address?.toLowerCase();
          if (seenContracts.has(contractAddr)) continue;
          seenContracts.add(contractAddr);

          // The 'to' in Transfer(0x0 → deployer) is the deployer
          const deployer = (log as any).args?.to;
          const from = deployer ? await resolveName(deployer, httpClient) : "unknown";
          historicalEvents.push({
            id: `hist-deploy-${log.blockNumber}-${log.logIndex}`,
            type: "deploy",
            text: `${from} deployed contract at ${contractAddr?.slice(0, 10)}...`,
            from: deployer,
            timestamp: getTimestamp(log.blockNumber),
          });
        }

        // Seed block strip — just use the latest block number, fill with placeholders
        const seedCount = 30;
        const seedBlocks: BlockInfo[] = [];
        for (let i = 0; i < seedCount; i++) {
          seedBlocks.push({
            number: Number(currentBlock) - seedCount + i + 1,
            txCount: 0,
            timestamp: Math.floor(Date.now() / 1000) - (seedCount - i),
          });
        }
        setBlocks(seedBlocks);

        // Reverse so newest events are first (getLogs returns oldest-first)
        historicalEvents.reverse();
        if (historicalEvents.length > 0) {
          setEvents(historicalEvents.slice(0, 50));
        }
        setHistoryLoaded(true);
      } catch {}
    }

    async function start() {
      await loadHistory();

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
          address: AGENT_REGISTRY_ADDRESS,
          abi: AGENT_REGISTRY_ABI,
          eventName: "AgentDeregistered",
          onLogs: async (logs: any[]) => {
            for (const log of logs) {
              const name = log.args.name ?? "unknown";
              addEvent({
                type: "deregistration",
                text: `${name}.init deregistered from nativ`,
                from: log.args.agent,
              });
            }
          },
        })
      );

      unwatchers.push(
        wsClient.watchContractEvent({
          address: AGENT_REGISTRY_ADDRESS,
          abi: AGENT_REGISTRY_ABI,
          eventName: "AgentUpdated",
          onLogs: async (logs: any[]) => {
            for (const log of logs) {
              const from = await resolveName(log.args.agent, httpClient);
              const metadata = log.args.metadata ?? "";
              addEvent({
                type: "update",
                text: `${from} updated metadata${metadata ? ` — "${metadata.slice(0, 60)}"` : ""}`,
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
        wsClient.watchContractEvent({
          address: TASK_ESCROW_ADDRESS,
          abi: TASK_ESCROW_ABI,
          eventName: "TaskFunded",
          onLogs: async (logs: any[]) => {
            for (const log of logs) {
              const amount = formatEther(log.args.amount ?? BigInt(0));
              addEvent({
                type: "task",
                text: `Task #${log.args.taskId} funded with ${amount} NATIV`,
              });
            }
          },
        })
      );

      unwatchers.push(
        wsClient.watchContractEvent({
          address: TASK_ESCROW_ADDRESS,
          abi: TASK_ESCROW_ABI,
          eventName: "WorkSubmitted",
          onLogs: async (logs: any[]) => {
            for (const log of logs) {
              addEvent({
                type: "task",
                text: `Work submitted for task #${log.args.taskId}`,
              });
            }
          },
        })
      );

      unwatchers.push(
        wsClient.watchBlocks({
          onBlock: async (block: any) => {
            const num = Number(block?.number ?? 0);
            if (num === 0) return;

            let txCount = 0;
            try {
              // Delay slightly — MiniEVM WS announces blocks before HTTP indexes them
              await new Promise((r) => setTimeout(r, 800));
              const fullBlock = await httpClient.getBlock({
                blockNumber: BigInt(num),
                includeTransactions: true,
              });
              txCount = (fullBlock.transactions as any[]).length;

              const knownContracts = [
                AGENT_REGISTRY_ADDRESS.toLowerCase(),
                MESSAGE_RELAY_ADDRESS.toLowerCase(),
                TASK_ESCROW_ADDRESS.toLowerCase(),
              ];

              for (const tx of fullBlock.transactions as any[]) {
                if (typeof tx === "string") continue;
                // Skip txs to known contracts — those are already caught by event watchers
                if (tx.to && knownContracts.includes(tx.to.toLowerCase())) continue;

                if (!tx.to) {
                  const from = await resolveName(tx.from, httpClient);
                  try {
                    // Small delay — MiniEVM may need a moment to index the receipt
                    await new Promise((r) => setTimeout(r, 500));
                    const receipt = await httpClient.getTransactionReceipt({ hash: tx.hash });
                    addEvent({
                      type: "deploy",
                      text: `${from} deployed contract at ${receipt.contractAddress?.slice(0, 10)}...`,
                      from: tx.from,
                    });
                  } catch (err) {
                    // Still show deploy even if receipt fetch fails
                    addEvent({
                      type: "deploy",
                      text: `${from} deployed a contract`,
                      from: tx.from,
                    });
                  }
                } else if (tx.value && tx.value > BigInt(0)) {
                  const from = await resolveName(tx.from, httpClient);
                  const to = await resolveName(tx.to, httpClient);
                  const amount = formatEther(tx.value);
                  addEvent({
                    type: "transfer",
                    text: `${from} sent ${amount} NATIV to ${to}`,
                    from: tx.from,
                    to: tx.to,
                  });
                } else if (tx.input && tx.input.length > 10) {
                  // Generic contract call (not a known contract, has calldata)
                  const from = await resolveName(tx.from, httpClient);
                  const target = tx.to ? `${tx.to.slice(0, 10)}...` : "unknown";
                  addEvent({
                    type: "call",
                    text: `${from} called contract ${target}`,
                    from: tx.from,
                  });
                }
              }
            } catch {}

            addBlock({ number: num, txCount, timestamp: Math.floor(Date.now() / 1000) });
          },
        })
      );
    }

    start();

    return () => {
      unwatchers.forEach((fn) => fn());
    };
  }, []);

  const latestBlock = blocks.length > 0 ? blocks[blocks.length - 1].number : 0;

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
          <div className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 ${connected ? "bg-fg animate-pulse" : "bg-muted"}`}
            />
            <span className="label-mono">
              {connected ? "Connected" : "Connecting"}
            </span>
          </div>

          <span className="w-px h-6 bg-border" />

          <div className="text-right">
            <p className="text-sm font-bold tabular-nums text-fg">{events.length}</p>
            <p className="label-mono">Events</p>
          </div>
          <span className="w-px h-6 bg-border" />
          <div className="text-right">
            <p className="text-sm font-bold tabular-nums text-fg">
              {latestBlock.toLocaleString()}
            </p>
            <p className="label-mono">Block</p>
          </div>
        </div>
      </div>

      {/* Block strip — visual heartbeat */}
      <BlockStrip blocks={blocks} />

      {/* Event feed */}
      <div className="flex flex-col" style={{ maxHeight: "calc(100dvh - 320px)" }}>
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
              Loading...
            </p>
            <p className="label-mono">
              Fetching historical events and connecting to chain
            </p>
            <div className="flex items-center justify-center gap-1 mt-8">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1 h-1 bg-muted"
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: "none" }}>
          <AnimatePresence>
            {events.map((event, i) => {
              const config = typeConfig[event.type];
              const isHistorical = event.id.startsWith("hist-");
              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={isHistorical
                    ? { duration: 0.4, delay: i * 0.03, ease: [0.16, 1, 0.3, 1] }
                    : { duration: 0.2, ease: [0.16, 1, 0.3, 1] }
                  }
                  className="overflow-hidden will-change-[transform,opacity]"
                >
                  <div className="flex items-start gap-0 px-4 py-2 border-b border-border/30 hover:bg-surface/50 transition-[background-color] duration-150">
                    <span className="w-6 shrink-0 text-xs text-muted mt-px">
                      {config.icon}
                    </span>
                    <span className="w-16 shrink-0 text-[11px] tracking-[0.08em] text-fg font-medium mt-px">
                      {config.label}
                    </span>
                    <span className="text-xs text-[#aaaaaa] leading-relaxed flex-1">
                      {event.text}
                    </span>
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
          </div>
        )}
      </div>
    </div>
  );
}
