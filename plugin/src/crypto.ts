import { encrypt, decrypt, PrivateKey, PublicKey } from 'eciesjs'
import { state } from './state.js'

export function encryptMessage(recipientPubKeyHex: string, plaintext: string): string {
  const pubKey = PublicKey.fromHex(recipientPubKeyHex.replace(/^0x/, ''))
  const data = new TextEncoder().encode(plaintext)
  const encrypted = encrypt(pubKey.toHex(), data)
  return Buffer.from(encrypted).toString('base64')
}

export function decryptMessage(encrypted: string): string {
  const data = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0))
  const pk = new PrivateKey(Buffer.from(state.privateKey.slice(2), 'hex'))
  const decrypted = decrypt(pk.toHex(), data)
  return new TextDecoder().decode(decrypted)
}

export function getPublicKeyHex(): string {
  const pk = new PrivateKey(Buffer.from(state.privateKey.slice(2), 'hex'))
  return pk.publicKey.toHex()
}
