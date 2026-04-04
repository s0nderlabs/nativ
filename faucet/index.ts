import { createPublicClient, createWalletClient, http, parseEther, formatEther } from 'viem'
import { mnemonicToAccount } from 'viem/accounts'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'

const DRIP_AMOUNT = '1' // 1 NATIV per request
const COOLDOWN_MS = 60_000 // 1 minute cooldown per address
const PORT = 8547

// Load Gas Station mnemonic from weave config
function getGasStationMnemonic(): string {
  const configPath = join(homedir(), '.weave', 'config.json')
  const config = JSON.parse(readFileSync(configPath, 'utf-8'))
  return config.common.gas_station.mnemonic
}

const mnemonic = getGasStationMnemonic()
const gasAccount = mnemonicToAccount(mnemonic)
const rpcUrl = process.env.NATIV_RPC_URL ?? 'http://localhost:8545'

const publicClient = createPublicClient({ transport: http(rpcUrl) })
const walletClient = createWalletClient({
  account: gasAccount,
  transport: http(rpcUrl),
})

// Rate limiting
const lastDrip = new Map<string, number>()

console.log(`nativ faucet starting...`)
console.log(`  Gas Station: ${gasAccount.address}`)
console.log(`  RPC: ${rpcUrl}`)
console.log(`  Drip: ${DRIP_AMOUNT} NATIV`)
console.log(`  Cooldown: ${COOLDOWN_MS / 1000}s`)

const balance = await publicClient.getBalance({ address: gasAccount.address })
console.log(`  Balance: ${formatEther(balance)} NATIV`)

Bun.serve({
  port: PORT,
  async fetch(req) {
    // CORS
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }

    if (req.method !== 'POST') {
      return Response.json({ error: 'POST only' }, { status: 405 })
    }

    try {
      const { address } = await req.json() as { address: string }

      if (!address || !address.startsWith('0x') || address.length !== 42) {
        return Response.json({ error: 'invalid address' }, { status: 400 })
      }

      const lower = address.toLowerCase()

      // Rate limit
      const last = lastDrip.get(lower) ?? 0
      const elapsed = Date.now() - last
      if (elapsed < COOLDOWN_MS) {
        const wait = Math.ceil((COOLDOWN_MS - elapsed) / 1000)
        return Response.json(
          { error: `cooldown: try again in ${wait}s` },
          {
            status: 429,
            headers: { 'Access-Control-Allow-Origin': '*' },
          }
        )
      }

      // Send NATIV
      const hash = await walletClient.sendTransaction({
        to: address as `0x${string}`,
        value: parseEther(DRIP_AMOUNT),
      })

      await publicClient.waitForTransactionReceipt({ hash })
      lastDrip.set(lower, Date.now())

      console.log(`drip: ${DRIP_AMOUNT} NATIV → ${address} (${hash})`)

      return Response.json(
        { hash, amount: DRIP_AMOUNT },
        { headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    } catch (err: any) {
      console.error(`faucet error: ${err.message}`)
      return Response.json(
        { error: err.message },
        {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' },
        }
      )
    }
  },
})

console.log(`nativ faucet listening on http://localhost:${PORT}`)
