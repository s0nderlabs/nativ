import {
  createPublicClient,
  createWalletClient,
  http,
  webSocket,
  defineChain,
  formatEther,
  parseEther,
  toHex,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { privateKeyToAccount, mnemonicToAccount } from 'viem/accounts'
import { state } from './state.js'
import { getRpcUrl, getWsUrl, getGasStationMnemonic } from './env.js'

let _publicClient: PublicClient | null = null
let _walletClient: WalletClient | null = null
let _wsClient: PublicClient | null = null
let _chainId: number | null = null

async function getChainId(): Promise<number> {
  if (_chainId !== null) return _chainId
  const client = getPublicClient()
  _chainId = await client.getChainId()
  return _chainId
}

function getNativChain(chainId: number) {
  return defineChain({
    id: chainId,
    name: 'nativ',
    nativeCurrency: { name: 'NATIV', symbol: 'NATIV', decimals: 18 },
    rpcUrls: {
      default: {
        http: [getRpcUrl()],
        webSocket: [getWsUrl()],
      },
    },
  })
}

export function getPublicClient(): PublicClient {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      transport: http(getRpcUrl()),
    }) as PublicClient
  }
  return _publicClient
}

export async function getWalletClient(): Promise<WalletClient> {
  if (!_walletClient) {
    const chainId = await getChainId()
    const chain = getNativChain(chainId)
    _walletClient = createWalletClient({
      account: privateKeyToAccount(state.privateKey),
      chain,
      transport: http(getRpcUrl()),
    })
  }
  return _walletClient
}

export async function getWsClient(): Promise<PublicClient> {
  if (!_wsClient) {
    const chainId = await getChainId()
    const chain = getNativChain(chainId)
    _wsClient = createPublicClient({
      chain,
      transport: webSocket(getWsUrl()),
    }) as PublicClient
  }
  return _wsClient
}

export function resetWsClient(): void {
  _wsClient = null
}

export async function getBalance(address: string): Promise<string> {
  const client = getPublicClient()
  const balance = await client.getBalance({ address: address as `0x${string}` })
  return formatEther(balance)
}

export async function sendNativ(to: string, amount: string): Promise<string> {
  const wallet = await getWalletClient()
  const hash = await wallet.sendTransaction({
    to: to as `0x${string}`,
    value: parseEther(amount),
  })
  return hash
}

export async function fundAgentOnRollup(agentAddress: string, amount: string = '1'): Promise<string> {
  const chainId = await getChainId()
  const chain = getNativChain(chainId)
  const gasAccount = mnemonicToAccount(getGasStationMnemonic())
  const gasWallet = createWalletClient({
    account: gasAccount,
    chain,
    transport: http(getRpcUrl()),
  })
  const hash = await gasWallet.sendTransaction({
    to: agentAddress as `0x${string}`,
    value: parseEther(amount),
  })
  // Wait for confirmation so the account exists on-chain before proceeding
  const client = getPublicClient()
  await client.waitForTransactionReceipt({ hash })
  return hash
}

export async function readContract(address: string, abi: any[], functionName: string, args: any[] = []): Promise<any> {
  const client = getPublicClient()
  return client.readContract({
    address: address as `0x${string}`,
    abi,
    functionName,
    args,
  })
}

export async function writeContract(address: string, abi: any[], functionName: string, args: any[] = [], value?: bigint): Promise<string> {
  const wallet = await getWalletClient()
  const hash = await wallet.writeContract({
    address: address as `0x${string}`,
    abi,
    functionName,
    args,
    ...(value !== undefined ? { value } : {}),
  })
  return hash
}

export async function deployContract(bytecode: string, abi?: any[], constructorArgs?: any[]): Promise<string> {
  const wallet = await getWalletClient()
  const hash = await wallet.deployContract({
    abi: abi ?? [],
    bytecode: bytecode as `0x${string}`,
    args: constructorArgs ?? [],
  })
  const client = getPublicClient()
  const receipt = await client.waitForTransactionReceipt({ hash })
  return receipt.contractAddress ?? ''
}
