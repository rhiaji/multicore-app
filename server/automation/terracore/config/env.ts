import dotenv from "dotenv"
import path   from "path"
import { loadAccounts }    from "../../../shared/config/env"
import { BEACON_URL }      from "../../../shared/config/node-selector"
import type { AccountWithKeys } from "../../../shared/lib/encryption"

dotenv.config({ path: path.resolve(process.cwd(), ".env") })
dotenv.config()

export type AccountConfig = AccountWithKeys

export interface ServerConfig {
  accounts:    AccountConfig[]
  mainAccount: string
  logLevel:    "debug" | "info" | "warn" | "error"
  pollInterval: number
  beaconUrl:   string
}

export function loadConfig(): ServerConfig {
  const accounts = loadAccounts() as AccountConfig[]

  const mainAccount = process.env.TERRACORE_ACCOUNT_MAIN?.trim() ?? ""
  if (!mainAccount) {
    console.warn("[terracore] TERRACORE_ACCOUNT_MAIN is not set — SCRAP transfers will be skipped.")
  }

  return {
    accounts,
    mainAccount,
    logLevel:     (process.env.LOG_LEVEL || "info") as ServerConfig["logLevel"],
    pollInterval: parseInt(process.env.POLL_INTERVAL || "60000", 10),
    beaconUrl:    process.env.BEACON_URL || BEACON_URL,
  }
}
