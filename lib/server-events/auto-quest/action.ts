/**
 * lib/server-events/auto-quest/action.ts
 *
 * Server Action (async generator) for the auto-quest script.
 * Yields event objects directly — no push callback, no SSE encoding.
 * The calling page iterates with: for await (const evt of runAutoQuest(params)) { ... }
 */

import { Client, PrivateKey }                              from "@hiveio/dhive"
import { makeClientRelaxed }                              from "@/lib/shared/hive-client"
import { fetchPlayer, fetchQuestBoard, fetchActiveQuests } from "@/lib/shared/api/terracore"
import type { PlayerData, QuestBoard, ActiveQuest, QuestBoardSlot } from "@/lib/shared/api/terracore"
import { checkQuestRequirements }                         from "@/lib/quest-utils"
import type { AutoQuestEvent }                            from "@/lib/shared/events/types"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AccountWithKeys {
  username:    string
  active_key:  string
  posting_key: string
}

export interface RunAutoQuestParams {
  accounts: AccountWithKeys[]
}

// ── Hive client ───────────────────────────────────────────────────────────────
// makeClientRelaxed() imported from lib/shared/hive-client.ts

// ── Terracore API ─────────────────────────────────────────────────────────────
// fetchPlayer(), fetchQuestBoard(), fetchActiveQuests() imported from lib/shared/api/terracore.ts

// ── Quest eligibility ─────────────────────────────────────────────────────────
// checkQuestRequirements() imported from @/lib/quest-utils
// TIER_REQUIREMENTS and QUEST_TYPE_CONFIG live there as the single source of truth.

function isTodayQuest(aq: ActiveQuest, boardDate: string | null): boolean {
  return !boardDate || !aq.board_date || aq.board_date === boardDate
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"))
    const id = setTimeout(resolve, ms)
    signal?.addEventListener("abort", () => { clearTimeout(id); reject(new DOMException("Aborted", "AbortError")) }, { once: true })
  })
}

// ── Broadcast helpers ─────────────────────────────────────────────────────────

async function collectQuest(
  client: Client,
  username: string,
  postingKey: string,
  questId: string,
): Promise<string> {
  const payload = { quest_id: questId, "tx-hash": Math.random().toString(36).slice(2, 22) }
  const op: [string, Record<string, unknown>] = [
    "custom_json",
    {
      required_auths:         [],
      required_posting_auths: [username],
      id:                     "terracore_quest_collect",
      json:                   JSON.stringify(payload),
    },
  ]
  const tx = await client.broadcast.sendOperations([op as any], PrivateKey.fromString(postingKey))
  return tx.id
}

async function startQuest(
  client: Client,
  username: string,
  activeKey: string,
  slot: QuestBoardSlot,
): Promise<string> {
  const hash = Math.random().toString(36).slice(2, 22)
  const memo = `terracore_quest_start-${slot.quest_type}-${slot.tier}-${hash}`
  const payload = {
    contractName:    "tokens",
    contractAction:  "transfer",
    contractPayload: { symbol: "SCRAP", to: "null", quantity: String(slot.scrap_cost), memo },
  }
  const op: [string, Record<string, unknown>] = [
    "custom_json",
    {
      required_auths:         [username],
      required_posting_auths: [],
      id:                     "ssc-mainnet-hive",
      json:                   JSON.stringify(payload),
    },
  ]
  const tx = await client.broadcast.sendOperations([op as any], PrivateKey.fromString(activeKey))
  return tx.id
}

// ── Core action ───────────────────────────────────────────────────────────────

export async function* runAutoQuest(
  params: RunAutoQuestParams,
  signal?: AbortSignal,
): AsyncGenerator<AutoQuestEvent> {
  const { accounts } = params

  try {
    // ── Step 1: Fetch board ──────────────────────────────────────────────
    yield { type: "step", step: "board", status: "running", message: "Fetching today's quest board..." }

    let board: QuestBoard
    try {
      assertNotAborted(signal)
      board = await fetchQuestBoard(accounts[0].username)
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") { yield { type: "done", success: false }; return }
      yield { type: "step", step: "board", status: "error", message: "Failed to fetch quest board from Terracore API." }
      yield { type: "done", success: false }
      return
    }

    yield {
      type:    "step",
      step:    "board",
      status:  "done",
      message: `Board loaded: ${board.slots?.length ?? 0} quest slots for ${board.date}`,
    }

    // ── Step 2: Check accounts ───────────────────────────────────────────
    yield { type: "step", step: "check", status: "running", message: `Checking ${accounts.length} account(s) for quest status...` }

    let totalCollected = 0
    let totalStarted   = 0
    let totalErrors    = 0

    const client = makeClientRelaxed()

    for (const acc of accounts) {
      assertNotAborted(signal)
      try {
        assertNotAborted(signal)
        const [active, player] = await Promise.all([
          fetchActiveQuests(acc.username),
          fetchPlayer(acc.username),
        ])
        const now       = Date.now()
        const boardDate = board.date ?? null

        const ongoing        = active.filter((q) => !q.collected && isTodayQuest(q, boardDate))
        const readyToCollect = ongoing.filter((q) => now >= q.completes_at)
        const inProgress     = ongoing.filter((q) => now < q.completes_at)

        const notActiveSlots = (board.slots ?? []).filter(
          (slot) =>
            !active.some(
              (aq) =>
                aq.name       === slot.name       &&
                aq.quest_type === slot.quest_type &&
                aq.tier       === slot.tier       &&
                isTodayQuest(aq, boardDate),
            ),
        )

        const availableSlots = notActiveSlots.filter(
          (slot) => checkQuestRequirements(player, slot.quest_type, slot.tier).canStart,
        )

        yield {
          type:           "account",
          username:       acc.username,
          inProgress:     inProgress.length,
          readyToCollect: readyToCollect.length,
          available:      availableSlots.length,
        }

        // ── Collect finished quests ──────────────────────────────────────
        for (const quest of readyToCollect) {
          assertNotAborted(signal)
          try {
            const txId = await collectQuest(client, acc.username, acc.posting_key, quest._id)
            yield {
              type:     "action",
              username: acc.username,
              action:   "collect",
              quest:    quest.name,
              status:   "ok",
              message:  `Collected → TX: ${txId.slice(0, 10)}...`,
              txId,
            }
            totalCollected++
            await sleep(1_500, signal)
          } catch (err) {
            if ((err as DOMException)?.name === "AbortError") throw err
            yield {
              type:     "action",
              username: acc.username,
              action:   "collect",
              quest:    quest.name,
              status:   "error",
              message:  err instanceof Error ? err.message : "Broadcast failed",
            }
            totalErrors++
          }
        }

        // ── Start available quests (up to 3) ─────────────────────────────
        for (const slot of availableSlots.slice(0, 3)) {
          assertNotAborted(signal)
          try {
            const txId = await startQuest(client, acc.username, acc.active_key, slot)
            yield {
              type:     "action",
              username: acc.username,
              action:   "start",
              quest:    slot.name,
              status:   "ok",
              message:  `Started T${slot.tier} → TX: ${txId.slice(0, 10)}...`,
              txId,
            }
            totalStarted++
            await sleep(1_500, signal)
          } catch (err) {
            if ((err as DOMException)?.name === "AbortError") throw err
            yield {
              type:     "action",
              username: acc.username,
              action:   "start",
              quest:    slot.name,
              status:   "error",
              message:  err instanceof Error ? err.message : "Broadcast failed",
            }
            totalErrors++
          }
        }
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") throw err
        yield {
          type:     "account-error",
          username: acc.username,
          message:  err instanceof Error ? err.message : "Unknown error",
        }
        totalErrors++
      }

      await sleep(1_000, signal)
    }

    yield { type: "step", step: "check", status: "done", message: `Checked ${accounts.length} account(s).` }
    yield {
      type:    "step",
      step:    "execute",
      status:  totalErrors === 0 ? "done" : "error",
      message: `${totalCollected} collected, ${totalStarted} started, ${totalErrors} errors`,
    }

    yield {
      type:    "done",
      success: true,
      summary: { totalCollected, totalStarted, totalErrors, accounts: accounts.length },
    }
  } catch (err) {
    if ((err as DOMException)?.name === "AbortError") {
      yield { type: "done", success: false }
      return
    }
    yield { type: "error", message: err instanceof Error ? err.message : "Unexpected error" }
    yield { type: "done",  success: false }
  }
}
