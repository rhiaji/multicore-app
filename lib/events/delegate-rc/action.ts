// lib/events/delegate-rc/action.ts
// Keychain: requestCustomJson  id="rc"
// Delegates Resource Credits (RC) from the connected account to a target account.

export interface DelegateRcParams {
  from:       string   // connected Keychain account (delegator)
  to:         string   // target account (delegatee)
  maxRc:      bigint   // raw RC amount in full precision
  displayGrc: string   // human-readable label shown in Keychain UI (e.g. "5 G RC")
}

export type DelegateRcResult =
  | { success: true; txId?: string }
  | { success: false; message: string }

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
