import dotenv from "dotenv"
import path   from "path"
import { loadAccounts }         from "../../../shared/config/env"
import { BEACON_URL }           from "../../../shared/config/node-selector"
import type { AccountWithKeys } from "../../../shared/lib/encryption"
import settings                 from "./settings"

dotenv.config({ path: path.resolve(process.cwd(), ".env") })
dotenv.config()

export type AccountConfig = AccountWithKeys

export interface TokenTransferConfig {
  /** All sub-accounts that will send tokens to the main account. */
  senders:        AccountConfig[]
  /** Main account username — receives every sweep (TERRACORE_ACCOUNT_MAIN). */
  recipient:      string
  /** Token symbol — overrides settings.tokenSymbol when set. */
  tokenSymbol:    string
  pollInterval:   number
  beaconUrl:      string
  /** When true, run one pass then exit. */
  runOnce:        boolean
  /**
   * When true  → send the full balance (minus allowance).
   * When false → send the fixed customAmount instead.
   * Overrides settings.sendMaxBalance when provided.
   */
  sendMaxBalance: boolean | null
  /**
   * Fixed amount to send per account when sendMaxBalance is false.
   * Null means fall back to settings.customAmount.
   */
  customAmount:   number | null
}

export function loadConfig(): TokenTransferConfig {
  const recipient = process.env.TERRACORE_ACCOUNT_MAIN?.trim() ?? ""
  if (!recipient) {
    throw new Error(
      "TERRACORE_ACCOUNT_MAIN must be set — it is the main account that receives all sweeps.",
    )
  }

  // TOKEN_SYMBOL is optional — falls back to settings.tokenSymbol
  const tokenSymbol = (process.env.TOKEN_SYMBOL?.trim() || settings.tokenSymbol).toUpperCase()

  const allAccounts = loadAccounts() as AccountConfig[]
  if (allAccounts.length === 0) {
    throw new Error("No accounts loaded — check TERRACORE_ACCOUNTS / TERRACORE_ACCOUNTS_ENC.")
  }

  // Senders are every account except the main account itself.
  const senders = allAccounts.filter((a) => a.username !== recipient)
  if (senders.length === 0) {
    throw new Error(
      `All loaded accounts match the main account "@${recipient}". ` +
      `Add sub-accounts to TERRACORE_ACCOUNTS / TERRACORE_ACCOUNTS_ENC.`,
    )
  }

  return {
    senders,
    recipient,
    tokenSymbol,
    pollInterval:   parseInt(process.env.POLL_INTERVAL || "60000", 10),
    beaconUrl:      process.env.BEACON_URL || BEACON_URL,
    runOnce:        process.env.RUN_ONCE === "true",
    sendMaxBalance: process.env.SEND_MAX_BALANCE !== undefined
      ? process.env.SEND_MAX_BALANCE === "true"
      : null,
    customAmount: process.env.CUSTOM_AMOUNT !== undefined
      ? parseFloat(process.env.CUSTOM_AMOUNT)
      : null,
  }
}
