// lib/events/claim-scrap/action.ts
// Keychain: requestCustomJson  id="terracore_claim"
// Claims the player's unclaimed SCRAP balance.

export interface ClaimScrapParams {
  username: string
  amount:   number   // raw unclaimed scrap balance
}

export type ClaimScrapResult =
  | { success: true }
  | { success: false; message: string }

export function claimScrap(
  params: ClaimScrapParams,
  onResult: (result: ClaimScrapResult) => void,
): void {
  if (typeof window === "undefined" || !window.hive_keychain) {
    onResult({ success: false, message: "Hive Keychain extension is not installed." })
    return
  }

  // Amount must be a string formatted to 8 decimal places
  const amountStr = params.amount.toFixed(8)

  const payload = {
    amount: amountStr,
  }

  window.hive_keychain.requestCustomJson(
    params.username,
    "terracore_claim",
    "Posting",
    JSON.stringify(payload),
    `Claim ${amountStr} SCRAP`,
    (response) => {
      if (response.success) {
        onResult({ success: true })
      } else {
        onResult({ success: false, message: response.message ?? "Transaction rejected or failed." })
      }
    },
  )
}
