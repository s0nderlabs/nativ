"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  createPublicClient,
  http,
  webSocket,
  toHex,
  encodeFunctionData,
} from "viem";
import { useAccount, useSendTransaction } from "wagmi";
import { useInterwovenKit } from "@initia/interwovenkit-react";
import { motion, AnimatePresence } from "framer-motion";
import { nativ, CHAIN_ID } from "@/lib/chain";
import {
  AGENT_REGISTRY_ADDRESS,
  AGENT_REGISTRY_ABI,
  MESSAGE_RELAY_ADDRESS,
  MESSAGE_RELAY_ABI,
} from "@/lib/contracts";

type Message = {
  id: string;
  from: string;
  to: string;
  fromName: string;
  text: string;
  timestamp: Date;
  direction: "in" | "out";
  historical?: boolean;
};

type Agent = {
  address: string;
  name: string;
};

const FAUCET_URL = "https://nativ-faucet.s0nderlabs.xyz";

function hexToText(hex: string): string {
  try {
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    const bytes = new Uint8Array(
      clean.match(/.{2}/g)!.map((b) => parseInt(b, 16))
    );
    return new TextDecoder().decode(bytes);
  } catch {
    return "[encrypted]";
  }
}

function AgentInitial({ name }: { name: string }) {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
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

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function ChatPage() {
  const { address } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();
  const kit = useInterwovenKit();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const initialLoad = useRef(true);

  // Load agents
  useEffect(() => {
    const client = createPublicClient({ chain: nativ, transport: http() });
    async function load() {
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
          }))
        );
      } catch {}
    }
    load();
  }, []);

  // Load historical messages
  useEffect(() => {
    if (!address) return;

    const client = createPublicClient({ chain: nativ, transport: http() });

    async function loadHistory() {
      setLoadingHistory(true);
      try {
        // Fetch messages sent BY and TO the connected user
        const msgEvent = {
          type: "event" as const,
          name: "Message" as const,
          inputs: [
            { name: "from", type: "address", indexed: true },
            { name: "to", type: "address", indexed: true },
            { name: "payload", type: "bytes", indexed: false },
            { name: "timestamp", type: "uint256", indexed: false },
          ],
        } as const;
        const [sentLogs, receivedLogs] = await Promise.all([
          client.getLogs({ address: MESSAGE_RELAY_ADDRESS, event: msgEvent, args: { from: address }, fromBlock: BigInt(0), toBlock: "latest" }).catch(() => []),
          client.getLogs({ address: MESSAGE_RELAY_ADDRESS, event: msgEvent, args: { to: address }, fromBlock: BigInt(0), toBlock: "latest" }).catch(() => []),
        ]);

        const allLogs = [...sentLogs, ...receivedLogs];

        // Deduplicate by tx hash + log index
        const seen = new Set<string>();
        const unique = allLogs.filter((log) => {
          const key = `${log.transactionHash}-${log.logIndex}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // Resolve agent names
        const addressNameMap = new Map<string, string>();
        for (const agent of agents) {
          addressNameMap.set(agent.address.toLowerCase(), agent.name);
        }

        const historicalMessages: Message[] = unique.map((log) => {
          const from = (log.args.from as string).toLowerCase();
          const to = (log.args.to as string).toLowerCase();
          const fromName =
            addressNameMap.get(from) ??
            `${from.slice(0, 6)}...${from.slice(-4)}`;
          const timestamp = new Date(
            Number(log.args.timestamp as bigint) * 1000
          );

          return {
            id: `hist-${log.transactionHash}-${log.logIndex}`,
            from,
            to,
            fromName: fromName.includes("...")
              ? fromName
              : `${fromName}.init`,
            text: hexToText(log.args.payload as string),
            timestamp,
            direction: from === address!.toLowerCase() ? "out" : "in",
            historical: true,
          };
        });

        // Sort chronologically (oldest first for chat)
        historicalMessages.sort(
          (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
        );
        setMessages(historicalMessages);
        setTimeout(() => {
          initialLoad.current = false;
        }, 500);
      } catch (err) {
        console.error("Failed to load message history:", err);
      }
      setLoadingHistory(false);
    }

    loadHistory();
  }, [address, agents]);

  // WebSocket listener for live messages
  useEffect(() => {
    if (!address) return;

    let wsClient: any;
    try {
      wsClient = createPublicClient({
        chain: nativ,
        transport: webSocket("wss://nativ-ws.s0nderlabs.xyz"),
      });
    } catch {
      return;
    }

    const unwatch = wsClient.watchContractEvent({
      address: MESSAGE_RELAY_ADDRESS,
      abi: MESSAGE_RELAY_ABI,
      eventName: "Message",
      onLogs: async (logs: any[]) => {
        for (const log of logs) {
          const to = (log.args.to as string).toLowerCase();
          const from = (log.args.from as string).toLowerCase();

          if (to !== address.toLowerCase() && from !== address.toLowerCase())
            continue;

          // Check for duplicate (already in history)
          const logId = `hist-${log.transactionHash}-${log.logIndex}`;
          setMessages((prev) => {
            if (prev.some((m) => m.id === logId)) return prev;

            let fromName = from.slice(0, 8);
            const agent = agents.find(
              (a) => a.address.toLowerCase() === from
            );
            if (agent) fromName = `${agent.name}.init`;

            return [
              ...prev,
              {
                id: `live-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                from,
                to,
                fromName,
                text: hexToText(log.args.payload as string),
                timestamp: new Date(),
                direction:
                  from === address.toLowerCase() ? ("out" as const) : ("in" as const),
              },
            ];
          });
        }
      },
    });

    return () => unwatch();
  }, [address, agents]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, selectedAgent]);

  // Send message — dual path
  const handleSend = useCallback(async () => {
    if (!input.trim() || !selectedAgent || !address || sending) return;
    setSending(true);

    try {
      const calldata = encodeFunctionData({
        abi: MESSAGE_RELAY_ABI,
        functionName: "sendMessage",
        args: [
          selectedAgent.address as `0x${string}`,
          toHex(new TextEncoder().encode(input)),
        ],
      });

      // Use Cosmos auto-sign path if enabled, otherwise EVM direct
      if (kit.autoSign?.isEnabledByChain?.[CHAIN_ID]) {
        await kit.requestTxSync({
          chainId: CHAIN_ID,
          messages: [
            {
              typeUrl: "/minievm.evm.v1.MsgCall",
              value: {
                sender: kit.initiaAddress,
                contractAddr: MESSAGE_RELAY_ADDRESS,
                input: calldata,
                value: "0",
                accessList: [],
                authList: [],
              },
            },
          ],
        });
      } else {
        await sendTransactionAsync({
          to: MESSAGE_RELAY_ADDRESS,
          data: calldata,
        });
      }

      setInput("");
    } catch (err) {
      console.error("Send failed:", err);
    }
    setSending(false);
  }, [input, selectedAgent, address, sending, kit, sendTransactionAsync]);

  // Request faucet funds
  const [faucetStatus, setFaucetStatus] = useState<string | null>(null);
  const handleFaucet = useCallback(async () => {
    if (!address) return;
    setFaucetStatus("requesting...");
    try {
      const res = await fetch(FAUCET_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (res.ok) {
        setFaucetStatus("1 NATIV received");
        setTimeout(() => setFaucetStatus(null), 3000);
      } else {
        setFaucetStatus(data.error ?? "failed");
        setTimeout(() => setFaucetStatus(null), 3000);
      }
    } catch {
      setFaucetStatus("faucet unavailable");
      setTimeout(() => setFaucetStatus(null), 3000);
    }
  }, [address]);

  // Pre-cache public key so InterwovenKit doesn't query Initia L1
  const ensurePublicKeyCached = useCallback(async () => {
    if (!kit.initiaAddress) return;
    const cacheKey = `interwovenkit:public-key:${kit.initiaAddress}`;
    if (localStorage.getItem(cacheKey)) return;

    try {
      const res = await fetch(
        `https://nativ-api.s0nderlabs.xyz/cosmos/auth/v1beta1/account_info/${kit.initiaAddress}`
      );
      const data = await res.json();
      const b64Key = data?.info?.pub_key?.key;
      if (b64Key) {
        const bytes = Uint8Array.from(atob(b64Key), (c) => c.charCodeAt(0));
        const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
        localStorage.setItem(cacheKey, hex);
      }
    } catch {}
  }, [kit.initiaAddress]);

  // Enable auto-sign
  const handleEnableAutoSign = useCallback(async () => {
    try {
      await ensurePublicKeyCached();
      await kit.autoSign.enable(CHAIN_ID);
    } catch (err: any) {
      console.error("[auto-sign] enable failed:", err?.message, err);
    }
  }, [kit, ensurePublicKeyCached]);

  // Filter messages for selected conversation
  const filteredMessages = selectedAgent
    ? messages.filter((m) => {
        const me = address!.toLowerCase();
        const them = selectedAgent.address.toLowerCase();
        return (
          (m.from === me && m.to === them) ||
          (m.from === them && m.to === me)
        );
      })
    : [];

  // Unread count per agent
  const unreadCounts = new Map<string, number>();
  if (address) {
    for (const msg of messages) {
      if (msg.direction === "in") {
        const from = msg.from.toLowerCase();
        unreadCounts.set(from, (unreadCounts.get(from) ?? 0) + 1);
      }
    }
  }

  if (!address) {
    return (
      <div className="max-w-4xl mx-auto px-6 pt-24 pb-10">
        <h1
          className="text-2xl font-bold tracking-tight mb-4"
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          Chat
        </h1>
        <p className="text-muted text-sm">
          Connect your wallet to message agents on-chain
        </p>
      </div>
    );
  }

  const showAutoSignBanner =
    kit.isConnected &&
    !kit.autoSign?.isEnabledByChain?.[CHAIN_ID];

  return (
    <div className="max-w-5xl mx-auto px-6 pt-24 pb-6 flex flex-col h-[calc(100dvh-24px)]">
      {/* Header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            Chat
          </h1>
          <p className="label-mono mt-1">On-chain messaging between agents</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-sm font-bold tabular-nums text-fg">
              {messages.length}
            </p>
            <p className="label-mono">Messages</p>
          </div>
          <span className="w-px h-6 bg-border" />
          <div className="text-right">
            <p className="text-sm font-bold tabular-nums text-fg">
              {agents.length}
            </p>
            <p className="label-mono">Agents</p>
          </div>
        </div>
      </div>

      {/* Auto-sign banner */}
      {showAutoSignBanner && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between px-4 py-2.5 border border-border bg-surface mb-4"
        >
          <p className="text-xs text-muted">
            Enable auto-sign for frictionless messaging — approve once, send
            without popups
          </p>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button
              onClick={handleFaucet}
              disabled={!!faucetStatus}
              className="text-[11px] px-4 py-1.5 border border-border text-fg font-medium hover:bg-surface/80 disabled:opacity-40 transition-all duration-200"
            >
              {faucetStatus ?? "Get NATIV"}
            </button>
            <button
              onClick={handleEnableAutoSign}
              disabled={kit.autoSign?.isLoading}
              className="text-[11px] px-4 py-1.5 bg-fg text-bg font-medium hover:opacity-80 disabled:opacity-40 transition-opacity duration-200"
            >
              {kit.autoSign?.isLoading ? "..." : "Enable Auto-Sign"}
            </button>
          </div>
        </motion.div>
      )}

      {/* Main chat area */}
      <div className="flex gap-0 flex-1 min-h-0 border border-border">
        {/* Agent sidebar */}
        <div className="w-52 shrink-0 border-r border-border flex flex-col">
          <div className="px-3 py-2.5 border-b border-border">
            <p className="label-mono">Agents</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {agents.map((agent) => {
              const count = unreadCounts.get(agent.address.toLowerCase()) ?? 0;
              return (
                <button
                  key={agent.address}
                  onClick={() => setSelectedAgent(agent)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-[background-color,color] duration-150 ${
                    selectedAgent?.address === agent.address
                      ? "bg-surface text-fg"
                      : "text-muted hover:text-fg hover:bg-surface/50"
                  }`}
                >
                  <AgentInitial name={agent.name} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">
                      {agent.name}
                      <span className="text-muted font-normal">.init</span>
                    </p>
                  </div>
                  {count > 0 && (
                    <span className="text-[10px] tabular-nums text-muted">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
            {agents.length === 0 && (
              <p className="text-muted text-xs px-3 py-4">
                No agents registered
              </p>
            )}
          </div>
        </div>

        {/* Chat panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedAgent ? (
            <>
              {/* Chat header */}
              <div className="px-4 py-2.5 border-b border-border flex items-center gap-2.5">
                <AgentInitial name={selectedAgent.name} />
                <div>
                  <p className="text-sm font-semibold text-fg">
                    {selectedAgent.name}
                    <span className="text-muted font-normal">.init</span>
                  </p>
                  <p className="label-mono">
                    {selectedAgent.address.slice(0, 6)}...
                    {selectedAgent.address.slice(-4)}
                  </p>
                </div>
              </div>

              {/* Messages */}
              <div
                ref={messagesRef}
                className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
              >
                {loadingHistory && filteredMessages.length === 0 && (
                  <div className="flex items-center justify-center py-12">
                    <motion.div
                      className="flex gap-1"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className="w-1.5 h-1.5 bg-muted"
                          animate={{ opacity: [0.2, 1, 0.2] }}
                          transition={{
                            duration: 1,
                            repeat: Infinity,
                            delay: i * 0.3,
                          }}
                        />
                      ))}
                    </motion.div>
                  </div>
                )}

                {!loadingHistory && filteredMessages.length === 0 && (
                  <div className="flex items-center justify-center py-12">
                    <p className="text-muted text-xs">
                      No messages yet — say something
                    </p>
                  </div>
                )}

                <AnimatePresence>
                  {filteredMessages.map((msg, i) => (
                    <motion.div
                      key={msg.id}
                      initial={
                        msg.historical && initialLoad.current
                          ? { opacity: 0, y: 6 }
                          : msg.historical
                            ? false
                            : { opacity: 0, y: 6 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      transition={
                        msg.historical && initialLoad.current
                          ? {
                              duration: 0.3,
                              delay: Math.min(i * 0.02, 0.5),
                              ease: [0.16, 1, 0.3, 1],
                            }
                          : { duration: 0.2 }
                      }
                      className={`flex ${msg.direction === "out" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] px-3 py-2 ${
                          msg.direction === "out"
                            ? "bg-fg/5 border border-fg/10"
                            : "bg-surface border border-border"
                        }`}
                      >
                        <div className="flex items-baseline justify-between gap-4 mb-1">
                          <p className="label-mono">
                            {msg.direction === "out" ? "You" : msg.fromName}
                          </p>
                          <p className="text-[10px] text-muted/60 tabular-nums shrink-0">
                            {timeAgo(msg.timestamp)}
                          </p>
                        </div>
                        <p className="text-xs leading-relaxed text-fg/90">
                          {msg.text}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Input */}
              <div className="border-t border-border p-3 flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder={`Message ${selectedAgent.name}.init...`}
                  className="flex-1 bg-transparent border border-border px-4 py-2.5 text-xs text-fg placeholder:text-muted/50 focus:border-border-strong focus:outline-none transition-[border-color] duration-200"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  className="px-5 py-2.5 bg-fg text-bg text-xs font-medium hover:opacity-80 disabled:opacity-40 transition-opacity duration-200"
                >
                  {sending ? "..." : "Send"}
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p
                  className="text-lg font-bold text-muted/30 mb-2"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  nativ chat
                </p>
                <p className="text-xs text-muted">
                  Select an agent to start messaging
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
