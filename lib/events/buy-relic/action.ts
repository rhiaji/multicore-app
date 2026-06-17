// lib/events/buy-relic/action.ts
// Keychain: requestTransfer
// Buys a single relic listing from the Terracore marketplace.
// The transfer goes to "terracore.market" with a JSON memo describing the purchase.

import type { RelicType } from "@/lib/types"

export type { RelicType }

export interface BuyRelicParams {
  buyer:      string
  seller:     string
  type:       RelicType
  itemNumber: string | number
  amount:     number   // quantity to buy
  totalHive:  string   // "X.XXX" — total cost already computed
}

export type BuyRelicResult =
  | { success: true }
  | { success: false; message: string }

function generateActionId(): string {
  return `tm_purchase-${Math.random().toString(36).slice(2, 10)}`
}

export function buyRelic(
  params: BuyRelicParams,
  onResult: (result: BuyRelicResult) => void,
): void {
  if (typeof window === "undefined" || !window.hive_keychain) {
    onResult({ success: false, message: "Hive Keychain extension is not installed." })
    return
  }

  const memo = JSON.stringify({
    action:      generateActionId(),
    marketplace: "terracore.market",
    item_number: String(params.itemNumber),
    type:        params.type,
    buyer:       params.buyer,
    seller:      params.seller,
    amount:      params.amount,
  })

  window.hive_keychain.requestTransfer(
    params.buyer,
    "terracore.market",
    params.totalHive,
    memo,
    "HIVE",
    (response) => {
      if (response.success) {
        onResult({ success: true })
      } else {
        onResult({ success: false, message: response.message ?? "Transaction rejected or failed." })
      }
    },
  )
}
