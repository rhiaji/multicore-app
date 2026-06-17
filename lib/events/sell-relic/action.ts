// lib/events/sell-relic/action.ts
// Keychain: requestCustomJson  id="tm_create"
// Lists a single relic type on the Terracore marketplace.

import type { RelicType } from "@/lib/types"

export type { RelicType }

export interface SellRelicParams {
  username:    string
  relicType:   RelicType
  /** Full-precision amount from the API (e.g. 0.9509999999999998).
   *  Send this value — NOT the rounded display value — so the server
   *  can zero the balance exactly. */
  amount:      number
  /** Unit price as a string: "0.XXX HIVE" */
  price:       string
  displayLabel?: string
}

export type SellRelicResult =
  | { success: true }
  | { success: false; message: string }

export function sellRelic(
  params: SellRelicParams,
  onResult: (result: SellRelicResult) => void,
): void {
  if (typeof window === "undefined" || !window.hive_keychain) {
    onResult({ success: false, message: "Hive Keychain extension is not installed." })
    return
  }

  const json = JSON.stringify({
    type:   params.relicType,
    amount: params.amount,
    price:  params.price,
  })

  const display = params.displayLabel ?? `List ${params.relicType} on marketplace`

  window.hive_keychain.requestCustomJson(
    params.username,
    "tm_create",
    "Active",
    json,
    display,
    (response) => {
      if (response.success) {
        onResult({ success: true })
      } else {
        onResult({ success: false, message: response.message ?? "Transaction rejected or failed." })
      }
    },
  )
}
