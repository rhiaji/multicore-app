// lib/events/delegation-stats/action.ts
// Fetches delegation vesting-share stats for a Hive account directly from the
// Hive API — no HTTP round-trip through a Next.js route handler.

import { Client } from "@hiveio/dhive"

const client = new Client(["https://api.hive.blog"])

export interface DelegationStats {
  incoming:  number   // received_vesting_shares (VESTS)
  outgoing:  number   // delegated_vesting_shares (VESTS)
  available: number   // vesting_shares - delegated_vesting_shares (VESTS)
}

export type DelegationStatsResult =
  | { success: true;  data: DelegationStats }
  | { success: false; message: string }

function parseVests(value: unknown): number {
  return parseFloat(
    String(
      typeof value === "string"
        ? value
        : (value as any)?.amount ?? "0"
    )
  )
}

export async function fetchDelegationStats(
  username: string,
): Promise<DelegationStatsResult> {
  if (!username) {
    return { success: false, message: "Username is required." }
  }

  try {
    const accounts = await client.database.getAccounts([username])
    if (accounts.length === 0) {
      return { success: false, message: `Account "@${username}" not found.` }
    }

    const account = accounts[0]
    const vesting            = parseVests(account.vesting_shares)
    const receivedVesting    = parseVests(account.received_vesting_shares)
    const delegatedVesting   = parseVests(account.delegated_vesting_shares)

    return {
      success: true,
      data: {
        incoming:  receivedVesting,
        outgoing:  delegatedVesting,
        available: vesting - delegatedVesting,
      },
    }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Failed to fetch delegation stats.",
    }
  }
}
