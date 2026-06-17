/**
 * lib/shared/api/terracore.ts
 *
 * Single source of truth for all Terracore API fetchers used across
 * lib/server-events/*.  Uses only native `fetch` — no Node.js-only APIs —
 * so it is safe in both Server Actions and any future client-side use.
 *
 * Types are imported from lib/types.ts (canonical domain types).
 */

import type {
  PlayerData,
  UserRelic,
  ActiveQuest,
  QuestBoard,
  BattleTarget,
  QuestBoardSlot,
  RelicType,
} from "@/lib/types"

// ── Base URL ──────────────────────────────────────────────────────────────────

export const TC_BASE = "https://api.terracoregame.com"

// ── Types re-exported for convenience ────────────────────────────────────────

export type { PlayerData, UserRelic, ActiveQuest, QuestBoard, BattleTarget, QuestBoardSlot, RelicType }

// ── Fetchers ──────────────────────────────────────────────────────────────────

/**
 * Fetch all relics (listed and unlisted) for a given account.
 * Returns an empty array on 404 (account has no items).
 */
export async function fetchPlayerRelics(username: string): Promise<UserRelic[]> {
  const res = await fetch(`${TC_BASE}/items/${username}`)
  if (!res.ok) {
    if (res.status === 404) return []
    throw new Error(`HTTP ${res.status} fetching items for "@${username}"`)
  }
  const data = await res.json()
  return (data?.relics ?? []) as UserRelic[]
}

/**
 * Fetch a player's live data (level, stats, scrap, attacks, claims, etc.).
 * Automatically retries up to 5 times on HTTP 429 with back-off.
 */
export async function fetchPlayer(username: string, attempt = 1): Promise<PlayerData> {
  const res = await fetch(`${TC_BASE}/player/${username}`)
  if (!res.ok) {
    if (res.status === 429 && attempt <= 5) {
      await sleep(2_000 * attempt)
      return fetchPlayer(username, attempt + 1)
    }
    throw new Error(`HTTP ${res.status} fetching player "@${username}"`)
  }
  return res.json()
}

/**
 * Fetch the quest board for a given date / account context.
 * The API accepts any authenticated username — the board is the same for all.
 */
export async function fetchQuestBoard(username: string): Promise<QuestBoard> {
  const res = await fetch(`${TC_BASE}/quest_board?username=${username}`)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching quest board`)
  return res.json()
}

/**
 * Fetch all active (in-progress and completed-but-not-collected) quests
 * for a given account.
 */
export async function fetchActiveQuests(username: string): Promise<ActiveQuest[]> {
  const res  = await fetch(`${TC_BASE}/quests/${username}`)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching active quests for "@${username}"`)
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

/**
 * Fetch battle targets whose defense stat is below `maxDefense - 10`.
 */
export async function fetchBattleTargets(maxDefense: number): Promise<BattleTarget[]> {
  const res  = await fetch(`${TC_BASE}/battle?limit=100&offset=1&maxDefense=${maxDefense - 10}`)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching battle targets`)
  const json = await res.json()
  return Array.isArray(json) ? json : (json.players ?? [])
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
