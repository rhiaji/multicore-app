import type { PlayerData, QuestSlot, ActiveQuest, EquippedItem } from "@/lib/types"

// ─── Tier requirements ────────────────────────────────────────────────────────

export interface TierRequirements {
  level: number
  stat: number          // Damage / Defense / Engineering threshold
  luckDodge: number     // Luck / Dodge (items-only) threshold
  itemRequired: boolean // T3+ require item
}

export const TIER_REQUIREMENTS: Record<number, TierRequirements> = {
  1: { level: 1,   stat: 10,  luckDodge: 2,  itemRequired: false },
  2: { level: 10,  stat: 50,  luckDodge: 5,  itemRequired: false },
  3: { level: 25,  stat: 100, luckDodge: 12, itemRequired: true  },
  4: { level: 50,  stat: 200, luckDodge: 20, itemRequired: true  },
  5: { level: 100, stat: 500, luckDodge: 40, itemRequired: true  },
}

// ─── Quest type config ────────────────────────────────────────────────────────

export interface QuestTypeConfig {
  primaryStat: "damage" | "defense" | "engineering" | "luck" | "dodge"
  secondaryStat: "crit" | "luck" | "dodge" | null
  requiredItemSlot: "weapon" | "armor" | "ship" | "avatar" | "tool" | null
  // For luck/dodge — sourced from items only (sum across 5 slots)
  statFromItemsOnly: boolean
  color: string
  label: string
}

export const QUEST_TYPE_CONFIG: Record<string, QuestTypeConfig> = {
  combat: {
    primaryStat: "damage",
    secondaryStat: "crit",
    requiredItemSlot: "weapon",
    statFromItemsOnly: false,
    color: "text-red-400 border-red-400/40 bg-red-400/10",
    label: "COMBAT",
  },
  salvage: {
    primaryStat: "engineering",
    secondaryStat: null,
    requiredItemSlot: "tool",
    statFromItemsOnly: false,
    color: "text-sky-400 border-sky-400/40 bg-sky-400/10",
    label: "SALVAGE",
  },
  stealth: {
    primaryStat: "dodge",
    secondaryStat: "luck",
    requiredItemSlot: "armor",
    statFromItemsOnly: true,
    color: "text-violet-400 border-violet-400/40 bg-violet-400/10",
    label: "STEALTH",
  },
  fortune: {
    primaryStat: "luck",
    secondaryStat: "crit",
    requiredItemSlot: "avatar",
    statFromItemsOnly: true,
    color: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10",
    label: "FORTUNE",
  },
  defense: {
    primaryStat: "defense",
    secondaryStat: null,
    requiredItemSlot: "ship",
    statFromItemsOnly: false,
    color: "text-blue-400 border-blue-400/40 bg-blue-400/10",
    label: "DEFENSE",
  },
}

export const TIER_COLORS: Record<number, string> = {
  1: "bg-slate-600 text-slate-200",
  2: "bg-green-700 text-green-100",
  3: "bg-blue-700 text-blue-100",
  4: "bg-amber-600 text-amber-100",
  5: "bg-red-700 text-red-100",
}

// ─── Stat helpers ─────────────────────────────────────────────────────────────

/** Sum of luck from all 5 item slots */
export function getItemLuck(player: PlayerData): number {
  const items = player.items
  if (!items) return 0
  return (
    (items.weapon?.attributes?.luck ?? 0) +
    (items.armor?.attributes?.luck ?? 0) +
    (items.ship?.attributes?.luck ?? 0) +
    (items.avatar?.attributes?.luck ?? 0) +
    (items.tool?.attributes?.luck ?? 0)
  )
}

/** Sum of dodge from all 5 item slots */
export function getItemDodge(player: PlayerData): number {
  const items = player.items
  if (!items) return 0
  return (
    (items.weapon?.attributes?.dodge ?? 0) +
    (items.armor?.attributes?.dodge ?? 0) +
    (items.ship?.attributes?.dodge ?? 0) +
    (items.avatar?.attributes?.dodge ?? 0) +
    (items.tool?.attributes?.dodge ?? 0)
  )
}

/** Effective primary stat for a quest type */
export function getEffectiveStat(player: PlayerData, questType: string): number {
  const config = QUEST_TYPE_CONFIG[questType]
  if (!config) return 0
  switch (config.primaryStat) {
    case "damage":      return player.damage
    case "defense":     return player.defense
    case "engineering": return player.engineering
    case "luck":        return getItemLuck(player)
    case "dodge":       return getItemDodge(player)
    default:            return 0
  }
}

/** Effective secondary stat value */
export function getSecondaryStat(player: PlayerData, questType: string): number {
  const config = QUEST_TYPE_CONFIG[questType]
  if (!config || !config.secondaryStat) return 0
  switch (config.secondaryStat) {
    case "crit":  return player.stats?.crit ?? 0
    case "luck":  return getItemLuck(player)
    case "dodge": return getItemDodge(player)
    default:      return 0
  }
}

// ─── Requirement checks ───────────────────────────────────────────────────────

export interface QuestRequirementCheck {
  levelMet: boolean
  statMet: boolean
  itemEquipped: boolean
  itemRequired: boolean
  effectiveStat: number
  requiredStat: number
  requiredLevel: number
  requiredItemSlot: string | null
  canStart: boolean
  // For Luck/Dodge — shows item-only context
  statFromItemsOnly: boolean
}

export function checkQuestRequirements(
  player: PlayerData,
  questType: string,
  tier: number
): QuestRequirementCheck {
  const tierReqs = TIER_REQUIREMENTS[tier] ?? TIER_REQUIREMENTS[1]
  const config = QUEST_TYPE_CONFIG[questType]
  const isLuckDodge = config?.statFromItemsOnly ?? false

  const requiredStat = isLuckDodge ? tierReqs.luckDodge : tierReqs.stat
  const effectiveStat = getEffectiveStat(player, questType)
  const levelMet = player.level >= tierReqs.level
  const statMet = effectiveStat >= requiredStat
  const itemRequired = tierReqs.itemRequired
  const requiredItemSlot = config?.requiredItemSlot ?? null

  // Check if the required item slot has something equipped
  let itemEquipped = false
  if (requiredItemSlot && player.items) {
    const slot = player.items[requiredItemSlot as keyof typeof player.items] as EquippedItem | undefined
    itemEquipped = slot?.item_equipped ?? false
  }

  // Can start = level met + stat met + (item equipped if T3+)
  const canStart = levelMet && statMet && (!itemRequired || itemEquipped)

  return {
    levelMet,
    statMet,
    itemEquipped,
    itemRequired,
    effectiveStat,
    requiredStat,
    requiredLevel: tierReqs.level,
    requiredItemSlot,
    canStart,
    statFromItemsOnly: isLuckDodge,
  }
}

// ─── Relic drop rates per tier ────────────────────────────────────────────────

export interface RelicRates {
  common: number
  uncommon: number
  rare: number
  epic: number
  legendary: number
}

export const RELIC_RATES: Record<number, RelicRates> = {
  1: { common: 0.41, uncommon: 0.43, rare: 0.12, epic: 0.03, legendary: 0.01 },
  2: { common: 0.32, uncommon: 0.33, rare: 0.20, epic: 0.09, legendary: 0.06 },
  3: { common: 0.31, uncommon: 0.34, rare: 0.17, epic: 0.09, legendary: 0.09 },
  4: { common: 0.31, uncommon: 0.33, rare: 0.14, epic: 0.10, legendary: 0.12 },
  5: { common: 0.19, uncommon: 0.26, rare: 0.21, epic: 0.18, legendary: 0.157 },
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function formatDuration(hours: number | null): string {
  if (hours === null) return "—"
  if (hours < 24) return `${hours}h`
  return `${hours / 24}d`
}

export function formatScrap(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toFixed(0)
}

export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "Done"
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function statLabel(stat: string): string {
  const map: Record<string, string> = {
    damage: "DMG",
    defense: "DEF",
    engineering: "ENG",
    luck: "LCK",
    dodge: "DOD",
    crit: "CRIT",
  }
  return map[stat] ?? stat.toUpperCase()
}

export const ITEM_SLOT_LABEL: Record<string, string> = {
  weapon: "Weapon",
  armor: "Armor",
  ship: "Ship",
  avatar: "Avatar",
  tool: "Tool",
}

export const ITEM_SLOT_ORDER = ["weapon", "armor", "ship", "avatar", "tool"] as const
