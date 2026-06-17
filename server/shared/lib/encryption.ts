import CryptoJS from "crypto-js"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EncryptedAccount {
  username:         string
  encryptedPrivate: string
}

export interface EncryptedConfig {
  accounts: EncryptedAccount[]
  version:  string
}

/** Minimal shape — posting key only (auto-claim-battle, scripts) */
export interface AccountWithPostingKey {
  username:    string
  posting_key: string
}

/** Full shape — both keys (auto-quest, token-transfer) */
export interface AccountWithKeys {
  username:    string
  active_key:  string
  posting_key: string
}

// ── Key generation ────────────────────────────────────────────────────────────

export function generateEncryptionKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

// ── Encrypt ───────────────────────────────────────────────────────────────────

export function encryptAccounts(
  accounts: AccountWithKeys[],
  encryptionKey: string,
): EncryptedConfig {
  const encrypted = accounts.map((acc) => {
    const payload    = JSON.stringify({ active_key: acc.active_key, posting_key: acc.posting_key })
    const encPrivate = CryptoJS.AES.encrypt(payload, encryptionKey).toString()
    return { username: acc.username, encryptedPrivate: encPrivate }
  })
  return { accounts: encrypted, version: "1.0" }
}

// ── Decrypt — full keys ───────────────────────────────────────────────────────

export function decryptAccounts(
  config: EncryptedConfig,
  encryptionKey: string,
): AccountWithKeys[] {
  return config.accounts.map((enc) => {
    const decrypted = CryptoJS.AES.decrypt(enc.encryptedPrivate, encryptionKey).toString(CryptoJS.enc.Utf8)
    const keys      = JSON.parse(decrypted)
    return {
      username:    enc.username,
      active_key:  keys.active_key  ?? "",
      posting_key: keys.posting_key ?? "",
    }
  })
}

// ── Decrypt — posting key only ────────────────────────────────────────────────

export function decryptAccountsPostingOnly(
  config: EncryptedConfig,
  encryptionKey: string,
): AccountWithPostingKey[] {
  return config.accounts.map((enc) => {
    const decrypted = CryptoJS.AES.decrypt(enc.encryptedPrivate, encryptionKey).toString(CryptoJS.enc.Utf8)
    const keys      = JSON.parse(decrypted)
    return {
      username:    enc.username,
      posting_key: keys.posting_key ?? "",
    }
  })
}
