export const AGENT_REGISTRY_ADDRESS = "0xF2f3700DEb802E684b885D5208Bd05E49eceD60D" as const;
export const MESSAGE_RELAY_ADDRESS = "0x12A39dA963000Aafb6667b69717c2e060A66Ee7c" as const;
export const TASK_ESCROW_ADDRESS = "0x53b6B7af7e6a41b1E84303CB06D6E27b9b6A00Bf" as const;

export const AGENT_REGISTRY_ABI = [
  {
    type: "function",
    name: "getAgents",
    inputs: [],
    outputs: [
      { name: "addresses", type: "address[]" },
      {
        name: "agents",
        type: "tuple[]",
        components: [
          { name: "name", type: "string" },
          { name: "metadata", type: "string" },
          { name: "publicKey", type: "bytes" },
          { name: "registeredAt", type: "uint256" },
          { name: "active", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAgent",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "metadata", type: "string" },
          { name: "publicKey", type: "bytes" },
          { name: "registeredAt", type: "uint256" },
          { name: "active", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "agentCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "AgentRegistered",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "metadata", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AgentDeregistered",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AgentUpdated",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "metadata", type: "string", indexed: false },
    ],
  },
] as const;

export const MESSAGE_RELAY_ABI = [
  {
    type: "event",
    name: "Message",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "payload", type: "bytes", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;

export const TASK_ESCROW_ABI = [
  {
    type: "event",
    name: "TaskCreated",
    inputs: [
      { name: "taskId", type: "uint256", indexed: true },
      { name: "client", type: "address", indexed: true },
      { name: "provider", type: "address" },
      { name: "evaluator", type: "address" },
      { name: "expiredAt", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "TaskCompleted",
    inputs: [
      { name: "taskId", type: "uint256", indexed: true },
      { name: "providerPayout", type: "uint256" },
      { name: "evaluatorPayout", type: "uint256" },
      { name: "platformFee", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "TaskFunded",
    inputs: [
      { name: "taskId", type: "uint256", indexed: true },
      { name: "amount", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "WorkSubmitted",
    inputs: [
      { name: "taskId", type: "uint256", indexed: true },
      { name: "deliverable", type: "bytes32" },
    ],
  },
] as const;
