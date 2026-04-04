import { resolvePrivateKey, getRpcUrl } from './src/env.js'
import { connectMcp } from './src/server.js'
import { startMessageListener, stopMessageListener } from './src/messaging.js'
import { getBalance, fundAgentOnRollup } from './src/chain.js'
import { state } from './src/state.js'

const FAUCET_URL = process.env.NATIV_FAUCET_URL ?? 'https://nativ-faucet.s0nderlabs.xyz'

async function requestFaucet(address: string): Promise<void> {
  const res = await fetch(FAUCET_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as any
    throw new Error(data.error ?? `faucet returned ${res.status}`)
  }
  const { hash, amount } = await res.json() as any
  process.stderr.write(`nativ: faucet drip ${amount} NATIV (${hash})\n`)
}

async function main() {
  // 1. Resolve identity
  await resolvePrivateKey()

  // 2. Bootstrap funding — if agent has zero balance, try Gas Station then faucet
  try {
    const bal = await getBalance(state.address)
    if (parseFloat(bal) === 0) {
      process.stderr.write('nativ: zero balance, requesting bootstrap funding...\n')
      try {
        await fundAgentOnRollup(state.address)
        process.stderr.write('nativ: funded via Gas Station\n')
      } catch {
        // Gas Station not available (no mnemonic) — use public faucet
        process.stderr.write('nativ: Gas Station unavailable, trying faucet...\n')
        await requestFaucet(state.address)
      }
    }
  } catch (err) {
    process.stderr.write(`nativ: bootstrap funding skipped: ${err}\n`)
  }

  // 3. Connect MCP (stdio transport)
  const mcp = await connectMcp()

  // 4. Start on-chain message listener
  await startMessageListener(mcp)

  // 5. Shutdown — detect stdin EOF (Claude Code closing pipe) + force exit
  process.stdin.resume() // critical: ensures end/close events fire when pipe closes

  let shuttingDown = false
  function shutdown(reason: string) {
    if (shuttingDown) return
    shuttingDown = true
    process.stderr.write(`nativ: shutting down (${reason})\n`)
    setTimeout(() => process.exit(0), 3000) // force exit if cleanup hangs
    try { stopMessageListener() } catch {}
    process.exit(0)
  }

  process.stdin.on('end', () => shutdown('stdin end'))
  process.stdin.on('close', () => shutdown('stdin close'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  // Parent PID watchdog — safety net for orphan prevention
  const ppid = process.ppid
  if (ppid && ppid > 1) {
    setInterval(() => {
      try { process.kill(ppid, 0) }
      catch { shutdown('parent died') }
    }, 5000)
  }
}

main().catch((err) => {
  process.stderr.write(`nativ: fatal error: ${err}\n`)
  process.exit(1)
})
