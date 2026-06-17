import type { AccountWithKeys } from "../../../shared/lib/encryption"
import {
  getAllQuestInfo,
  type TerracoreQuest,
  type QuestBoardSlot,
} from "../../../shared/api/terracore"
import { BlockchainService } from "./blockchain"
import settings from "../config/settings"
import {
  logHeader,
  logInfo,
  logWarning,
  logError,
  logSummary,
  logQuestStatus,
  logQuestAction,
  type LoopStats,
} from "../../../shared/lib/logger"

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export type AccountConfig = AccountWithKeys

export class AccountAutomationService {
  private accounts:   AccountConfig[]
  private blockchain: BlockchainService

  constructor(accounts: AccountConfig[]) {
    this.accounts   = accounts
    this.blockchain = new BlockchainService()
  }

  // ── Public entry points ────────────────────────────────────────────────────

  async runOnce(): Promise<LoopStats> {
    const stats: LoopStats = {
      claimed: 0, collected: 0, started: 0, transferred: 0, skipped: 0, errors: 0,
      total: this.accounts.length,
    }

    for (let i = 0; i < this.accounts.length; i++) {
      const result = await this.processAccount(this.accounts[i])
      stats.collected += result.collected
      stats.started   += result.started
      stats.errors    += result.errors
      if (result.errors > 0)                                    stats.errors++
      else if (result.collected === 0 && result.started === 0)  stats.skipped++

      if (i < this.accounts.length - 1) await delay(settings.delays.betweenAccounts)
    }

    return stats
  }

  async runContinuous(intervalMs: number): Promise<never> {
    logHeader("TERRACORE QUEST BOT")
    logInfo(`Starting continuous loop — ${this.accounts.length} account(s)`)

    // Resolve best Hive node via PeakD beacon before first loop
    await this.blockchain.initialize()

    let loopCount = 0

    while (true) {
      loopCount++
      logHeader(`LOOP #${loopCount}`)

      const stats = await this.runOnce()
      logSummary("LOOP SUMMARY", {
        "Collected": stats.collected,
        "Started":   stats.started,
        "Skipped":   stats.skipped,
        "Errors":    stats.errors,
        "Accounts":  stats.total,
      })

      const wait = intervalMs || settings.delays.betweenLoops
      logInfo(`Waiting ${wait / 1_000}s before next loop...`)
      await delay(wait)
    }
  }

  // ── Per-account logic ──────────────────────────────────────────────────────

  private async processAccount(
    account: AccountConfig,
    attempt = 1,
  ): Promise<{ collected: number; started: number; errors: number }> {
    const result = { collected: 0, started: 0, errors: 0 }

    try {
      const { inProgress, readyToCollect, available } =
        await getAllQuestInfo(account.username)

      logQuestStatus(account.username, inProgress.length, readyToCollect.length, available.length)

      for (const quest of readyToCollect) {
        const ok = await this.collectQuest(account, quest)
        if (ok) result.collected++
        else    result.errors++
      }

      // Start every available quest — no per-cycle cap. As long as a board
      // slot is available to start, start it.
      for (const slot of available) {
        const ok = await this.startQuest(account, slot)
        if (ok) result.started++
        else    result.errors++
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logError(`Error on attempt ${attempt} for ${account.username}: ${msg}`)

      if (attempt < settings.retry.maxAttempts) {
        await delay(settings.delays.retryDelay * attempt)
        return this.processAccount(account, attempt + 1)
      }

      logError(`Max retries reached for ${account.username}`)
      result.errors++
    }

    return result
  }

  private async collectQuest(account: AccountConfig, quest: TerracoreQuest): Promise<boolean> {
    try {
      await this.blockchain.collectQuest(account.username, account.posting_key, quest._id)
      logQuestAction("collect", account.username, quest.name, "success")
      await delay(settings.delays.betweenActions)
      return true
    } catch (err) {
      logQuestAction("collect", account.username, quest.name, "failed", err instanceof Error ? err.message : String(err))
      return false
    }
  }

  private async startQuest(account: AccountConfig, slot: QuestBoardSlot): Promise<boolean> {
    try {
      await this.blockchain.startQuest(
        account.username,
        account.active_key,
        slot.quest_type,
        String(slot.tier),
        slot.scrap_cost,
      )
      logQuestAction("start", account.username, slot.name, "success", `T${slot.tier}`)
      await delay(settings.delays.betweenActions)
      return true
    } catch (err) {
      logQuestAction("start", account.username, slot.name, "failed", err instanceof Error ? err.message : String(err))
      return false
    }
  }

  async failoverNode(): Promise<void> {
    logWarning(`Node failover requested — re-initializing blockchain service`)
    await this.blockchain.initialize()
  }
}
