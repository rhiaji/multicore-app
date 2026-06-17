export interface PlayerStats {
  damage: number
  defense: number
  engineering: number
  dodge: number
  crit: number
  luck: number
  protection: number
  focus: number
}

export interface ItemAttributes {
  dodge: number
  damage: number
  defense: number
  engineering: number
  crit: number
  luck: number
}

export interface EquippedItem {
  item_number: string | null
  item_id: string | null
  item_equipped: boolean
  attributes: ItemAttributes
}

export interface PlayerItems {
  avatar: EquippedItem
  weapon: EquippedItem
  armor: EquippedItem
  ship: EquippedItem
  tool: EquippedItem
}

export interface PlayerData {
  username: string
  favor: number
  scrap: number
  health: number
  damage: number
  defense: number
  engineering: number
  experience: number
  level: number
  hiveEngineScrap: number
  hiveEngineStake: number
  maxAttacks: number
  attacks: number
  claims: number
  lastclaim: number
  lastregen: number
  minerate: number
  stats: PlayerStats
  items: PlayerItems
}

export interface QuestLog {
  username: string
  action: "start" | "complete"
  quest_type: string
  tier: number
  name: string
  image_url?: string
  board_date: string
  started_at?: number
  completes_at?: number
  scrap_paid?: number
  base_roll?: number
  effective_roll?: number
  draw_count?: number
  rewards?: {
    common: number
    uncommon: number
    rare: number
    epic: number
    legendary: number
  }
  xp?: number
  time: string
}

export interface QuestSlot {
  template_id: string
  quest_type: string
  tier: number
  name: string
  flavor: string
  image_url: string
  duration_hours: number
  base_rolls: number
  scrap_cost: number
}

/** Alias for QuestSlot — matches the field name used in server-events actions. */
export type QuestBoardSlot = QuestSlot

export interface BattleTarget {
  username: string
  defense?: number
  damage?:  number
}

export interface QuestBoard {
  date: string
  slots: QuestSlot[]
  generated_at: number
  multiplier: number
  scrap_usd: number
}

export interface ActiveQuest {
  _id: string
  username: string
  quest_type: string
  tier: number
  name: string
  flavor: string
  image_url: string
  primary_stat: string
  required_item_type: string
  scrap_paid: number
  base_rolls: number
  duration_hours: number | null
  equipped_item_rarity: string | null
  equipped_item_level: number
  effective_primary_stat: number
  started_at: number
  completes_at: number
  expires_at: number
  collected: boolean
  time_remaining_ms: number
  board_date: string
}

export interface UserRelic {
  _id: string
  username: string
  version: number
  type: "common_relics" | "uncommon_relics" | "rare_relics" | "epic_relics" | "legendary_relics"
  amount: number
  market: {
    listed: boolean
    amount: number
    /**
     * Raw price string as returned by the Terracore API, e.g. "0.100 HIVE".
     * Use parseFloat(price) to get the numeric value.
     */
    price: string
    seller: string | null
  }
}

/** Canonical alias — the Terracore API field is named `price` as a string. */
export type RelicType = UserRelic["type"]

export interface UserItemsResponse {
  relics: UserRelic[]
}

export interface ScrapBalance {
  account: string
  symbol: string
  balance: string
  stake: string
  pendingUnstake: string
}

export interface HiveData {
  hiveBalance: number
  hbdBalance: number
  hiveSavings: number
  hbdSavings: number
  hpBalance: number        // Hive Power (VESTS converted)
  rcPercent: number        // resource credits 0-100
  rcCurrent: number
  rcMax: number
}

export interface AccountData {
  username: string
  player: PlayerData | null
  quests: QuestBoard | null
  activeQuests: ActiveQuest[] | null
  questLogs: QuestLog[] | null
  userRelics: UserRelic[] | null
  scrapBalance: ScrapBalance | null
  hiveData: HiveData | null
  loading: boolean
  error: string | null
}
