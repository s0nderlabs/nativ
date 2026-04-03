export const AGENT_REGISTRY_ADDRESS = '0xF2f3700DEb802E684b885D5208Bd05E49eceD60D' as const
export const MESSAGE_RELAY_ADDRESS = '0x12A39dA963000Aafb6667b69717c2e060A66Ee7c' as const
export const TASK_ESCROW_ADDRESS = '0x53b6B7af7e6a41b1E84303CB06D6E27b9b6A00Bf' as const

export const AGENT_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'register',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'metadata', type: 'string' },
      { name: 'publicKey', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'updateAgent',
    inputs: [
      { name: 'metadata', type: 'string' },
      { name: 'publicKey', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'deregister',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getAgent',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'name', type: 'string' },
          { name: 'metadata', type: 'string' },
          { name: 'publicKey', type: 'bytes' },
          { name: 'registeredAt', type: 'uint256' },
          { name: 'active', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAgentByName',
    inputs: [{ name: 'name', type: 'string' }],
    outputs: [
      { name: 'addr', type: 'address' },
      {
        name: 'agent',
        type: 'tuple',
        components: [
          { name: 'name', type: 'string' },
          { name: 'metadata', type: 'string' },
          { name: 'publicKey', type: 'bytes' },
          { name: 'registeredAt', type: 'uint256' },
          { name: 'active', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAgents',
    inputs: [],
    outputs: [
      { name: 'addresses', type: 'address[]' },
      {
        name: 'agents',
        type: 'tuple[]',
        components: [
          { name: 'name', type: 'string' },
          { name: 'metadata', type: 'string' },
          { name: 'publicKey', type: 'bytes' },
          { name: 'registeredAt', type: 'uint256' },
          { name: 'active', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isRegistered',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'agentCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'AgentRegistered',
    inputs: [
      { name: 'agent', type: 'address', indexed: true },
      { name: 'name', type: 'string', indexed: false },
      { name: 'metadata', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'AgentUpdated',
    inputs: [
      { name: 'agent', type: 'address', indexed: true },
      { name: 'metadata', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'AgentDeregistered',
    inputs: [
      { name: 'agent', type: 'address', indexed: true },
      { name: 'name', type: 'string', indexed: false },
    ],
  },
] as const

export const MESSAGE_RELAY_ABI = [
  {
    type: 'function',
    name: 'sendMessage',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'payload', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'sendGroupMessage',
    inputs: [
      { name: 'recipients', type: 'address[]' },
      { name: 'payloads', type: 'bytes[]' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'Message',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'payload', type: 'bytes', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
] as const
