"use client";

import { useState, useEffect, useRef } from "react";
import { createPublicClient, http, webSocket, toHex } from "viem";
import { useAccount, useSendTransaction } from "wagmi";
import { nativ } from "@/lib/chain";
import {
  AGENT_REGISTRY_ADDRESS,
  AGENT_REGISTRY_ABI,
  MESSAGE_RELAY_ADDRESS,
  MESSAGE_RELAY_ABI,
} from "@/lib/contracts";

type Message = {
  id: string;
  from: string;
  fromName: string;
  text: string;
  timestamp: Date;
  direction: "in" | "out";
};

type Agent = {
  address: string;
  name: string;
};

export default function ChatPage() {
  const { address } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

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
        setAgents(addresses.map((addr, i) => ({ address: addr, name: agentData[i].name })));
      } catch {}
    }
    load();
  }, []);

  // Listen for messages directed to us
  useEffect(() => {
    if (!address) return;

    let wsClient: any;
    try {
      wsClient = createPublicClient({ chain: nativ, transport: webSocket("ws://localhost:8546") });
    } catch {
      return;
    }

    const httpClient = createPublicClient({ chain: nativ, transport: http() });

    wsClient.watchContractEvent({
      address: MESSAGE_RELAY_ADDRESS,
      abi: MESSAGE_RELAY_ABI,
      eventName: "Message",
      onLogs: async (logs: any[]) => {
        for (const log of logs) {
          const to = (log.args.to as string).toLowerCase();
          const from = (log.args.from as string).toLowerCase();

          if (to !== address.toLowerCase() && from !== address.toLowerCase()) continue;

          let text = "";
          try {
            text = Buffer.from((log.args.payload as string).slice(2), "hex").toString("utf-8");
          } catch {
            text = "[encrypted]";
          }

          let fromName = from.slice(0, 8);
          try {
            const agent = await (httpClient as any).readContract({
              address: AGENT_REGISTRY_ADDRESS,
              abi: AGENT_REGISTRY_ABI,
              functionName: "getAgent",
              args: [from as `0x${string}`],
            }) as any;
            if (agent?.name) fromName = `${agent.name}.init`;
          } catch {}

          setMessages((prev) => [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              from,
              fromName,
              text,
              timestamp: new Date(),
              direction: from === address.toLowerCase() ? "out" : "in",
            },
          ]);
        }
      },
    });
  }, [address]);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || !selectedAgent || !address || sending) return;
    setSending(true);

    try {
      const payload = toHex(new TextEncoder().encode(input));
      // Encode sendMessage(address,bytes) call
      const { encodeFunctionData } = await import("viem");
      const data = encodeFunctionData({
        abi: [
          {
            type: "function",
            name: "sendMessage",
            inputs: [
              { name: "to", type: "address" },
              { name: "payload", type: "bytes" },
            ],
            outputs: [],
            stateMutability: "nonpayable",
          },
        ],
        functionName: "sendMessage",
        args: [selectedAgent.address as `0x${string}`, payload],
      });

      await sendTransactionAsync({
        to: MESSAGE_RELAY_ADDRESS,
        data,
      });

      setInput("");
    } catch (err) {
      console.error("Send failed:", err);
    }
    setSending(false);
  }

  if (!address) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold tracking-tight mb-4" style={{ fontFamily: "var(--font-pixel)" }}>
          chat
        </h1>
        <p className="text-text-dim text-sm">connect your wallet to message agents</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 flex gap-6 h-[calc(100vh-80px)]">
      {/* Agent list */}
      <div className="w-48 shrink-0 border-r border-border pr-4">
        <p className="label-mono mb-3">agents</p>
        <div className="space-y-1">
          {agents.map((agent) => (
            <button
              key={agent.address}
              onClick={() => setSelectedAgent(agent)}
              className={`w-full text-left text-xs px-3 py-2 rounded-lg transition-colors duration-150 ${
                selectedAgent?.address === agent.address
                  ? "bg-accent/10 text-accent border border-accent/30"
                  : "text-text-dim hover:text-text hover:bg-surface"
              }`}
            >
              {agent.name}.init
            </button>
          ))}
          {agents.length === 0 && (
            <p className="text-text-dim text-xs">no agents online</p>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        <div className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-pixel)" }}>
            chat
          </h1>
          <p className="label-mono mt-1">
            {selectedAgent ? `talking to ${selectedAgent.name}.init` : "select an agent"}
          </p>
        </div>

        <div ref={messagesRef} className="flex-1 overflow-y-auto space-y-2 mb-4">
          {messages
            .filter(
              (m) =>
                selectedAgent &&
                (m.from === selectedAgent.address.toLowerCase() ||
                  m.from === address.toLowerCase())
            )
            .map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.direction === "out" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[70%] px-3 py-2 rounded-xl text-xs ${
                    msg.direction === "out"
                      ? "bg-accent/10 text-accent border border-accent/20"
                      : "bg-surface border border-border"
                  }`}
                >
                  <p className="label-mono mb-1">{msg.fromName}</p>
                  <p className="leading-relaxed">{msg.text}</p>
                </div>
              </div>
            ))}
        </div>

        {selectedAgent && (
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={`message ${selectedAgent.name}.init...`}
              className="flex-1 bg-surface border border-border rounded-xl px-4 py-3 text-xs text-text placeholder:text-text-dim/50 focus:border-accent/40 focus:outline-none transition-colors duration-200"
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="px-6 py-3 rounded-xl bg-accent text-void text-xs font-medium hover:bg-accent/80 disabled:opacity-40 transition-colors duration-200"
            >
              {sending ? "..." : "send"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
