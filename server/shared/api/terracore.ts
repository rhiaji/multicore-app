/**
 * Shared Terracore API client — player data, battle targets, relics,
 * and quest board / active-quest helpers used by both the web API routes
 * and the server automation.
 */

const BASE_URL = "https://api.terracoregame.com"

// ── Player ────────────────────────────────────────────────────────────────────

/**
 * Full player profile used by auto-quest and web routes.
 * `PlayerData` (below) is the slim subset used by auto-claim-battle.
 */
export interface TerracorePlayer {
  username:    string
  level:       number
  experience:  number
  damage:      number
  defense:     number
  engineering: number
  attacks:     number
  claims:      number
  minerate:    number
  scrap:       number
  items:       Record<string, unknown>
  [key: string]: unknown
}

/** Slim shape used by auto-claim-battle (subset of TerracorePlayer) */
export interface PlayerData {
  username: string
  damage:   number
  attacks:  number
  claims:   number
  minerate: number
  scrap:    number
}

// ── Quest types ───────────────────────────────────────────────────────────────

export interface TerracoreQuest {
  _id:              string
  username:         string
  quest_type:       string
  tier:             number
  name:             string
  flavor:           string
  image_url:        string
  duration_hours:   number | null
  scrap_cost?:      number
  scrap_paid:       number
  base_rolls:       number
  started_at:       number
  completes_at:     number
  expires_at:       number
  collected:        boolean
  time_remaining_ms: number
  board_date:       string
  [key: string]: unknown
}

export interface QuestBoardSlot {
  template_id:    string
  quest_type:     string
  tier:           number
  name:           string
  flavor:         string
  image_url:      string
  duration_hours: number
  base_rolls:     number
  scrap_cost:     number
}

export interface QuestBoard {
  date:         string
  slots:        QuestBoardSlot[]
  generated_at: number
  multiplier:   number
  scrap_usd:    number
}

export interface QuestLogEntry {
  _id:        string
  username:   string
  action:     "start" | "complete" | "collect"
  quest_id?:  string
  quest_type?: string
  tier?:      string
  time:       string
  rewards?:   Record<string, unknown>
  xp?:        number
  [key: string]: unknown
}

// ── Battle ────────────────────────────────────────────────────────────────────

export interface BattleTarget {
  username: string
  defense:  number
}

// ── Relics ────────────────────────────────────────────────────────────────────

export type RelicType =
  | "common_relics"
  | "uncommon_relics"
  | "rare_relics"
  | "epic_relics"
  | "legendary_relics"

export interface UserRelic {
  type:   RelicType
  amount: number
  market: {
    listed:  boolean
    amount:  number
    price:   string
    seller:  string | null
    created: number
  }
}

// ── Tier + quest-type requirement tables (mirrors lib/quest-utils.ts) ─────────

const TIER_REQUIREMENTS: Record<number, {
  level: number; stat: number; luckDodge: number; itemRequired: boolean
}> = {
  1: { level: 1,   stat: 10,  luckDodge: 2,  itemRequired: false },
  2: { level: 10,  stat: 50,  luckDodge: 5,  itemRequired: false },
  3: { level: 25,  stat: 100, luckDodge: 12, itemRequired: true  },
  4: { level: 50,  stat: 200, luckDodge: 20, itemRequired: true  },
  5: { level: 100, stat: 500, luckDodge: 40, itemRequired: true  },
}

const QUEST_TYPE_CONFIG: Record<string, {
  primaryStat:       string
  requiredItemSlot:  string | null
  statFromItemsOnly: boolean
}> = {
  combat:  { primaryStat: "damage",      requiredItemSlot: "weapon", statFromItemsOnly: false },
  salvage: { primaryStat: "engineering", requiredItemSlot: "tool",   statFromItemsOnly: false },
  stealth: { primaryStat: "dodge",       requiredItemSlot: "armor",  statFromItemsOnly: true  },
  fortune: { primaryStat: "luck",        requiredItemSlot: "avatar", statFromItemsOnly: true  },
  defense: { primaryStat: "defense",     requiredItemSlot: "ship",   statFromItemsOnly: false },
}

function getEffectiveStat(player: TerracorePlayer, questType: string): number {
  const config = QUEST_TYPE_CONFIG[questType]
  if (!config) return 0
  const items = player.items as Record<string, { attributes?: { luck?: number; dodge?: number } }> | undefined
  switch (config.primaryStat) {
    case "damage":      return (player.damage as number) ?? 0
    case "defense":     return (player.defense as number) ?? 0
    case "engineering": return (player.engineering as number) ?? 0
    case "luck":
      if (!items) return 0
      return Object.values(items).reduce((sum, slot) => sum + (slot?.attributes?.luck  ?? 0), 0)
    case "dodge":
      if (!items) return 0
      return Object.values(items).reduce((sum, slot) => sum + (slot?.attributes?.dodge ?? 0), 0)
    default: return 0
  }
}

/** Returns true if the player meets all requirements to start this board slot */
export function canPlayerStartSlot(player: TerracorePlayer, slot: QuestBoardSlot): boolean {
  const tierReqs     = TIER_REQUIREMENTS[slot.tier] ?? TIER_REQUIREMENTS[1]
  const config       = QUEST_TYPE_CONFIG[slot.quest_type]
  const requiredStat = config?.statFromItemsOnly ? tierReqs.luckDodge : tierReqs.stat
  const effectiveStat = getEffectiveStat(player, slot.quest_type)
  const levelMet     = (player.level as number) >= tierReqs.level
  const statMet      = effectiveStat >= requiredStat

  if (!levelMet || !statMet) return false

  if (tierReqs.itemRequired && config?.requiredItemSlot) {
    const items        = player.items as Record<string, { item_equipped?: boolean }> | undefined
    const itemEquipped = items?.[config.requiredItemSlot]?.item_equipped ?? false
    if (!itemEquipped) return false
  }

  return true
}

// ── Hive Engine token balances ────────────────────────────────────────────────

const HE_API = "https://api.hive-engine.com/rpc/contracts"

/**
 * Fetch the Hive Engine liquid SCRAP balance for a single account.
 * Returns 0 if the account has no SCRAP entry.
 */
export async function getHiveEngineScrapBalance(username: string): Promise<number> {
  const res = await fetch(HE_API, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "find",
      params: {
        contract: "tokens",
        table:    "balances",
        query:    { symbol: "SCRAP", account: username },
        limit:    1,
        offset:   0,
      },
    }),
  })
  if (!res.ok) throw new Error(`HE balance fetch failed for ${username} (HTTP ${res.status})`)
  const json = await res.json()
  return parseFloat(json?.result?.[0]?.balance ?? "0")
}

/**
 * Batch-fetch Hive Engine liquid SCRAP balances for multiple accounts.
 * Uses a single $in query (HE caps at 1000 rows per request).
 * Returns a map of username → balance; missing accounts default to 0.
 */
export async function getHiveEngineScrapBalances(
  usernames: string[],
): Promise<Record<string, number>> {
  const map: Record<string, number> = {}
  for (const u of usernames) map[u] = 0  // default

  const CHUNK = 1000
  for (let i = 0; i < usernames.length; i += CHUNK) {
    const chunk = usernames.slice(i, i + CHUNK)
    const res = await fetch(HE_API, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "find",
        params: {
          contract: "tokens",
          table:    "balances",
          query:    { symbol: "SCRAP", account: { $in: chunk } },
          limit:    CHUNK,
          offset:   0,
        },
      }),
    })
    if (!res.ok) throw new Error(`HE batch balance fetch failed (HTTP ${res.status})`)
    const json = await res.json()
    for (const row of json?.result ?? []) {
      map[row.account] = parseFloat(row.balance ?? "0")
    }
  }
  return map
}

// ── Player fetches ────────────────────────────────────────────────────────────

/**
 * Fetch full player profile — used by auto-quest and web routes.
 */
export async function fetchPlayerProfile(username: string): Promise<TerracorePlayer> {
  const res = await fetch(`${BASE_URL}/player/${username}`)
  if (!res.ok) {
    if (res.status === 404) throw new Error(`Player "${username}" not found.`)
    throw new Error(`Failed to fetch player (HTTP ${res.status}).`)
  }
  return res.json() as Promise<TerracorePlayer>
}

/**
 * Fetch slim player data — used by auto-claim-battle.
 * Retries up to 5× on rate-limit (HTTP 429).
 */
export async function getPlayerData(username: string, attempt = 1): Promise<PlayerData> {
  const res = await fetch(`${BASE_URL}/player/${username}`)
  if (!res.ok) {
    if (res.status === 429 && attempt <= 5) {
      const wait = 2_000 * attempt
      console.log(`[terracore] Rate limited for ${username}, retrying in ${wait / 1_000}s (attempt ${attempt})`)
      await new Promise((r) => setTimeout(r, wait))
      return getPlayerData(username, attempt + 1)
    }
    throw new Error(`Failed to fetch player ${username} (HTTP ${res.status})`)
  }
  const data = await res.json()
  return {
    username: data.username,
    damage:   data.stats?.damage ?? data.damage ?? 0,
    attacks:  data.attacks,
    claims:   data.claims,
    minerate: data.minerate * 3_600,
    scrap:    data.scrap,
  }
}

// ── Battle targets ────────────────────────────────────────────────────────────

export async function getAttackTargets(maxDefense: number): Promise<BattleTarget[]> {
  const url = `${BASE_URL}/battle?limit=100&offset=1&maxDefense=${maxDefense - 10}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch battle targets (HTTP ${res.status})`)
  const data = await res.json()
  return (data.players as BattleTarget[]).slice(0, 2)
}

// ── Relics ────────────────────────────────────────────────────────────────────

export async function getPlayerRelics(username: string): Promise<UserRelic[]> {
  const res = await fetch(`${BASE_URL}/items/${username}`)
  if (!res.ok) {
    if (res.status === 404) return []
    throw new Error(`Failed to fetch relics for ${username} (HTTP ${res.status})`)
  }
  const data = await res.json()
  return (data?.relics ?? []) as UserRelic[]
}

// ── Quest board + active quests ───────────────────────────────────────────────

export async function fetchQuestBoard(username: string): Promise<QuestBoard> {
  const res = await fetch(`${BASE_URL}/quest_board?username=${username}`)
  if (!res.ok) {
    if (res.status === 404) throw new Error(`Quest board for "${username}" not found.`)
    throw new Error(`Failed to fetch quest board (HTTP ${res.status}).`)
  }
  return res.json() as Promise<QuestBoard>
}

export async function fetchActiveQuests(username: string): Promise<TerracoreQuest[]> {
  const res = await fetch(`${BASE_URL}/quests/${username}`)
  if (!res.ok) {
    if (res.status === 404) return []
    throw new Error(`Failed to fetch active quests (HTTP ${res.status}).`)
  }
  return res.json() as Promise<TerracoreQuest[]>
}

export async function fetchQuestLogs(username: string, limit = 10): Promise<QuestLogEntry[]> {
  const res = await fetch(`${BASE_URL}/quest_logs/${username}?limit=${limit}`)
  if (!res.ok) {
    if (res.status === 404) return []
    throw new Error(`Failed to fetch quest logs (HTTP ${res.status}).`)
  }
  const data = (await res.json()) as any
  if (Array.isArray(data))               return data
  if (data && Array.isArray(data.logs))  return data.logs
  if (data && Array.isArray(data.data))  return data.data
  return []
}

/**
 * Aggregate quest state for a single account.
 * Applies the board_date guard so only today's quests are considered.
 */
export async function getAllQuestInfo(username: string) {
  const [player, board, active] = await Promise.all([
    fetchPlayerProfile(username),
    fetchQuestBoard(username),
    fetchActiveQuests(username),
  ])

  const now       = Date.now()
  const boardDate = board.date ?? null

  const isTodayQuest = (aq: TerracoreQuest) =>
    !boardDate || !aq.board_date || aq.board_date === boardDate

  // Collection must NOT be gated by board_date: quests take hours/days to
  // finish, so a quest that is ready to collect now was usually started on a
  // previous day's board. Filtering those out by today's board_date would
  // permanently strand their rewards (the "Ready: 0" bug). Consider every
  // uncollected active quest here.
  const ongoing        = active.filter((q) => !q.collected)
  const readyToCollect = ongoing.filter((q) => now >= q.completes_at)
  const inProgress     = ongoing.filter((q) => now <  q.completes_at)

  const notActiveSlots = (board.slots ?? []).filter(
    (slot) =>
      !active.some(
        (aq) =>
          aq.name       === slot.name       &&
          aq.quest_type === slot.quest_type &&
          aq.tier       === slot.tier       &&
          isTodayQuest(aq),
      ),
  )
  const available = notActiveSlots.filter((slot) => canPlayerStartSlot(player, slot))

  return { player, board, ongoing, inProgress, readyToCollect, available }
}
