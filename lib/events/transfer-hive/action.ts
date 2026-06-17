// lib/events/transfer-hive/action.ts
// Keychain: requestTransfer
// Transfers HIVE from one account to another.

export interface TransferHiveParams {
  from:      string   // sending account (tracked)
  to:        string   // recipient username
  amount:    string   // "X.XXX" — 3 decimal places, no currency suffix
  memo:      string
  enforced?: boolean  // when true the amount field is locked in Keychain UI
}

export type TransferHiveResult =
  | { success: true }
  | { success: false; message: string }

export function transferHive(
  params: TransferHiveParams,
  onResult: (result: TransferHiveResult) => void,
): void {
  if (typeof window === "undefined" || !window.hive_keychain) {
    onResult({ success: false, message: "Hive Keychain extension is not installed." })
    return
  }

  window.hive_keychain.requestTransfer(
    params.from,
    params.to,
    params.amount,
    params.memo,
    "HIVE",
    (response) => {
      if (response.success) {
        onResult({ success: true })
      } else {
        onResult({ success: false, message: response.message ?? "Transaction rejected or failed." })
      }
    },
    params.enforced ?? false,
  )
}
