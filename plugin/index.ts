import { resolvePrivateKey } from './src/env.js'
import { connectMcp } from './src/server.js'
import { startMessageListener, stopMessageListener } from './src/messaging.js'

async function main() {
  // 1. Resolve identity
  await resolvePrivateKey()

  // 2. Connect MCP (stdio transport)
  const mcp = await connectMcp()

  // 3. Start on-chain message listener
  await startMessageListener(mcp)

  // 4. Shutdown wiring
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

  // stdin EOF detection (Claude Code closed)
  process.stdin.resume()
  process.stdin.on('end', shutdown)
  process.stdin.on('close', shutdown)

  // Parent PID watchdog
  const ppid = process.ppid
  if (ppid && ppid > 1) {
    setInterval(() => {
      try { process.kill(ppid, 0) } catch { shutdown() }
    }, 5000)
  }

  // Force exit safety net
  process.on('beforeExit', () => {
    setTimeout(() => process.exit(0), 3000).unref()
  })
}

main().catch((err) => {
  process.stderr.write(`nativ: fatal error: ${err}\n`)
  process.exit(1)
})
