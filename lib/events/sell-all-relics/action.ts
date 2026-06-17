// lib/events/sell-all-relics/action.ts
// Keychain: requestBroadcast  (multiple custom_json "tm_create" operations)
// Lists multiple relic types on the Terracore marketplace in one transaction.

import type { RelicType } from "@/lib/types"

export type { RelicType }

export interface SellAllRelicEntry {
  type:   RelicType
  /** Full-precision amount from the API — sent to the server for exact balance zeroing. */
  amount: number
  /** Unit price as a string: "0.XXX HIVE" */
  price:  string
}

export interface SellAllRelicsParams {
  username: string
  entries:  SellAllRelicEntry[]
}

export type SellAllRelicsResult =
  | { success: true }
  | { success: false; message: string }

export function sellAllRelics(
  params: SellAllRelicsParams,
  onResult: (result: SellAllRelicsResult) => void,
): void {
  if (typeof window === "undefined" || !window.hive_keychain) {
    onResult({ success: false, message: "Hive Keychain extension is not installed." })
    return
  }

  if (params.entries.length === 0) {
    onResult({ success: false, message: "No relic entries provided." })
    return
  }

  const operations: [string, Record<string, unknown>][] = params.entries.map((e) => [
    "custom_json",
    {
      required_auths:         [params.username],
      required_posting_auths: [],
      id:                     "tm_create",
      json:                   JSON.stringify({
        type:   e.type,
        amount: e.amount,
        price:  e.price,
      }),
    },
  ])

  window.hive_keychain.requestBroadcast(
    params.username,
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
