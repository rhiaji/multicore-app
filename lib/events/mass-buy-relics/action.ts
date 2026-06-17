// lib/events/mass-buy-relics/action.ts
// Keychain: requestBroadcast  (multiple transfer operations)
// Buys all relic listings from tracked accounts in a single transaction.

import type { RelicType } from "@/lib/types"

export type { RelicType }

export interface MassBuyRelicEntry {
  seller:     string
  type:       RelicType
  itemNumber: string | number
  amount:     number
  /** Total cost for this listing as "X.XXX" */
  totalHive:  string
}

export interface MassBuyRelicsParams {
  buyer:    string
  listings: MassBuyRelicEntry[]
}

export type MassBuyRelicsResult =
  | { success: true }
  | { success: false; message: string }

function generateActionId(): string {
  return `tm_purchase-${Math.random().toString(36).slice(2, 10)}`
}

export const MASS_BUY_MAX_OPS = 25

export function massBuyRelics(
  params: MassBuyRelicsParams,
  onResult: (result: MassBuyRelicsResult) => void,
): void {
  if (typeof window === "undefined" || !window.hive_keychain) {
    onResult({ success: false, message: "Hive Keychain extension is not installed." })
    return
  }

  if (params.listings.length === 0) {
    onResult({ success: false, message: "No listings provided." })
    return
  }

  // Cap at MASS_BUY_MAX_OPS to stay well within Hive's 50-op limit per transaction
  const capped = params.listings.slice(0, MASS_BUY_MAX_OPS)

  const operations: [string, Record<string, unknown>][] = capped.map((l) => {
    const memo = JSON.stringify({
      action:      generateActionId(),
      marketplace: "terracore.market",
      item_number: String(l.itemNumber),
      type:        l.type,
      buyer:       params.buyer,
      seller:      l.seller,
      amount:      l.amount,
    })
    return [
      "transfer",
      {
        from:   params.buyer,
        to:     "terracore.market",
        amount: `${l.totalHive} HIVE`,
        memo,
      },
    ]
  })

  window.hive_keychain.requestBroadcast(
    params.buyer,
    operations,
    "Active",
    (response: { success: boolean; message?: string }) => {
      if (response.success) {
        onResult({ success: true })
      } else {
        onResult({ success: false, message: response.message ?? "Transaction rejected or failed." })
      }
    },
  )
}
