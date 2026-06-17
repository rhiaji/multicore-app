/**
 * server/automation/auto-relic-market/service/relic-market-service.ts
 *
 * Flow per loop:
 *
 *   SELL PHASE  — iterate every seller account:
 *     1. Fetch relics from Terracore API.
 *     2. Broadcast tm_create for every unlisted relic type (skip if all listed).
 *     3. Record the number of listing types that were just submitted into a
 *        listingCache: Map<username, listingCount>.
 *
 *   TRIGGER CHECK — after each account is processed:
 *     • If the total cached listing count >= batchTrigger (default 25):
 *         → wait triggerDelay ms (default 5 000)
 *         → BUY PHASE for all accounts in the cache
 *         → clear the cache
 *
 *   FLUSH PHASE — after all sellers are done:
 *     • If the cache still has any entries (< batchTrigger remaining):
 *         → wait triggerDelay ms
 *         → BUY PHASE for those remaining accounts
 *
 *   BUY PHASE (shared helper):
 *     For each account in the cache:
 *       1. Fetch live relics from Terracore API.
 *       2. Confirm which are actually listed (market.listed === true).
 *       3. Apply rarity / price filters.
 *       4. Broadcast transfer ops to "terracore.market" as the main buyer.
 */

import { PrivateKey }                         from "@hiveio/dhive"
import { NodeSelector, HIVE_NODES }           from "../../../shared/config/node-selector"
import { Client }                             from "@hiveio/dhive"
import { getPlayerRelics, type UserRelic }    from "../../../shared/api/terracore"
import settings                               from "../config/settings"
import type { AccountConfig }                 from "../config/env"
import {
  logHeader,
  logInfo,
  logSuccess,
  logWarning,
  logError,
  logSummary,
} from "../../../shared/lib/logger"

// ── Types ─────────────────────────────────────────────────────────────────────

interface PendingListing {
  seller:    string
  type:      string
  amount:    number
  lineTotal: number
  rawPrice:  string
}

export interface CycleStats {
  listed:        number   // seller accounts that had new listings broadcast
  alreadyListed: number   // accounts where all relics were already listed
  skipped:       number   // accounts with no relics at all
  validated:     number   // listing types confirmed live on market
  batchesBought: number
  purchaseOk:    number
  purchaseErr:   number
  hiveSpent:     number
  errors:        number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function parseHiveAmt(price: string): number {
  return parseFloat(price.split(" ")[0]) || 0
}

function generateActionId(): string {
  return `tm_purchase-${Math.random().toString(36).slice(2, 10)}`
}

type RelicTier =
  | "common_relics"
  | "uncommon_relics"
  | "rare_relics"
  | "epic_relics"
  | "legendary_relics"

function resolvePrice(type: RelicTier, amount: number): string {
  if (settings.sell.pricingMode === "fixed") {
    const perUnit = settings.sell.fixedPrices[type] ?? 0.001
    return Math.max(perUnit, 0.001).toFixed(3)
  }
  if (amount <= 0) return "0.001"
  return (Math.ceil((settings.sell.autoFloor / amount) * 1000) / 1000).toFixed(3)
}

// ── Service class ─────────────────────────────────────────────────────────────

export class RelicMarketService {
  private sellers:      AccountConfig[]
  private buyer:        AccountConfig
  private client:       Client
  private nodeSelector: NodeSelector

  constructor(sellers: AccountConfig[], buyer: AccountConfig) {
    this.sellers      = sellers
    this.buyer        = buyer
    this.nodeSelector = new NodeSelector()
    this.client       = new Client(HIVE_NODES, {
      timeout:           10_000,
      failoverThreshold: 0,
      consoleOnFailover: true,
    })
  }

  // ── Initialise node selector ───────────────────────────────────────────────

  async initialize(): Promise<void> {
    try {
      await this.nodeSelector.initialize()
      const live   = this.nodeSelector.getAllEndpoints()
      const merged = [...live, ...HIVE_NODES.filter((n) => !live.includes(n))]
      this.client  = new Client(merged, { timeout: 10_000, failoverThreshold: 0, consoleOnFailover: true })
      logInfo(`[relic-market] Node: ${this.nodeSelector.getCurrentEndpoint()}`)
    } catch {
      logWarning("[relic-market] Beacon init failed — using static nodes")
    }
  }

  // ── Continuous loop ────────────────────────────────────────────────────────

  async runContinuous(intervalMs: number): Promise<never> {
    logHeader("RELIC MARKET BOT")
    logInfo(`Buyer        : @${this.buyer.username}`)
    logInfo(`Sellers      : ${this.sellers.length} account(s)`)
    logInfo(`Batch trigger: ${settings.buy.batchTrigger} listing(s)`)
    logInfo(`Trigger delay: ${settings.buy.triggerDelay / 1_000}s`)
    if (settings.buy.rarityFilter?.length)
      logInfo(`Rarity filter: ${settings.buy.rarityFilter.join(", ")}`)
    if (settings.buy.maxPricePerUnit)
      logInfo(`Max price    : ${settings.buy.maxPricePerUnit} HIVE/unit`)

    await this.initialize()

    let loopCount = 0

    while (true) {
      loopCount++
      logHeader(`RELIC MARKET — LOOP #${loopCount}`)

      const stats = await this.runOnce()

      logSummary("LOOP SUMMARY", {
        "Listed accounts":    stats.listed,
        "Already listed":     stats.alreadyListed,
        "No relics (skip)":   stats.skipped,
        "Confirmed listings": stats.validated,
        "Buy batches":        stats.batchesBought,
        "Purchases OK":       stats.purchaseOk,
        "Purchase errors":    stats.purchaseErr,
        "HIVE spent":         parseFloat(stats.hiveSpent.toFixed(3)),
        "Errors":             stats.errors,
      })

      const wait = intervalMs || settings.delays.betweenLoops
      logInfo(`Waiting ${wait / 1_000}s before next loop...`)
      await delay(wait)
    }
  }

  // ── Single cycle ───────────────────────────────────────────────────────────

  async runOnce(): Promise<CycleStats> {
    const stats: CycleStats = {
      listed: 0, alreadyListed: 0, skipped: 0,
      validated: 0, batchesBought: 0,
      purchaseOk: 0, purchaseErr: 0, hiveSpent: 0, errors: 0,
    }

    /**
     * Listing cache — accumulates across all seller accounts.
     *
     * Key  : seller username
     * Value: number of relic types just listed (or already live) for that account.
     *
     * When the total count across all entries reaches batchTrigger, the buy
     * phase is triggered immediately for every entry in the cache, then the
     * cache is cleared.  Remaining entries at end-of-loop are flushed once.
     */
    const listingCache = new Map<string, number>()

    const triggerAndFlush = async (label: string) => {
      const totalCached = [...listingCache.values()].reduce((s, n) => s + n, 0)
      logInfo(`\n  [${label}] Cache at ${totalCached} listing(s) — waiting ${settings.buy.triggerDelay / 1_000}s then buying...`)
      await delay(settings.buy.triggerDelay)

      const result = await this.executeBuyPhase(listingCache)
      stats.validated     += result.validated
      stats.batchesBought += result.batchesBought
      stats.purchaseOk    += result.purchaseOk
      stats.purchaseErr   += result.purchaseErr
      stats.hiveSpent     += result.hiveSpent

      listingCache.clear()
    }

    // ── SELL PHASE ────────────────────────────────────────────────────────────

    for (let i = 0; i < this.sellers.length; i++) {
      const seller = this.sellers[i]
      logInfo(`[${i + 1}/${this.sellers.length}] @${seller.username}`)

      try {
        const relics  = await getPlayerRelics(seller.username)
        const toList  = relics.filter((r) => r.amount > 0 && !r.market.listed)
        const already = relics.filter((r) => r.amount > 0 &&  r.market.listed)

        if (toList.length === 0 && already.length === 0) {
          logInfo(`  SKIP — no relics`)
          stats.skipped++
          await delay(settings.delays.betweenAccounts)
          continue
        }

        if (toList.length === 0) {
          // All relics already listed — count them into the cache so the buy
          // phase includes this account when the trigger fires.
          logInfo(`  Already listed: ${already.length} type(s)`)
          stats.alreadyListed++
          listingCache.set(seller.username, already.length)
        } else {
          // Broadcast the sell then cache the count.
          await this.broadcastSell(seller, toList)
          stats.listed++
          logInfo(`  Cached ${toList.length} listing(s) from @${seller.username}`)
          listingCache.set(
            seller.username,
            toList.length + already.length,   // include any pre-existing listings too
          )
        }

      } catch (err) {
        logError(`@${seller.username}: ${err instanceof Error ? err.message : String(err)}`)
        stats.errors++
      }

      // ── Trigger check ──────────────────────────────────────────────────────
      const totalCached = [...listingCache.values()].reduce((s, n) => s + n, 0)
      if (totalCached >= settings.buy.batchTrigger) {
        await triggerAndFlush(`trigger at ${totalCached}`)
      }

      await delay(settings.delays.betweenAccounts)
    }

    // ── FLUSH PHASE — remaining entries that never hit the trigger ────────────
    if (listingCache.size > 0) {
      const remaining = [...listingCache.values()].reduce((s, n) => s + n, 0)
      logInfo(`\n  Flushing ${remaining} remaining cached listing(s) from ${listingCache.size} account(s)...`)
      await triggerAndFlush("end-of-loop flush")
    }

    return stats
  }

  // ── Buy phase — fetch live listings for every cached account then buy ───────

  private async executeBuyPhase(
    cache: Map<string, number>,
  ): Promise<Pick<CycleStats, "validated" | "batchesBought" | "purchaseOk" | "purchaseErr" | "hiveSpent">> {
    const result = { validated: 0, batchesBought: 0, purchaseOk: 0, purchaseErr: 0, hiveSpent: 0 }

    const allListings: PendingListing[] = []

    logInfo(`  Fetching live market data for ${cache.size} account(s)...`)

    for (const [username] of cache) {
      try {
        const fresh     = await getPlayerRelics(username)
        const nowListed = fresh.filter((r) => r.amount > 0 && r.market.listed)
        const filtered  = this.applyBuyFilters(this.mapToListings(nowListed, username))

        if (filtered.length === 0) {
          logWarning(`  @${username} — 0 confirmed listing(s) on market (API may still be indexing)`)
          continue
        }

        logInfo(`  @${username} — ${filtered.length} listing(s) confirmed live`)
        allListings.push(...filtered)
        result.validated += filtered.length
      } catch (err) {
        logError(`  fetch @${username}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    if (allListings.length === 0) {
      logWarning("  No confirmed listings to buy — skipping buy broadcast.")
      return result
    }

    // Chunk into batches of batchSize and broadcast each
    const batchSize = settings.buy.batchSize
    for (let offset = 0; offset < allListings.length; offset += batchSize) {
      const batch = allListings.slice(offset, offset + batchSize)
      result.batchesBought++
      const bought = await this.broadcastBuy(batch, result.batchesBought)
      result.purchaseOk  += bought.ok
      result.purchaseErr += bought.err
      result.hiveSpent   += bought.hive
      if (offset + batchSize < allListings.length) {
        await delay(settings.delays.betweenBatches)
      }
    }

    return result
  }

  // ── Sell broadcast ─────────────────────────────────────────────────────────

  private async broadcastSell(
    seller:  AccountConfig,
    toList:  UserRelic[],
    attempt = 1,
  ): Promise<void> {
    const ops = toList.map((r) => {
      const price = resolvePrice(r.type as RelicTier, r.amount)
      return [
        "custom_json",
        {
          required_auths:         [seller.username],
          required_posting_auths: [],
          id:                     "tm_create",
          json: JSON.stringify({
            type:   r.type,
            amount: r.amount,
            price:  `${price} HIVE`,
          }),
        },
      ] as [string, Record<string, unknown>]
    })

    try {
      const key = PrivateKey.fromString(seller.active_key)
      const tx  = await this.client.broadcast.sendOperations(ops as any, key)
      logSuccess(`  LISTED ${toList.length} type(s) — TX: ${tx.id.slice(0, 10)}...`)
    } catch (err) {
      if (attempt < settings.retry.maxAttempts) {
        await delay(settings.delays.retryDelay * attempt)
        return this.broadcastSell(seller, toList, attempt + 1)
      }
      throw err
    }
  }

  // ── Map UserRelic[] → PendingListing[] ────────────────────────────────────

  private mapToListings(relics: UserRelic[], username: string): PendingListing[] {
    return relics
      .filter((r) => r.market.listed && r.market.amount > 0)
      .map((r) => ({
        seller:    r.market.seller || username,
        type:      r.type,
        amount:    r.market.amount,
        lineTotal: parseHiveAmt(r.market.price) * r.market.amount,
        rawPrice:  r.market.price,
      }))
  }

  // ── Apply buy filters (rarity + price) ────────────────────────────────────

  private applyBuyFilters(listings: PendingListing[]): PendingListing[] {
    let result = listings

    const { rarityFilter, maxPricePerUnit } = settings.buy

    if (rarityFilter && rarityFilter.length > 0) {
      result = result.filter((l) => rarityFilter!.includes(l.type))
    }

    if (maxPricePerUnit && maxPricePerUnit > 0) {
      result = result.filter((l) => parseHiveAmt(l.rawPrice) <= maxPricePerUnit)
    }

    return result
  }

  // ── Buy broadcast ──────────────────────────────────────────────────────────

  private async broadcastBuy(
    batch:      PendingListing[],
    batchIndex: number,
  ): Promise<{ ok: number; err: number; hive: number }> {
    const batchTotal = batch.reduce((s, l) => s + l.lineTotal, 0)

    logInfo(`\n  Batch #${batchIndex} — ${batch.length} purchase(s) — ${batchTotal.toFixed(3)} HIVE total`)
    for (const l of batch) {
      logInfo(`    · @${l.seller}  ${l.type}  ×${l.amount}  ${l.rawPrice}  = ${l.lineTotal.toFixed(3)} HIVE`)
    }

    try {
      const key = PrivateKey.fromString(this.buyer.active_key)
      const ops = batch.map((l) => {
        const memo = JSON.stringify({
          action:      generateActionId(),
          marketplace: "terracore.market",
          item_number: "0",
          type:        l.type,
          buyer:       this.buyer.username,
          seller:      l.seller,
          amount:      l.amount,
        })
        return [
          "transfer",
          {
            from:   this.buyer.username,
            to:     "terracore.market",
            amount: `${l.lineTotal.toFixed(3)} HIVE`,
            memo,
          },
        ] as [string, Record<string, unknown>]
      })

      const tx = await this.client.broadcast.sendOperations(ops as any, key)
      logSuccess(`  Batch #${batchIndex} OK — TX: ${tx.id.slice(0, 10)}...  (${batch.length} purchases, ${batchTotal.toFixed(3)} HIVE)`)
      return { ok: batch.length, err: 0, hive: batchTotal }
    } catch (err) {
      logError(`  Batch #${batchIndex} FAILED: ${err instanceof Error ? err.message : String(err)}`)
      return { ok: 0, err: batch.length, hive: 0 }
    }
  }
}
