import dotenv from "dotenv"
import path   from "path"
import { loadAccounts }    from "../../../shared/config/env"
import { BEACON_URL }      from "../../../shared/config/node-selector"
import type { AccountWithKeys } from "../../../shared/lib/encryption"

dotenv.config({ path: path.resolve(process.cwd(), ".env") })
dotenv.config()

export type AccountConfig = AccountWithKeys

export interface RelicMarketConfig {
  /** All sub-accounts — main account is excluded; these are the sellers. */
  sellers:     AccountConfig[]
  /** The buyer account (TERRACORE_ACCOUNT_MAIN). */
  buyer:       AccountConfig
  pollInterval: number
  beaconUrl:   string
}

export function loadConfig(): RelicMarketConfig {
  const mainUsername = process.env.TERRACORE_ACCOUNT_MAIN?.trim() ?? ""
  if (!mainUsername) {
    throw new Error("TERRACORE_ACCOUNT_MAIN must be set — it is the buyer account.")
  }

  const allAccounts = loadAccounts() as AccountConfig[]

  const buyer = allAccounts.find((a) => a.username === mainUsername)
  if (!buyer) {
    throw new Error(
      `Buyer "@${mainUsername}" not found in TERRACORE_ACCOUNTS_ENC. ` +
      `Available: ${allAccounts.map((a) => a.username).join(", ")}`,
    )
  }
  if (!buyer.active_key) {
    throw new Error(`active_key missing for buyer @${mainUsername}`)
  }

  const sellers = allAccounts.filter((a) => a.username !== mainUsername)
  if (sellers.length === 0) {
    throw new Error("No seller accounts found — add sub-accounts to TERRACORE_ACCOUNTS_ENC.")
  }

  return {
    sellers,
    buyer,
    pollInterval: parseInt(process.env.POLL_INTERVAL || "60000", 10),
    beaconUrl:    process.env.BEACON_URL || BEACON_URL,
  }
}
