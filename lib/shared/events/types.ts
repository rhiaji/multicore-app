/**
 * lib/shared/events/types.ts
 *
 * Typed discriminated unions for every server-event generator.
 * Page components import these types and cast the SSE stream events to
 * the appropriate union — eliminating all the (evt as any) casts.
 *
 * Naming convention: one exported union per generator, named after it.
 */

import type { RelicType } from "@/lib/types"

// ── Shared building blocks ────────────────────────────────────────────────────

/** Step progress events emitted by every generator. */
export type StepEvent = {
  type:    "step"
  step:    string
  status:  "running" | "done" | "error"
  message: string
}

/** Terminal error before done. */
export type ErrorEvent = {
  type:    "error"
  message: string
}

// ── RelicMarketSell ───────────────────────────────────────────────────────────

export type RelicMarketSellAccountEvent = {
  type:     "account"
  username: string
  unlisted: number
  listed:   number
}

export type RelicMarketSellAccountErrorEvent = {
  type:     "account-error"
  username: string
  message:  string
}

export type RelicMarketSellActionEvent = {
  type:     "sell-action"
  username: string
  action:   "list" | "skip" | "already-listed"
  count:    number
  status:   "ok" | "skip" | "error"
  message:  string
  txId?:    string
  byRarity?: Record<string, number>
}

export type RelicMarketSellDoneEvent = {
  type:    "done"
  success: boolean
  summary?: {
    sellers:        number
    sellOk:         number
    sellSkip:       number
    sellError:      number
    listedByRarity: Record<string, number>
  }
}

export type RelicMarketSellEvent =
  | StepEvent
  | ErrorEvent
  | RelicMarketSellAccountEvent
  | RelicMarketSellAccountErrorEvent
  | RelicMarketSellActionEvent
  | RelicMarketSellDoneEvent

// ── RelicMarketBuy ────────────────────────────────────────────────────────────

export type RelicMarketBuyAccountCheckedEvent = {
  type:         "account-checked"
  username:     string
  listed:       number
  added:        number
  pendingTotal: number
  status:       "ok" | "error"
  message?:     string
}

export type RelicMarketBuyBatchPlanListing = {
  seller:    string
  type:      RelicType
  amount:    number
  unitPrice: string
  lineTotal: string
}

export type RelicMarketBuyPlanEvent = {
  type:       "buy-plan"
  batchIndex: number
  listings:   RelicMarketBuyBatchPlanListing[]
  totalHive:  string
}

export type RelicMarketBuyActionEvent = {
  type:       "buy-action"
  batchIndex: number
  seller:     string
  /** Field is named `type_relic` in the payload to avoid clashing with the discriminant `type`. */
  type_relic: RelicType
  amount:     number
  price:      string
  status:     "ok" | "error"
  txId?:      string
  message:    string
}

export type RelicMarketBuyDoneEvent = {
  type:    "done"
  success: boolean
  summary?: {
    buyer:     string
    batches:   number
    listings:  number
    totalHive: string
    buyOk:     number
    buyError:  number
  }
}

export type RelicMarketBuyEvent =
  | StepEvent
  | ErrorEvent
  | RelicMarketBuyAccountCheckedEvent
  | RelicMarketBuyPlanEvent
  | RelicMarketBuyActionEvent
  | RelicMarketBuyDoneEvent

// ── AutoQuest ─────────────────────────────────────────────────────────────────

export type AutoQuestAccountEvent = {
  type:           "account"
  username:       string
  inProgress:     number
  readyToCollect: number
  available:      number
}

export type AutoQuestAccountErrorEvent = {
  type:     "account-error"
  username: string
  message:  string
}

export type AutoQuestActionEvent = {
  type:     "action"
  username: string
  action:   "collect" | "start"
  quest:    string
  status:   "ok" | "error"
  message:  string
  txId?:    string
}

export type AutoQuestDoneEvent = {
  type:    "done"
  success: boolean
  summary?: {
    totalCollected: number
    totalStarted:   number
    totalErrors:    number
    accounts:       number
  }
}

export type AutoQuestEvent =
  | StepEvent
  | ErrorEvent
  | AutoQuestAccountEvent
  | AutoQuestAccountErrorEvent
  | AutoQuestActionEvent
  | AutoQuestDoneEvent

// ── AutoClaimBattle ───────────────────────────────────────────────────────────

export type AutoClaimBattlePlayerEvent = {
  type:       "player"
  username:   string
  attacks:    number
  maxAttacks: number
  claims:     number
  lastclaim:  number
  minerate:   number
  scrap:      number
}

export type AutoClaimBattlePlayerErrorEvent = {
  type:     "player-error"
  username: string
  message:  string
}

export type AutoClaimBattleAccountActionEvent = {
  type:     "account-action"
  username: string
  action:
    | "skip"
    | "attacks-start"
    | "attacks-done"
    | "attacks-skip"
    | "attacks-error"
    | "claim-ok"
    | "claim-error"
  reason?:  string
  count?:   number
  targets?: string[]
  txId?:    string
  minerate?: string
  message?: string
}

export type AutoClaimBattleDoneEvent = {
  type:    "done"
  success: boolean
  summary?: {
    accounts:     number
    totalClaimed: number
    totalSkipped: number
    totalAttacks: number
    totalErrors:  number
  }
}

export type AutoClaimBattleEvent =
  | StepEvent
  | ErrorEvent
  | AutoClaimBattlePlayerEvent
  | AutoClaimBattlePlayerErrorEvent
  | AutoClaimBattleAccountActionEvent
  | AutoClaimBattleDoneEvent

// ── Transfer ──────────────────────────────────────────────────────────────────

export type TransferStepEvent = StepEvent & {
  /** Only present on the "balances" step. */
  balances?: Record<string, number>
}

export type TransferTransferEvent = {
  type:     "transfer"
  username: string
  status:   "ok" | "skip" | "error"
  message:  string
  amount:   number
  symbol:   string
  txId?:    string
}

export type TransferDoneEvent = {
  type:    "done"
  success: boolean
  symbol?: string
  summary?: {
    successCount: number
    skipCount:    number
    errorCount:   number
    totalMoved:   number
  }
}

export type TransferEvent =
  | TransferStepEvent
  | ErrorEvent
  | TransferTransferEvent
  | TransferDoneEvent
