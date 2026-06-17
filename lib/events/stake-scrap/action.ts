// lib/events/stake-scrap/action.ts
// Stakes SCRAP via Hive Engine to increase Stash size, Dodge and Luck.
// id: "ssc-mainnet-hive", contractName: "tokens", contractAction: "stake"
// contractPayload: { symbol: "SCRAP", to: username, quantity: "<amount_as_string>" }
// Authority: Active

export interface StakeScrapParams {
  username: string
  amount: number
}

export type StakeScrapResult =
  | { success: true }
  | { success: false; message: string }

export function stakeScrap(
  params: StakeScrapParams,
  onResult: (result: StakeScrapResult) => void,
): void {
  if (typeof window === "undefined" || !window.hive_keychain) {
    onResult({ success: false, message: "Hive Keychain extension is not installed." })
    return
  }

  const quantity = params.amount.toFixed(3)

  const json = {
    contractName: "tokens",
    contractAction: "stake",
    contractPayload: {
      symbol: "SCRAP",
      to: params.username,
      quantity,
    },
  }

  window.hive_keychain.requestCustomJson(
    params.username,
    "ssc-mainnet-hive",
    "Active",
    JSON.stringify(json),
    `Stake ${quantity} SCRAP`,
    (response) => {
      if (response.success) {
        onResult({ success: true })
      } else {
        onResult({ success: false, message: response.message ?? "Transaction rejected or failed." })
      }
    },
  )
}
