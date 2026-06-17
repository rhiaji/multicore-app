// lib/events/upgrade-stat/action.ts
// Burns SCRAP via Hive Engine to upgrade a stat (damage, defense, or engineering).
// id: "ssc-mainnet-hive", contractName: "tokens", contractAction: "transfer"
// contractPayload: { symbol: "SCRAP", to: "null", quantity: "<cost>", memo: "terracore_<stat>-<random_hash>" }
// Cost = currentLevel ^ 2
// Levels: damage = player.damage / 10, defense = player.defense / 10, engineering = player.engineering (as-is)

export type UpgradeStat = "damage" | "defense" | "engineering"

export interface UpgradeStatParams {
  username: string
  stat: UpgradeStat
  currentLevel: number // already resolved level (not the raw stat value)
}

export type UpgradeStatResult =
  | { success: true }
  | { success: false; message: string }

function randomHash(): string {
  return (
    Math.random().toString(36).substring(2, 10) +
    Math.random().toString(36).substring(2, 10)
  )
}

/** Resolve the current level from raw player stat values. */
export function statLevel(stat: UpgradeStat, player: { damage: number; defense: number; engineering: number }): number {
  if (stat === "damage") return Math.floor(player.damage / 10)
  if (stat === "defense") return Math.floor(player.defense / 10)
  return player.engineering
}

/** Cost in SCRAP to upgrade = currentLevel ^ 2 */
export function upgradeCost(currentLevel: number): number {
  return currentLevel * currentLevel
}

export function upgradeStat(
  params: UpgradeStatParams,
  onResult: (result: UpgradeStatResult) => void,
): void {
  if (typeof window === "undefined" || !window.hive_keychain) {
    onResult({ success: false, message: "Hive Keychain extension is not installed." })
    return
  }

  const cost = upgradeCost(params.currentLevel)
  const quantity = String(cost)
  const memo = `terracore_${params.stat}-${randomHash()}`

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
    `Upgrade ${params.stat} — burn ${quantity} SCRAP`,
    (response) => {
      if (response.success) {
        onResult({ success: true })
      } else {
        onResult({ success: false, message: response.message ?? "Transaction rejected or failed." })
      }
    },
  )
}
