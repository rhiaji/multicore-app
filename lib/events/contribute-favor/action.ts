// lib/events/contribute-favor/action.ts
// Burns SCRAP via Hive Engine to gain Favor.
// id: "ssc-mainnet-hive", contractName: "tokens", contractAction: "transfer"
// contractPayload: { symbol: "SCRAP", to: "null", quantity: "<amount>", memo: "terracore_contribute-<random_hash>" }

export interface ContributeFavorParams {
  username: string
  amount: number // SCRAP to burn
}

export type ContributeFavorResult =
  | { success: true }
  | { success: false; message: string }

function randomHash(): string {
  return Math.random().toString(36).substring(2, 10) +
    Math.random().toString(36).substring(2, 10)
}

export function contributeFavor(
  params: ContributeFavorParams,
  onResult: (result: ContributeFavorResult) => void,
): void {
  if (typeof window === "undefined" || !window.hive_keychain) {
    onResult({ success: false, message: "Hive Keychain extension is not installed." })
    return
  }

  const quantity = params.amount.toFixed(3)
  const memo = `terracore_contribute-${randomHash()}`

  const json = {
    contractName: "tokens",
    contractAction: "transfer",
    contractPayload: {
      symbol: "SCRAP",
      to: "null",
      quantity,
      memo,
    },
  }

  window.hive_keychain.requestCustomJson(
    params.username,
    "ssc-mainnet-hive",
    "Active",
    JSON.stringify(json),
    `Burn ${quantity} SCRAP for Favor`,
    (response) => {
      if (response.success) {
        onResult({ success: true })
      } else {
        onResult({ success: false, message: response.message ?? "Transaction rejected or failed." })
      }
    },
  )
}
