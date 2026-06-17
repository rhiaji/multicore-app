import CryptoJS from "crypto-js"

export interface EncryptedAccount {
  username: string
  encryptedPrivate: string // encrypted JSON: { active_key, posting_key }
}

export interface EncryptedConfig {
  accounts: EncryptedAccount[]
  version: string
}

export interface AccountWithKeys {
  username: string
  active_key: string
  posting_key: string
}

/**
 * Generate a random 32-byte (256-bit) encryption key as hex string
 * Matches the pattern: crypto.randomBytes(32).toString('hex')
 */
export function generateEncryptionKey(): string {
  const randomBytes = new Uint8Array(32)
  crypto.getRandomValues(randomBytes)
  return Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * Encrypt multiple accounts' keys using the generated encryption key
 * Each account's active_key and posting_key are combined and encrypted
 */
export function encryptAccounts(
  accounts: AccountWithKeys[],
  encryptionKey: string
): EncryptedConfig {
  const encrypted = accounts.map((acc) => {
    // Combine both keys as JSON
    const keysToEncrypt = JSON.stringify({
      active_key: acc.active_key,
      posting_key: acc.posting_key,
    })

    // Encrypt using the key
    const encryptedPrivate = CryptoJS.AES.encrypt(keysToEncrypt, encryptionKey).toString()

    return {
      username: acc.username,
      encryptedPrivate,
    }
  })

  return {
    accounts: encrypted,
    version: "1.0",
  }
}

/**
 * Decrypt multiple accounts using the encryption key
 * Returns the original username with decrypted active_key and posting_key
 */
export function decryptAccounts(config: EncryptedConfig, encryptionKey: string): AccountWithKeys[] {
  return config.accounts.map((enc) => {
    const decryptedJson = CryptoJS.AES.decrypt(enc.encryptedPrivate, encryptionKey).toString(
      CryptoJS.enc.Utf8
    )

    const keys = JSON.parse(decryptedJson)

    return {
      username: enc.username,
      active_key: keys.active_key,
      posting_key: keys.posting_key,
    }
  })
}

