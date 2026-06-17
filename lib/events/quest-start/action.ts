// lib/events/quest-start/action.ts
// Keychain: requestCustomJson  id="ssc-mainnet-hive"
// Starts a Terracore daily quest by burning SCRAP via Hive Engine token transfer.

export interface QuestStartParams {
  username:   string
  questType:  string
  tier:       number
  scrapCost:  number
  questName:  string
}

export type QuestStartResult =
  | { success: true }
  | { success: false; message: string }

export function questStart(
  params: QuestStartParams,
  onResult: (result: QuestStartResult) => void,
): void {
  if (typeof window === "undefined" || !window.hive_keychain) {
    onResult({ success: false, message: "Hive Keychain extension is not installed." })
    return
  }

  const hash = Math.random().toString(36).slice(2, 22)
  const memo = `terracore_quest_start-${params.questType}-${params.tier}-${hash}`

  const payload = {
    contractName:    "tokens",
    contractAction:  "transfer",
    contractPayload: {
      symbol:   "SCRAP",
      to:       "null",
      quantity: String(params.scrapCost),
      memo,
    },
  }

  window.hive_keychain.requestCustomJson(
    params.username,
    "ssc-mainnet-hive",
    "Active",
    JSON.stringify(payload),
    `Start quest: ${params.questName}`,
    (response) => {
      if (response.success) {
        onResult({ success: true })
      } else {
        onResult({ success: false, message: response.message ?? "Transaction rejected or failed." })
      }
    },
  )
}
