import { Client }                  from "@hiveio/dhive"
import type { AccountConfig }      from "../config/env"
import { BlockchainService }       from "./blockchain"
import settings                    from "../config/settings"
import {
  logHeader,
  logInfo,
  logWarning,
  logError,
  logSkip,
  logSummary,
  logProgress,
  type LoopStats,
} from "../../../shared/lib/logger"

// ── Helpers ───────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

const NATIVE_TOKENS = new Set(["HIVE", "HBD"])

/**
 * Fetch on-chain balance for a native Hive token (HIVE or HBD).
 * Re-uses the dhive Client passed in to stay on the beacon-selected node.
 */
async function getNativeBalance(
  client:   Client,
  username: string,
  symbol:   "HIVE" | "HBD",
): Promise<number> {
  const [account] = await (client as any).database.getAccounts([username])
  if (!account) throw new Error(`Account "@${username}" not found on chain`)
  const field  = symbol === "HBD" ? account.hbd_balance : account.balance
  const balStr = typeof field === "string" ? field : (field as any).toString()
  return parseFloat(balStr.split(" ")[0])
}

/**
 * Fetch Hive Engine token balance for a given symbol.
 */
async function getHiveEngineBalance(username: string, symbol: string): Promise<number> {
  const body = {
    jsonrpc: "2.0", method: "find", id: 1,
    params: {
      contract: "tokens",
      table:    "balances",
      query:    { account: username, symbol },
      limit:    1,
    },
  }
  const res = await fetch("https://api.hive-engine.com/rpc/contracts", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Hive Engine API error: ${res.status}`)
  const json = await res.json()
  const rows: { balance: string }[] = json?.result ?? []
  return rows.length ? parseFloat(rows[0].balance) || 0 : 0
}

// ── Service ───────────────────────────────────────────────────────────────────

type TransferResult = "transferred" | "skipped" | "error"

export class AccountAutomationService {
  private senders:        AccountConfig[]
  private recipient:      string
  private symbol:         string
  private blockchain:     BlockchainService
  /** Resolved send-max flag: env override wins, then falls back to settings. */
  private sendMaxBalance: boolean
  /** Resolved fixed amount: env override wins, then falls back to settings. */
  private customAmount:   number

  constructor(
    senders:        AccountConfig[],
    recipient:      string,
    tokenSymbol:    string,
    sendMaxBalance: boolean | null = null,
    customAmount:   number | null  = null,
  ) {
    this.senders        = senders
    this.recipient      = recipient
    this.symbol         = tokenSymbol.toUpperCase()
    this.blockchain     = new BlockchainService()
    this.sendMaxBalance = sendMaxBalance ?? settings.sendMaxBalance
    this.customAmount   = customAmount   ?? settings.customAmount
  }

  // ── Public entry points ────────────────────────────────────────────────────

  async runOnce(): Promise<LoopStats> {
    const stats: LoopStats = {
      claimed:     0,
      collected:   0,
      started:     0,
      transferred: 0,
      skipped:     0,
      errors:      0,
      total:       this.senders.length,
    }

    for (let i = 0; i < this.senders.length; i++) {
      logProgress(i + 1, this.senders.length, this.senders[i].username)
      const result = await this.processAccount(this.senders[i], 1, i + 1, this.senders.length)
      if      (result === "transferred") stats.transferred++
      else if (result === "skipped")     stats.skipped++
      else                               stats.errors++

      if (i < this.senders.length - 1) await delay(settings.delays.betweenAccounts)
    }

    return stats
  }

  async runAndExit(): Promise<void> {
    logHeader("TOKEN TRANSFER BOT  —  single pass")
    logInfo(`Token     : ${this.symbol}`)
    logInfo(`Recipient : @${this.recipient}`)
    logInfo(`Mode      : ${this.sendMaxBalance ? "max balance" : `fixed ${this.customAmount} ${this.symbol}`}`)
    logInfo(`Senders   : ${this.senders.length}`)
    await this.blockchain.initialize()
    const stats = await this.runOnce()
    logSummary("SUMMARY", {
      "Transferred": stats.transferred,
      "Skipped":     stats.skipped,
      "Errors":      stats.errors,
      "Total":       stats.total,
    })
  }

  async runContinuous(intervalMs: number): Promise<never> {
    logHeader("TOKEN TRANSFER BOT")
    logInfo(`Token     : ${this.symbol}`)
    logInfo(`Recipient : @${this.recipient}`)
    logInfo(`Mode      : ${this.sendMaxBalance ? "max balance" : `fixed ${this.customAmount} ${this.symbol}`}`)
    logInfo(`Senders   : ${this.senders.length}`)

    // Resolve best Hive node via PeakD beacon before the first loop.
    await this.blockchain.initialize()

    let loopCount = 0

    while (true) {
      loopCount++
      logHeader(`LOOP #${loopCount}  —  ${this.symbol} → @${this.recipient}`)

      const stats = await this.runOnce()
      logSummary("LOOP SUMMARY", {
        "Transferred": stats.transferred,
        "Skipped":     stats.skipped,
        "Errors":      stats.errors,
        "Total":       stats.total,
      })

      const wait = intervalMs || settings.delays.betweenLoops
      logInfo(`Waiting ${wait / 1_000}s before next loop...`)
      await delay(wait)
    }
  }

  // ── Per-account logic ──────────────────────────────────────────────────────

  private async processAccount(
    account: AccountConfig,
    attempt: number,
    index:   number,
    total:   number,
  ): Promise<TransferResult> {
    const { username, active_key } = account

    try {
      // ── Fetch balance ────────────────────────────────────────────────────
      const balance = NATIVE_TOKENS.has(this.symbol)
        ? await getNativeBalance(
            this.blockchain.getClient(),
            username,
            this.symbol as "HIVE" | "HBD",
          )
        : await getHiveEngineBalance(username, this.symbol)

      // ── Compute send amount ──────────────────────────────────────────────
      let sendAmount: number

      if (this.sendMaxBalance) {
        // Sweep mode: send everything minus the dust allowance.
        sendAmount = balance - settings.allowance
        if (sendAmount <= 0) {
          logSkip(
            `@${username}  balance: ${balance.toFixed(3)} ${this.symbol}` +
            (settings.allowance > 0 ? `  allowance: ${settings.allowance}` : "") +
            `  → nothing to send`,
          )
          return "skipped"
        }
      } else {
        // Fixed-amount mode: skip if account can't cover the requested amount.
        sendAmount = this.customAmount
        if (sendAmount <= 0) {
          logSkip(`@${username}  customAmount is 0 or unset — skipping`)
          return "skipped"
        }
        if (balance < sendAmount) {
          logSkip(
            `@${username}  balance: ${balance.toFixed(3)} ${this.symbol}` +
            `  < customAmount: ${sendAmount}  → skip`,
          )
          return "skipped"
        }
      }

      // ── Guard: self-transfer ─────────────────────────────────────────────
      if (username === this.recipient) {
        logSkip(`@${username} is the recipient — skipping self-transfer`)
        return "skipped"
      }

      const memo = settings.memo.replace("{username}", username)
      logInfo(
        `Sending ${sendAmount.toFixed(3)} ${this.symbol}` +
        `  @${username} → @${this.recipient}` +
        (this.sendMaxBalance ? "  [max balance]" : "  [fixed amount]"),
      )

      // ── Broadcast ────────────────────────────────────────────────────────
      if (NATIVE_TOKENS.has(this.symbol)) {
        await this.blockchain.transferNative(
          username,
          active_key,
          this.recipient,
          sendAmount,
          this.symbol as "HIVE" | "HBD",
          memo,
        )
      } else {
        await this.blockchain.transferHiveEngine(
          username,
          active_key,
          this.recipient,
          sendAmount,
          this.symbol,
          memo,
        )
      }

      await delay(settings.delays.betweenTransfers)
      return "transferred"

    } catch (err) {
      logError(
        `Error on attempt ${attempt} for @${username}: ` +
        `${err instanceof Error ? err.message : String(err)}`,
      )

      if (attempt < settings.retry.maxAttempts) {
        await delay(settings.delays.retryDelay * attempt)
        return this.processAccount(account, attempt + 1, index, total)
      }

      logError(`Max retries reached for @${username}`)
      return "error"
    }
  }

  async failoverNode(): Promise<void> {
    logWarning("Node failover requested — re-initializing blockchain service")
    await this.blockchain.initialize()
  }
}
