import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { join } from 'path'
import { homedir } from 'os'
import { mkdirSync, chmodSync, readFileSync } from 'fs'
import { bech32 } from 'bech32'
import { state } from './state.js'

const DEFAULT_STATE_DIR = join(process.env.HOME ?? '~', '.claude', 'channels', 'nativ')

export function getStateDir(): string {
  return process.env.NATIV_STATE_DIR ?? DEFAULT_STATE_DIR
}

export function getRpcUrl(): string {
  return process.env.NATIV_RPC_URL ?? 'https://nativ-rpc.s0nderlabs.xyz'
}

export function getWsUrl(): string {
  return process.env.NATIV_WS_URL ?? 'wss://nativ-ws.s0nderlabs.xyz'
}

export function getRestUrl(): string {
  return process.env.NATIV_REST_URL ?? 'https://nativ-rpc.s0nderlabs.xyz'
}

export function getL1RestUrl(): string {
  return process.env.NATIV_L1_REST_URL ?? 'https://rest.testnet.initia.xyz'
}

function evmToInit(evmAddress: string): string {
  const raw = Buffer.from(evmAddress.slice(2), 'hex')
  const words = bech32.toWords(raw)
  return bech32.encode('init', words)
}

export async function resolvePrivateKey(): Promise<void> {
  const stateDir = getStateDir()
  const envPath = join(stateDir, '.env')

  let pk = process.env.NATIV_PRIVATE_KEY as `0x${string}` | undefined

  if (!pk) {
    try {
      const content = await Bun.file(envPath).text()
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('NATIV_PRIVATE_KEY=')) {
          pk = trimmed.split('=', 2)[1].trim() as `0x${string}`
          break
        }
      }
    } catch {}
  }

  if (!pk) {
    pk = generatePrivateKey()
    mkdirSync(stateDir, { recursive: true })
    await Bun.write(envPath, `NATIV_PRIVATE_KEY=${pk}\n`)
    chmodSync(envPath, 0o600)
    process.stderr.write(`nativ: generated new key, saved to ${envPath}\n`)
  }

  const account = privateKeyToAccount(pk)
  state.privateKey = pk
  state.account = account
  state.address = account.address.toLowerCase()
  state.initAddress = evmToInit(account.address)

  process.stderr.write(`nativ: address ${state.address} (${state.initAddress})\n`)
}

export function getGasStationMnemonic(): string {
  const configPath = join(homedir(), '.weave', 'config.json')
  const config = JSON.parse(readFileSync(configPath, 'utf-8'))
  return config.common.gas_station.mnemonic
}

export function getGasStationInitAddress(): string {
  const configPath = join(homedir(), '.weave', 'config.json')
  const config = JSON.parse(readFileSync(configPath, 'utf-8'))
  return config.common.gas_station.initia_address
}
