import type { AccountConfig } from "../config/env"
import settings             from "../config/settings"
import {
  getAttackTargets,
  getAllQuestInfo,
  getHiveEngineScrapBalance,
  type TerracoreQuest,
  type QuestBoardSlot,
} from "../../../shared/api/terracore"
import { BlockchainService } from "./blockchain"
import {
  logHeader,
  logInfo,
  logSuccess,
  logWarning,
  logError,
  logSummary,
  logQuestStatus,
  logQuestAction,
  logAttack,
  logClaim,
  logAccountProgress,
  logTransfer,
  type LoopStats,
} from "../../../shared/lib/logger"

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Per-account result ────────────────────────────────────────────────────────

interface AccountResult {
  claimed:     number   // 0 or 1
  collected:   number   // quests collected
  started:     number   // quests started
  transferred: number   // 0 or 1 (SCRAP sweep performed)
  skipped:     number   // 0 or 1 (skipped claim)
  errors:      number
}

// ── Service ───────────────────────────────────────────────────────────────────

export class AccountAutomationService {
  private accounts:    AccountConfig[]
  private blockchain:  BlockchainService
  private mainAccount: string

  constructor(accounts: AccountConfig[], mainAccount = "") {
    this.accounts    = accounts
    this.mainAccount = mainAccount
    this.blockchain  = new BlockchainService()
  }

  // ── Public entry points ────────────────────────────────────────────────────

  /**
   * Run one full pass over all accounts.
   * Order per account:
   *   1. Fetch player data + quest board + quest logs
   *   2. Check player.scrap → gate the claim
   *   3. Battle (attack)
   *   4. Claim
   *   5. Collect ready quests → start available quests
   *   6. Check HE SCRAP balance → transfer if above allowance
   *      (waits 3–5s after a claim before reading HE balance;
   *       skips the wait if no claim was made this cycle)
   */
  async runOnce(): Promise<LoopStats> {
    const stats: LoopStats = {
      claimed: 0, collected: 0, started: 0, transferred: 0, skipped: 0, errors: 0,
      total: this.accounts.length,
    }

    for (let i = 0; i < this.accounts.length; i++) {
      const account = this.accounts[i]
      const result = await this.processAccount(account, 1, i + 1, this.accounts.length)

      stats.claimed      += result.claimed
      stats.collected    += result.collected
      stats.started      += result.started
      stats.transferred  += result.transferred
      stats.skipped      += result.skipped
      stats.errors       += result.errors

      if (i < this.accounts.length - 1) await delay(settings.delays.betweenAccounts)
    }

    return stats
  }

  /**
   * Run continuously at the specified poll interval.
   */
  async runContinuous(intervalMs: number): Promise<never> {
    logHeader("TERRACORE BOT")
    logInfo(`Starting continuous loop — ${this.accounts.length} account(s)`)

    // Resolve best Hive node via PeakD beacon before first loop
    await this.blockchain.initialize()

    let loopCount = 0

    while (true) {
      loopCount++
      logHeader(`LOOP #${loopCount}`)

      const stats = await this.runOnce()

      logSummary("LOOP SUMMARY", {
        "Claimed":      stats.claimed,
        "Collected":    stats.collected,
        "Started":      stats.started,
        "Transferred":  stats.transferred,
        "Skipped":      stats.skipped,
        "Errors":       stats.errors,
        "Accounts":     stats.total,
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
    index   = 0,
    total   = 0,
  ): Promise<AccountResult> {
    const result: AccountResult = { claimed: 0, collected: 0, started: 0, transferred: 0, skipped: 0, errors: 0 }

    try {
      // ── Step 1: Fetch player data + quest board + quest logs ──────────────────
      // getAllQuestInfo fetches player + board + active quests in parallel and
      // returns player as part of its result — no second fetch needed.
      const questInfo = await getAllQuestInfo(account.username)

      const { player, inProgress, readyToCollect, available } = questInfo

      // fetchPlayerProfile returns minerate as a raw per-second value.
      // Convert to per-hour for all threshold comparisons and display.
      const mineratePerHour = player.minerate * 3_600
      const requiredScrap   = mineratePerHour * settings.scrapRequirement.multiplier

      // Log per-account progress header using data we already have
      if (index > 0 && total > 0) {
        logAccountProgress(index, total, player.username, mineratePerHour, player.claims, player.scrap, requiredScrap)
      }
      logQuestStatus(account.username, inProgress.length, readyToCollect.length, available.length)

      // ── Step 2: Check player.scrap to gate the claim ──────────────────────────
      // player.scrap = in-game unclaimed SCRAP (distinct from HE token balance).
      // Use the per-hour rate for the threshold so the multiplier is meaningful.
      const hasEnoughScrap =
        settings.manualClaim.enabled ||
        (settings.scrapRequirement.enabled
          ? player.scrap > 0 && player.scrap >= requiredScrap
          : player.scrap > 0)

      const hasClaims = player.claims > 0

      if (!hasEnoughScrap) {
        logWarning(
          `Skipping claim for ${account.username} — unclaimed: ${player.scrap.toFixed(2)} SCRAP, need: ${requiredScrap.toFixed(2)} (${settings.scrapRequirement.multiplier}× minerate)`,
        )
        result.skipped++
      } else if (!hasClaims) {
        logWarning(`No claims available for ${account.username}`)
        result.skipped++
      } else {
        // ── Step 3: Battle (attack) ─────────────────────────────────────────────
        if (
          settings.attacks.enabled &&
          player.attacks >= settings.attacks.minimumRequired
        ) {
          logInfo(`Fetching attack targets for ${account.username}...`)
          const targets = await getAttackTargets(player.damage)
          logAttack(`Found ${targets.length} target(s) for ${account.username}`)

          await this.blockchain.attack(
            account.username,
            account.posting_key,
            targets.map((t) => t.username),
          )
        }

        // ── Step 4: Claim ───────────────────────────────────────────────────────
        logClaim(`Claiming for ${account.username}...`)
        await this.blockchain.claim(account.username, account.posting_key)
        logSuccess(`${account.username} — claimed! (+${mineratePerHour.toFixed(2)} SCRAP/hr)`)
        result.claimed++
      }

      // ── Step 5: Quests — collect ready, then start available ──────────────────
      // Runs regardless of whether a claim was made this cycle.
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

      // ── Step 6: Check Hive Engine SCRAP balance and sweep to main account ─────
      if (!settings.transfer.enabled) {
        logInfo(`[transfer] disabled in settings — skipping for ${account.username}`)
      } else if (!this.mainAccount) {
        logWarning(`[transfer] TERRACORE_ACCOUNT_MAIN is not set — skipping transfer for ${account.username}`)
      } else if (this.mainAccount === account.username) {
        logInfo(`[transfer] ${account.username} is the main account — skipping self-transfer`)
      } else {
        try {
          // If this account just claimed, wait for the mint to propagate on
          // Hive Engine before reading the balance (~3 s is enough in practice).
          // If no claim was made, read the existing balance immediately and still
          // transfer if it exceeds the allowance.
          if (result.claimed > 0) {
            const propagationDelay = settings.delays.claimPropagation ?? 3_000
            logInfo(
              `Waiting ${propagationDelay / 1_000}s for claim to propagate on Hive Engine...`,
            )
            await delay(propagationDelay)
          }

          const heBalance = await getHiveEngineScrapBalance(account.username)
          logInfo(
            `[HE balance] ${account.username} — ${heBalance.toFixed(3)} SCRAP` +
            ` (allowance: ${settings.transfer.scrapAllowance})`,
          )

          const sendAmt = heBalance - settings.transfer.scrapAllowance

          if (sendAmt >= 0.001) {
            logTransfer(account.username, this.mainAccount, sendAmt)
            await this.blockchain.transferScrap(
              account.username,
              account.active_key,
              this.mainAccount,
              sendAmt,
              settings.transfer.memo,
            )
            result.transferred++
            await delay(settings.delays.betweenActions)
          } else {
            logWarning(
              `Transfer skipped for ${account.username} — balance ${heBalance.toFixed(3)} SCRAP` +
              ` is within allowance (${settings.transfer.scrapAllowance})`,
            )
          }
        } catch (err) {
          logError(`Transfer failed for ${account.username}: ${err instanceof Error ? err.message : String(err)}`)
          result.errors++
        }
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logError(`Error on attempt ${attempt} for ${account.username}: ${msg}`)

      if (attempt < settings.retry.maxAttempts) {
        await delay(settings.delays.retryDelay * attempt)
        return this.processAccount(account, attempt + 1, index, total)
      }

      logError(`Max retries reached for ${account.username}`)
      result.errors++
    }

    return result
  }

  // ── Quest helpers ──────────────────────────────────────────────────────────

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

  // ── Node failover ──────────────────────────────────────────────────────────

  /**
   * Trigger a node failover. BlockchainService owns the NodeSelector so it
   * handles the rotation; we just log that a failover was requested.
   */
  async failoverNode(): Promise<void> {
    logWarning(`Node failover requested — re-initializing blockchain service`)
    await this.blockchain.initialize()
  }
}
