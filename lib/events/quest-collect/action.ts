// lib/events/quest-collect/action.ts
// Keychain: requestCustomJson  id="terracore_quest_collect"
// Collects (claims rewards from) a completed Terracore daily quest.

export interface QuestCollectParams {
  username:  string
  questId:   string
  questName: string
}

export type QuestCollectResult =
  | { success: true }
  | { success: false; message: string }

export function questCollect(
  params: QuestCollectParams,
  onResult: (result: QuestCollectResult) => void,
): void {
  if (typeof window === "undefined" || !window.hive_keychain) {
    onResult({ success: false, message: "Hive Keychain extension is not installed." })
    return
  }

  const txHash = Math.random().toString(36).slice(2, 22)

  const payload = {
    quest_id:   params.questId,
    "tx-hash":  txHash,
  }

  window.hive_keychain.requestCustomJson(
    params.username,
    "terracore_quest_collect",
    "Posting",
    JSON.stringify(payload),
    `Collect: ${params.questName}`,
    (response) => {
      if (response.success) {
        onResult({ success: true })
      } else {
        onResult({ success: false, message: response.message ?? "Transaction rejected or failed." })
      }
    },
  )
}
