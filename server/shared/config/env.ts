import dotenv  from "dotenv"
import path    from "path"
import CryptoJS from "crypto-js"
import type { AccountWithKeys, AccountWithPostingKey } from "../lib/encryption"

dotenv.config({ path: path.resolve(process.cwd(), ".env") })
dotenv.config()

// ── Internal decrypt helpers ──────────────────────────────────────────────────

function decryptRaw(encryptedJson: string, encryptionKey: string) {
  const config = JSON.parse(encryptedJson) as {
    accounts: { username: string; encryptedPrivate: string }[]
  }
  return config.accounts.map((enc) => {
    const decrypted = CryptoJS.AES.decrypt(enc.encryptedPrivate, encryptionKey).toString(CryptoJS.enc.Utf8)
    return { username: enc.username, keys: JSON.parse(decrypted) }
  })
}

// ── Load accounts with both keys (active + posting) ───────────────────────────

export function loadAccounts(): AccountWithKeys[] {
  const encryptedJson = process.env.TERRACORE_ACCOUNTS_ENC
  const encryptionKey = process.env.TERRACORE_ENCRYPTION_KEY

  if (encryptedJson && encryptionKey) {
    try {
      const accounts = decryptRaw(encryptedJson, encryptionKey).map(({ username, keys }) => ({
        username,
        active_key:  keys.active_key  ?? "",
        posting_key: keys.posting_key ?? "",
      }))
      console.log(`[env] Loaded ${accounts.length} account(s) from encrypted config`)
      return accounts
    } catch (err) {
      throw new Error(`Failed to decrypt TERRACORE_ACCOUNTS_ENC: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const raw = process.env.TERRACORE_ACCOUNTS
  if (!raw) {
    throw new Error("Missing TERRACORE_ACCOUNTS or (TERRACORE_ACCOUNTS_ENC + TERRACORE_ENCRYPTION_KEY) env vars")
  }

  const accounts = JSON.parse(raw) as AccountWithKeys[]
  if (!Array.isArray(accounts)) throw new Error("TERRACORE_ACCOUNTS must be a JSON array")
  console.log(`[env] Loaded ${accounts.length} account(s) from plaintext config`)
  return accounts
}

// ── Load accounts with posting key only ───────────────────────────────────────

export function loadAccountsPostingOnly(): AccountWithPostingKey[] {
  return loadAccounts().map(({ username, posting_key }) => ({ username, posting_key }))
}
