import type { AccountWithKeys as AccountConfig } from "../../../shared/lib/encryption"
import settings from "../config/settings"
import {
  getPlayerData,
  getAttackTargets,
  getHiveEngineScrapBalance,
} from "../../../shared/api/terracore"
import { BlockchainService } from "./blockchain"
import {
  logInfo,
  logSuccess,
  logWarning,
  logError,
  logHeader,
  logSummary,
  logAttack,
  logClaim,
  logTransfer,
  logAccountProgress,
  type LoopStats,
} from "../../../shared/lib/logger"

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

type ClaimResult = "claimed" | "skipped" | "error"

/**
 * Handles per-account claim & attack automation with optional SCRAP transfer.
 */
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

  async runOnce(): Promise<LoopStats> {
    const stats: LoopStats = {
      claimed: 0, collected: 0, started: 0, transferred: 0,
      skipped: 0, errors: 0, total: this.accounts.length,
    }

    for (let i = 0; i < this.accounts.length; i++) {
      const account = this.accounts[i]
      const { result, transferred } = await this.processAccount(account, 1, i + 1, this.accounts.length)

      if      (result === "claimed") stats.claimed++
      else if (result === "skipped") stats.skipped++
      else                           stats.errors++

      if (transferred) stats.transferred++

      await delay(settings.delays.betweenAccounts)
    }

    return stats
  }

  async runContinuous(): Promise<never> {
    logHeader("TERRACORE CLAIM BOT")
    logInfo(`Starting continuous loop for ${this.accounts.length} account(s)`)

    // Resolve best Hive node via PeakD beacon before first loop
    await this.blockchain.initialize()

    let loopCount = 0

    while (true) {
      loopCount++
      logHeader(`LOOP #${loopCount}`)

      const stats = await this.runOnce()
      logSummary("LOOP SUMMARY", {
        "Claims":     stats.claimed,
        "Transferred": stats.transferred,
        "Skipped":    stats.skipped,
        "Errors":     stats.errors,
        "Total":      stats.total,
      })
      logInfo(`Waiting ${settings.delays.betweenLoops / 1_000}s before next loop...`)
      await delay(settings.delays.betweenLoops)
    }
  }

  // ── Per-account logic ──────────────────────────────────────────────────────

  private async processAccount(
    account: AccountConfig,
    attempt = 1,
    index   = 0,
    total   = 0,
  ): Promise<{ result: ClaimResult; transferred: boolean }> {
    const txHash = Math.random().toString(36).slice(2, 15) + Math.random().toString(36).slice(2, 15)

    try {
      // ── Step 1: Fetch player data ──────────────────────────────────────────
      // getPlayerData already converts minerate to per-hour (× 3 600).
      const player = await getPlayerData(account.username)

      // ── Step 2: Compute scrap threshold and log progress line ──────────────
      const requiredScrap = player.minerate * settings.scrapRequirement.multiplier

      if (index > 0 && total > 0) {
        logAccountProgress(index, total, player.username, player.minerate, player.claims, player.scrap, requiredScrap)
      }

      // ── Step 3: Scrap requirement check ────────────────────────────────────
      const hasEnoughScrap =
        settings.manualClaim.enabled ||
        (settings.scrapRequirement.enabled
          ? player.scrap > 0 && player.scrap >= requiredScrap
          : player.scrap > 0)

      if (!hasEnoughScrap) {
        logWarning(
          `Skipping claim for ${account.username} — scrap: ${player.scrap.toFixed(2)}, need: ${requiredScrap.toFixed(2)} (${settings.scrapRequirement.multiplier}× minerate)`,
        )
        return { result: "skipped", transferred: false }
      }

      if (player.claims === 0) {
        logWarning(`No claims available for ${account.username}`)
        return { result: "skipped", transferred: false }
      }

      // ── Step 4: Attack ─────────────────────────────────────────────────────
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
          txHash,
        )
      }

      // ── Step 5: Claim ──────────────────────────────────────────────────────
      logClaim(`Claiming for ${account.username}...`)
      await this.blockchain.claim(account.username, account.posting_key, txHash)
      logSuccess(`${account.username} — claimed! (+${player.minerate.toFixed(2)} SCRAP/hr)`)

      // ── Step 6: Transfer SCRAP to main account ─────────────────────────────
      let transferred = false

      if (!settings.transfer.enabled) {
        // transfer disabled — nothing to do
      } else if (!this.mainAccount) {
        logWarning(`[transfer] TERRACORE_ACCOUNT_MAIN is not set — skipping transfer for ${account.username}`)
      } else if (this.mainAccount === account.username) {
        logInfo(`[transfer] ${account.username} is the main account — skipping self-transfer`)
      } else {
        try {
          // Wait for the claim mint to propagate on Hive Engine
          const propagationDelay = settings.delays.claimPropagation
          logInfo(`Waiting ${propagationDelay / 1_000}s for claim to propagate on Hive Engine...`)
          await delay(propagationDelay)

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
            transferred = true
          } else {
            logWarning(
              `Transfer skipped for ${account.username} — balance ${heBalance.toFixed(3)} SCRAP` +
              ` is within allowance (${settings.transfer.scrapAllowance})`,
            )
          }
        } catch (err) {
          logError(`Transfer failed for ${account.username}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      return { result: "claimed", transferred }

    } catch (err) {
      logError(
        `Error on attempt ${attempt} for ${account.username}: ` +
        `${err instanceof Error ? err.message : String(err)}`,
      )

      if (attempt < 3) {
        await delay(settings.delays.retryDelay * attempt)
        return this.processAccount(account, attempt + 1, index, total)
      }

      logError(`Max retries reached for ${account.username}`)
      return { result: "error", transferred: false }
    }
  }
}
