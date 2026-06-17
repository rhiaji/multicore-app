// lib/events/battle/action.ts
// Keychain: requestCustomJson  id="terracore_battle"
// Authority: Posting
// Broadcasts one or more battle operations against the given targets.
// To avoid requiring the user to sign every single transaction, we use
// requestCustomJson with a single call per target (Keychain signs each
// operation individually for posting-key ops).  The caller loops with
// a small delay between calls so Keychain can process them sequentially.

export interface BattleTarget {
  username: string
  defense: number
  damage: number
  level: number
  scrap: number
}

export type BattleResult =
  | { success: true; target: string }
  | { success: false; target: string; message: string }

/**
 * Broadcast a single `terracore_battle` custom_json against one target.
 */
export function battlePlayer(
  attacker: string,
  target: string,
  onResult: (result: BattleResult) => void,
): void {
  if (typeof window === "undefined" || !window.hive_keychain) {
    onResult({ success: false, target, message: "Hive Keychain extension is not installed." })
    return
  }

  const payload = { target }

  window.hive_keychain.requestCustomJson(
    attacker,
    "terracore_battle",
    "Posting",
    JSON.stringify(payload),
    `Battle ${target}`,
    (response) => {
      if (response.success) {
        onResult({ success: true, target })
      } else {
        onResult({ success: false, target, message: response.message ?? "Transaction rejected or failed." })
      }
    },
  )
}

/**
 * Attack multiple targets in sequence (max 5).
 * Calls onProgress after each individual result, then onDone when all are done.
 * A 600 ms delay between each call gives Keychain time to finish before the next.
 */
export function battleMultiple(
  attacker: string,
  targets: string[],
  onProgress: (result: BattleResult, index: number, total: number) => void,
  onDone: (results: BattleResult[]) => void,
): void {
  const capped = targets.slice(0, 5)
  const results: BattleResult[] = []

  function next(i: number): void {
    if (i >= capped.length) {
      onDone(results)
      return
    }
    battlePlayer(attacker, capped[i], (result) => {
      results.push(result)
      onProgress(result, i, capped.length)
      // Small delay so Keychain can reset between popups
      setTimeout(() => next(i + 1), 600)
    })
  }

  next(0)
}
