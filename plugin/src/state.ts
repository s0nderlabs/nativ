import type { PrivateKeyAccount } from 'viem/accounts'

export const state = {
  lastInboundFrom: null as string | null,
  address: '',
  account: null as PrivateKeyAccount | null,
  privateKey: '' as `0x${string}`,
  initAddress: '', // init1... bech32 address
}
