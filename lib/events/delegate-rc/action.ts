// lib/events/delegate-rc/action.ts
// Keychain: requestCustomJson  id="rc"
// Delegates Resource Credits (RC) from the connected account to one or more target accounts.
//
// Hive allows a maximum of 25 operations per transaction.
// For mass delegation, accounts are split into batches of MAX_DELEGATEES_PER_TX and
// each batch is sent as a separate Keychain requestCustomJson call sequentially.

// Maximum delegatees per Keychain tx (Hive op limit = 25 ops/tx)
export const MAX_DELEGATEES_PER_TX = 25

export interface DelegateRcParams {
  from:       string   // connected Keychain account (delegator)
  to:         string   // target account (delegatee) — single-account form
  maxRc:      number   // raw RC amount in full precision
  displayGrc: string   // human-readable label shown in Keychain UI (e.g. "5 G RC")
}

export interface MassDelegateRcParams {
  from:       string    // connected Keychain account (delegator)
  delegatees: string[]  // list of target accounts (batched in groups of 25)
  maxRc:      number    // same RC amount applied to every delegatee
  displayGrc: string    // human-readable label shown in Keychain UI
}

export type DelegateRcResult =
  | { success: true; txId?: string }
  | { success: false; message: string }

export type MassDelegateRcResult =
  | { success: true; batches: number; txIds: string[] }
  | { success: false; message: string; completedBatches: number }

/** Single-account delegation (original behaviour, unchanged). */
export function delegateRc(
  params: DelegateRcParams,
  onResult: (result: DelegateRcResult) => void,
): void {
  if (typeof window === "undefined" || !window.hive_keychain) {
    onResult({ success: false, message: "Hive Keychain extension is not installed." })
    return
  }

  const customJson = JSON.stringify([
    "delegate_rc",
    {
      from:       params.from,
      delegatees: [params.to],
      max_rc:     params.maxRc,
    },
  ])

  ;(window as any).hive_keychain.requestCustomJson(
    params.from,
    "rc",
    "Posting",
    customJson,
    `Delegate ${params.displayGrc} to @${params.to}`,
    (response: { success: boolean; result?: { id: string }; error?: string; message?: string }) => {
      if (response.success) {
        onResult({ success: true, txId: response.result?.id })
      } else {
        onResult({ success: false, message: response.message ?? response.error ?? "Keychain request cancelled." })
      }
    },
  )
}

/**
 * Mass delegation — splits delegatees into batches of MAX_DELEGATEES_PER_TX (25)
 * and fires one Keychain requestCustomJson per batch sequentially.
 * Each batch includes all delegatees in that chunk in a single delegate_rc op.
 */
export function massDelegateRc(
  params: MassDelegateRcParams,
  onResult: (result: MassDelegateRcResult) => void,
): void {
  if (typeof window === "undefined" || !window.hive_keychain) {
    onResult({ success: false, message: "Hive Keychain extension is not installed.", completedBatches: 0 })
    return
  }

  if (params.delegatees.length === 0) {
    onResult({ success: false, message: "No accounts selected.", completedBatches: 0 })
    return
  }

  // Split into chunks of 25
  const batches: string[][] = []
  for (let i = 0; i < params.delegatees.length; i += MAX_DELEGATEES_PER_TX) {
    batches.push(params.delegatees.slice(i, i + MAX_DELEGATEES_PER_TX))
  }

  const txIds: string[] = []
  let batchIndex = 0

  function sendBatch() {
    if (batchIndex >= batches.length) {
      onResult({ success: true, batches: batches.length, txIds })
      return
    }

    const batch = batches[batchIndex]
    const batchNum = batchIndex + 1
    const total = batches.length

    const customJson = JSON.stringify([
      "delegate_rc",
      {
        from:       params.from,
        delegatees: batch,
        max_rc:     params.maxRc,
      },
    ])

    const label = total > 1
      ? `Delegate ${params.displayGrc} to ${batch.length} accounts (batch ${batchNum}/${total})`
      : `Delegate ${params.displayGrc} to ${batch.length} account${batch.length !== 1 ? "s" : ""}`

    ;(window as any).hive_keychain.requestCustomJson(
      params.from,
      "rc",
      "Posting",
      customJson,
      label,
      (response: { success: boolean; result?: { id: string }; error?: string; message?: string }) => {
        if (response.success) {
          if (response.result?.id) txIds.push(response.result.id)
          batchIndex++
          sendBatch()
        } else {
          onResult({
            success: false,
            message: response.message ?? response.error ?? "Keychain request cancelled.",
            completedBatches: batchIndex,
          })
        }
      },
    )
  }

  sendBatch()
}
