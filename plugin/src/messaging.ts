import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { getWsClient, writeContract, getPublicClient } from './chain.js'
import { MESSAGE_RELAY_ADDRESS, MESSAGE_RELAY_ABI, AGENT_REGISTRY_ADDRESS, AGENT_REGISTRY_ABI } from './contracts.js'
import { encryptMessage, decryptMessage } from './crypto.js'
import { state } from './state.js'
import { toHex } from 'viem'

let unwatch: (() => void) | null = null
const nameCache = new Map<string, string>()

export async function startMessageListener(mcp: Server) {
  stopMessageListener()
  const wsClient = await getWsClient()
  const client = getPublicClient()

  unwatch = wsClient.watchContractEvent({
    address: MESSAGE_RELAY_ADDRESS,
    abi: MESSAGE_RELAY_ABI,
    eventName: 'Message',
    onLogs: async (logs: any[]) => {
      for (const log of logs) {
        const to = (log.args.to as string).toLowerCase()
        if (to !== state.address) continue

        const from = (log.args.from as string).toLowerCase()
        const payload = log.args.payload as string

        // Try to decrypt
        let plaintext: string
        try {
          const base64 = Buffer.from(payload.slice(2), 'hex').toString('utf-8')
          plaintext = decryptMessage(base64)
        } catch {
          // Not encrypted or not for us, try raw UTF-8
          try {
            plaintext = Buffer.from(payload.slice(2), 'hex').toString('utf-8')
          } catch {
            plaintext = `[binary: ${payload.slice(0, 20)}...]`
          }
        }

        // Resolve sender name (cached)
        let senderName = nameCache.get(from) ?? from
        if (!nameCache.has(from)) {
          try {
            const agent = await client.readContract({
              address: AGENT_REGISTRY_ADDRESS,
              abi: AGENT_REGISTRY_ABI,
              functionName: 'getAgent',
              args: [from as `0x${string}`],
            }) as any
            if (agent && agent.name) {
              senderName = `${agent.name}.init`
              nameCache.set(from, senderName)
            }
          } catch {}
        }

        state.lastInboundFrom = from

        mcp.notification({
          method: 'notifications/claude/channel',
          params: {
            content: plaintext,
            meta: {
              agent_id: from,
              user: senderName.replace(/['"&<>]/g, ''),
              ts: new Date().toISOString(),
            },
          },
        }).catch((err: Error) => {
          process.stderr.write(`nativ: notification failed: ${err}\n`)
        })
      }
    },
  })

  process.stderr.write('nativ: listening for messages\n')
}

export function stopMessageListener() {
  if (unwatch) {
    unwatch()
    unwatch = null
  }
}

export async function sendMessageOnChain(toAddress: string, plaintext: string, recipientPubKey?: string): Promise<string> {
  let payload: string
  if (recipientPubKey) {
    const encrypted = encryptMessage(recipientPubKey, plaintext)
    payload = toHex(new TextEncoder().encode(encrypted))
  } else {
    payload = toHex(new TextEncoder().encode(plaintext))
  }

  return writeContract(
    MESSAGE_RELAY_ADDRESS,
    MESSAGE_RELAY_ABI as any,
    'sendMessage',
    [toAddress as `0x${string}`, payload],
  )
}

export async function resolveAgent(nameOrAddress: string): Promise<{ address: string; name: string; publicKey: string } | null> {
  const client = getPublicClient()

  // If it looks like an address, query directly
  if (nameOrAddress.startsWith('0x') && nameOrAddress.length === 42) {
    try {
      const agent = await client.readContract({
        address: AGENT_REGISTRY_ADDRESS,
        abi: AGENT_REGISTRY_ABI,
        functionName: 'getAgent',
        args: [nameOrAddress as `0x${string}`],
      }) as any
      if (agent && agent.active) {
        return { address: nameOrAddress, name: agent.name, publicKey: agent.publicKey }
      }
    } catch {}
    return null
  }

  // Strip .init suffix if present
  const name = nameOrAddress.replace(/\.init$/, '')

  try {
    const [addr, agent] = await client.readContract({
      address: AGENT_REGISTRY_ADDRESS,
      abi: AGENT_REGISTRY_ABI,
      functionName: 'getAgentByName',
      args: [name],
    }) as any
    if (addr && addr !== '0x0000000000000000000000000000000000000000' && agent.active) {
      return { address: addr, name: agent.name, publicKey: agent.publicKey }
    }
  } catch {}

  return null
}
