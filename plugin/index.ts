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
