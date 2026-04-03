import { resolvePrivateKey } from './src/env.js'
import { connectMcp } from './src/server.js'
import { startMessageListener, stopMessageListener } from './src/messaging.js'
import { getBalance, fundAgentOnRollup } from './src/chain.js'
import { state } from './src/state.js'

async function main() {
  // 1. Resolve identity
  await resolvePrivateKey()

  // 2. Bootstrap funding — if agent has zero balance, Gas Station sends 1 NATIV
  try {
    const bal = await getBalance(state.address)
    if (parseFloat(bal) === 0) {
      process.stderr.write('nativ: zero balance, requesting bootstrap funding...\n')
      await fundAgentOnRollup(state.address)
      process.stderr.write('nativ: funded with 1 NATIV\n')
    }
  } catch (err) {
    process.stderr.write(`nativ: bootstrap funding skipped: ${err}\n`)
  }

  // 3. Connect MCP (stdio transport)
  const mcp = await connectMcp()

  // 4. Start on-chain message listener
  await startMessageListener(mcp)

  // 5. Shutdown wiring
  let shuttingDown = false
  async function shutdown() {
    if (shuttingDown) return
    shuttingDown = true
    process.stderr.write('nativ: shutting down\n')
    stopMessageListener()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  process.stdin.resume()
  process.stdin.on('end', shutdown)
  process.stdin.on('close', shutdown)

  const ppid = process.ppid
  if (ppid && ppid > 1) {
    setInterval(() => {
      try { process.kill(ppid, 0) } catch { shutdown() }
    }, 5000)
  }

  process.on('beforeExit', () => {
    setTimeout(() => process.exit(0), 3000).unref()
  })
}

main().catch((err) => {
  process.stderr.write(`nativ: fatal error: ${err}\n`)
  process.exit(1)
})
