import { RESTClient, MnemonicKey, RawKey, MsgSend, MsgExecute, Coin, Wallet, Fee, bcs } from '@initia/initia.js'
import { getL1RestUrl, getGasStationMnemonic } from './env.js'
import { state } from './state.js'

const USERNAMES_MODULE = '0x42cd8467b1c86e59bf319e5664a09b6b5840bb3fac64f5ce690b5041c530565a'
const MIN_DURATION = 15552000 // 180 days in seconds
const REGISTRATION_FUND = 3000000 // 3.0 INIT in uinit (covers ~2.62 registration + gas for both txs)

let _rest: RESTClient | null = null
let _gasStationWallet: Wallet | null = null

function getL1Client(): RESTClient {
  if (!_rest) {
    _rest = new RESTClient(getL1RestUrl(), {
      chainId: 'initiation-2',
      gasPrices: '0.15uinit',
      gasAdjustment: '1.5',
    })
  }
  return _rest
}

function getGasStationWallet(): Wallet {
  if (!_gasStationWallet) {
    const rest = getL1Client()
    const key = new MnemonicKey({ mnemonic: getGasStationMnemonic(), coinType: 60 })
    _gasStationWallet = new Wallet(rest, key)
  }
  return _gasStationWallet
}

export async function registerInitName(name: string): Promise<string> {
  const rest = getL1Client()
  const gsWallet = getGasStationWallet()

  // 1. Fund agent on L1 (to cover registration cost + gas)
  const fundMsg = new MsgSend(
    gsWallet.key.accAddress,
    state.initAddress,
    [new Coin('uinit', REGISTRATION_FUND)],
  )
  const fundTx = await gsWallet.createAndSignTx({ msgs: [fundMsg] })
  await rest.tx.broadcast(fundTx)

  // Wait for funding to land
  await new Promise(r => setTimeout(r, 3000))

  // 2. Agent registers domain
  const agentKey = new RawKey(Buffer.from(state.privateKey.slice(2), 'hex'))
  const agentWallet = new Wallet(rest, agentKey)

  const nameArg = bcs.string().serialize(name).toBase64()
  const durationArg = bcs.u64().serialize(BigInt(MIN_DURATION)).toBase64()

  const registerMsg = new MsgExecute(
    agentKey.accAddress,
    USERNAMES_MODULE,
    'usernames',
    'register_domain',
    [],
    [nameArg, durationArg],
  )

  const regFee = new Fee(500000, [new Coin('uinit', 75000)])
  const regTx = await agentWallet.createAndSignTx({ msgs: [registerMsg], fee: regFee })
  const regResult = await rest.tx.broadcast(regTx)
  if (regResult.code !== 0) {
    throw new Error(`register_domain failed: ${regResult.raw_log?.slice(0, 100)}`)
  }

  // 3. Agent sets primary name (activates name→address mapping)
  const setNameMsg = new MsgExecute(
    agentKey.accAddress,
    USERNAMES_MODULE,
    'usernames',
    'set_name',
    [],
    [nameArg],
  )

  const setFee = new Fee(300000, [new Coin('uinit', 45000)])
  const setTx = await agentWallet.createAndSignTx({ msgs: [setNameMsg], fee: setFee })
  const setResult = await rest.tx.broadcast(setTx)
  if (setResult.code !== 0) {
    throw new Error(`set_name failed: ${setResult.raw_log?.slice(0, 100)}`)
  }

  return regResult.txhash
}
