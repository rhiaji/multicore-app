"use client"

// ── Types ──────────────────────────────────────────────────────────────────────

export interface HiveAccount {
  name: string
  balance: string          // e.g. "24.234 HIVE"
  hbd_balance: string      // e.g. "0.004 HBD"
  posting_json_metadata: string
}

export interface HiveUser {
  username: string
  hiveBalance: number      // parsed float
  hbdBalance: number
  avatarUrl: string
}

// ── Keychain type declaration ──────────────────────────────────────────────────

declare global {
  interface Window {
    hive_keychain?: {
      requestSignBuffer: (
        account: string,
        message: string,
        keyType: string,
        callback: (response: { success: boolean; result?: string; message?: string }) => void
      ) => void
      requestCustomJson: (
        account: string,
        id: string,
        keyType: string,
        json: string,
        displayName: string,
        callback: (response: { success: boolean; message?: string }) => void
      ) => void
      requestTransfer: (
        account: string,
        to: string,
        amount: string,
        memo: string,
        currency: string,
        callback: (response: { success: boolean; message?: string }) => void,
        enforced?: boolean
      ) => void
      requestBroadcast: (
        account: string,
        operations: [string, Record<string, unknown>][],
        keyType: string,
        callback: (response: { success: boolean; message?: string }) => void
      ) => void
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export async function fetchHiveAccount(username: string): Promise<HiveAccount | null> {
  try {
    const res = await fetch("https://api.hive.blog/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 0,
        jsonrpc: "2.0",
        method: "condenser_api.get_accounts",
        params: [[username]],
      }),
    })
    const data = await res.json()
    const account: HiveAccount | undefined = data?.result?.[0]
    return account ?? null
  } catch {
    return null
  }
}

export function parseHiveUser(account: HiveAccount): HiveUser {
  let avatarUrl = `https://images.hive.blog/u/${account.name}/avatar/small`
  try {
    const meta = JSON.parse(account.posting_json_metadata)
    if (meta?.profile?.profile_image) avatarUrl = meta.profile.profile_image
  } catch { /* keep default */ }

  return {
    username: account.name,
    hiveBalance: parseFloat(account.balance.split(" ")[0]) || 0,
    hbdBalance: parseFloat(account.hbd_balance.split(" ")[0]) || 0,
    avatarUrl,
  }
}

// ── Persistence helpers ───────────────────────────────────────────────────────

const STORAGE_KEY = "terracore_hive_user"

export function saveHiveUser(user: HiveUser): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(user)) } catch { /* ignore */ }
}

export function loadHiveUser(): HiveUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as HiveUser) : null
  } catch { return null }
}

export function clearHiveUser(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

// ── Login via Keychain (sign a message to verify ownership) ──────────────────

export function loginWithKeychain(
  username: string,
  onSuccess: (user: HiveUser) => void,
  onError: (msg: string) => void
): void {
  if (!window.hive_keychain) {
    onError("Hive Keychain extension is not installed.")
    return
  }

  const message = `terracore-login-${Date.now()}`

  window.hive_keychain.requestSignBuffer(
    username,
    message,
    "Posting",
    async (response) => {
      if (!response.success) {
        onError(response.message ?? "Keychain request was cancelled.")
        return
      }
      // Signature succeeded — fetch account data to get balances
      const account = await fetchHiveAccount(username)
      if (!account) {
        onError("Could not fetch account data from Hive API.")
        return
      }
      onSuccess(parseHiveUser(account))
    }
  )
}
