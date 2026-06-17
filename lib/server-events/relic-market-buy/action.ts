/**
 * lib/server-events/relic-market-buy/action.ts
 *
 * Server Action (async generator) for the relic-market-buy script.
 * Yields event objects directly — no push callback, no SSE encoding.
 * The calling page iterates with: for await (const evt of runRelicMarketBuy(params)) { ... }
 */

import { Client, PrivateKey }  from "@hiveio/dhive"
import { makeClient }          from "@/lib/shared/hive-client"
import { fetchPlayerRelics }   from "@/lib/shared/api/terracore"
import type { UserRelic, RelicType } from "@/lib/shared/api/terracore"
import type { AccountWithKeys } from "@/lib/encryption"
import type { RelicMarketBuyEvent } from "@/lib/shared/events/types"

// ── Types ─────────────────────────────────────────────────────────────────────
// AccountWithKeys → imported from @/lib/encryption
// RelicType       → imported from @/lib/shared/api/terracore (canonical: lib/types.ts)

export interface PendingListing {
  seller:    string
  type:      RelicType
  amount:    number
  unitPrice: number
  lineTotal: number
  rawPrice:  string
}

export interface RunRelicMarketBuyParams {
  accounts:         AccountWithKeys[]
  buyerUsername:    string
  rarityFilter?:    string[]
  maxPricePerUnit?: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BATCH_SIZE     = 25
const MARKET_ACCOUNT = "terracore.market"

// ── Hive client ───────────────────────────────────────────────────────────────
// makeClient() imported from lib/shared/hive-client.ts

// ── Terracore API ─────────────────────────────────────────────────────────────
// fetchPlayerRelics() imported from lib/shared/api/terracore.ts

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseHiveAmt(price: string): number {
  return parseFloat(price.split(" ")[0]) || 0
}

function generateActionId(): string {
  return `tm_purchase-${Math.random().toString(36).slice(2, 10)}`
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"))
    const id = setTimeout(resolve, ms)
    signal?.addEventListener("abort", () => { clearTimeout(id); reject(new DOMException("Aborted", "AbortError")) }, { once: true })
  })
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
}

// ── Core action ───────────────────────────────────────────────────────────────

export async function* runRelicMarketBuy(
  params: RunRelicMarketBuyParams,
  signal?: AbortSignal,
): AsyncGenerator<RelicMarketBuyEvent> {
  const {
    accounts,
    buyerUsername,
    rarityFilter,
    maxPricePerUnit,
  } = params

  const buyer = accounts.find((a) => a.username === buyerUsername)
  if (!buyer) {
    yield { type: "error", message: `Buyer account "@${buyerUsername}" not found in decrypted config.` }
    yield { type: "done",  success: false }
    return
  }
  const buyerActiveKey = buyer.active_key

  const sellerUsernames = accounts.filter((a) => a.username !== buyerUsername).map((a) => a.username)

  const hiveClient = makeClient()

  try {
    yield {
      type:    "step",
      step:    "fetch",
      status:  "running",
      message: `Checking ${sellerUsernames.length} account(s) for listed relics...`,
    }

    let batchIndex    = 0
    let totalBuyOk    = 0
    let totalBuyError = 0
    let grandTotal    = 0

    const pending: PendingListing[] = []

    const broadcastBatch = async function* (batch: PendingListing[]): AsyncGenerator<RelicMarketBuyEvent> {
      assertNotAborted(signal)
      batchIndex++
      const batchTotal = batch.reduce((s, l) => s + l.lineTotal, 0)
      grandTotal += batchTotal

      yield {
        type:       "buy-plan",
        batchIndex,
        listings:   batch.map((l) => ({
          seller:    l.seller,
          type:      l.type,
          amount:    l.amount,
          unitPrice: l.rawPrice,
          lineTotal: l.lineTotal.toFixed(3),
        })),
        totalHive: batchTotal.toFixed(3),
      }

      yield {
        type:    "step",
        step:    "buy",
        status:  "running",
        message: `Batch #${batchIndex}: broadcasting ${batch.length} purchase(s)...`,
      }

      try {
        const key        = PrivateKey.fromString(buyerActiveKey)
        const operations = batch.map((l) => {
          const memo = JSON.stringify({
            action:      generateActionId(),
            marketplace: MARKET_ACCOUNT,
            item_number: "0",
            type:        l.type,
            buyer:       buyerUsername,
            seller:      l.seller,
            amount:      l.amount,
          })
          return [
            "transfer",
            {
              from:   buyerUsername,
              to:     MARKET_ACCOUNT,
              amount: `${l.lineTotal.toFixed(3)} HIVE`,
              memo,
            },
          ] as [string, Record<string, unknown>]
        })

        assertNotAborted(signal)
        const tx = await hiveClient.broadcast.sendOperations(operations as any, key)

        for (const l of batch) {
          yield {
            type:       "buy-action",
            batchIndex,
            seller:     l.seller,
            type_relic: l.type,
            amount:     l.amount,
            price:      l.rawPrice,
            status:     "ok",
            txId:       tx.id,
            message:    `Bought ${l.amount}x ${l.type} from @${l.seller} — TX: ${tx.id.slice(0, 10)}...`,
          }
        }

        totalBuyOk += batch.length
        yield {
          type:    "step",
          step:    "buy",
          status:  "done",
          message: `Batch #${batchIndex}: ${batch.length} purchase(s) OK — TX: ${tx.id.slice(0, 10)}...`,
        }
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") throw err
        const errMsg = err instanceof Error ? err.message : String(err)
        for (const l of batch) {
          yield {
            type:       "buy-action",
            batchIndex,
            seller:     l.seller,
            type_relic: l.type,
            amount:     l.amount,
            price:      l.rawPrice,
            status:     "error",
            message:    errMsg,
          }
        }
        totalBuyError += batch.length
        yield {
          type:    "step",
          step:    "buy",
          status:  "error",
          message: `Batch #${batchIndex} failed: ${errMsg}`,
        }
      }

      await sleep(1_500, signal)
    }

    for (const username of sellerUsernames) {
      assertNotAborted(signal)

      let relics: UserRelic[]
      try {
        assertNotAborted(signal)
        relics = await fetchPlayerRelics(username)
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") throw err
        yield {
          type:         "account-checked",
          username,
          listed:       0,
          added:        0,
          pendingTotal: 0,
          status:       "error",
          message:      err instanceof Error ? err.message : "Fetch failed",
        }
        await sleep(500, signal)
        continue
      }

      let listedRelics = relics.filter((r) => r.market.listed && r.market.amount > 0)

      if (rarityFilter && rarityFilter.length > 0) {
        listedRelics = listedRelics.filter((r) => rarityFilter.includes(r.type))
      }

      if (maxPricePerUnit && maxPricePerUnit > 0) {
        listedRelics = listedRelics.filter((r) => parseHiveAmt(r.market.price) <= maxPricePerUnit)
      }

      const newListings: PendingListing[] = listedRelics.map((r) => ({
        seller:    r.market.seller || username,
        type:      r.type,
        amount:    r.market.amount,
        unitPrice: parseHiveAmt(r.market.price),
        lineTotal: parseHiveAmt(r.market.price) * r.market.amount,
        rawPrice:  r.market.price,
      }))

      pending.push(...newListings)

      yield {
        type:         "account-checked",
        username,
        listed:       listedRelics.length,
        added:        newListings.length,
        pendingTotal: pending.length,
        status:       "ok",
      }

      while (pending.length >= BATCH_SIZE) {
        const batch = pending.splice(0, BATCH_SIZE)
        yield* broadcastBatch(batch)
      }

      await sleep(500, signal)
    }

    yield {
      type:    "step",
      step:    "fetch",
      status:  "done",
      message: `Checked ${sellerUsernames.length} account(s). ${pending.length} listing(s) remaining in cache.`,
    }

    if (pending.length > 0) {
      yield* broadcastBatch(pending.splice(0))
    }

    if (totalBuyOk === 0 && totalBuyError === 0) {
      yield { type: "step", step: "buy", status: "done", message: "No matching listings found — nothing to buy." }
    }

    yield {
      type:    "done",
      success: totalBuyError === 0,
      summary: {
        buyer:     buyerUsername,
        batches:   batchIndex,
        listings:  totalBuyOk + totalBuyError,
        totalHive: grandTotal.toFixed(3),
        buyOk:     totalBuyOk,
        buyError:  totalBuyError,
      },
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
