/**
 * lib/server-events/relic-market-sell/action.ts
 *
 * Server Action (async generator) for the relic-market-sell script.
 * Yields event objects directly — no push callback, no SSE encoding.
 * The calling page iterates with: for await (const evt of runRelicMarketSell(params)) { ... }
 *
 * The main account (TERRACORE_ACCOUNT_MAIN) must be excluded by the caller
 * before passing the sellers array — this module does no filtering of its own.
 */

import { PrivateKey }                       from "@hiveio/dhive"
import { makeClient }                       from "@/lib/shared/hive-client"
import { fetchPlayerRelics }                from "@/lib/shared/api/terracore"
import type { UserRelic, RelicType }        from "@/lib/shared/api/terracore"
import type { AccountWithKeys }             from "@/lib/encryption"
import type { RelicMarketSellEvent }        from "@/lib/shared/events/types"

// ── Types ─────────────────────────────────────────────────────────────────────
// AccountWithKeys  → imported from @/lib/encryption
// RelicType        → imported from @/lib/shared/api/terracore (canonical: lib/types.ts)

export interface FixedPrices {
  common_relics:    number
  uncommon_relics:  number
  rare_relics:      number
  epic_relics:      number
  legendary_relics: number
}

export interface RunRelicMarketSellParams {
  sellers:     AccountWithKeys[]
  pricingMode: "auto" | "fixed"
  autoFloor:   number
  fixedPrices: FixedPrices
}
// ── Hive client ───────────────────────────────────────────────────────────────
// makeClient() imported from lib/shared/hive-client.ts

// ── Terracore API ─────────────────────────────────────────────────────────────
// fetchPlayerRelics() imported from lib/shared/api/terracore.ts

// ── Price helpers ─────────────────────────────────────────────────────────────

function autoPrice(amount: number, floor = 0.1): string {
  if (amount <= 0) return "0.001"
  const rounded = Math.ceil((floor / amount) * 1000) / 1000
  return rounded.toFixed(3)
}

function fixedPrice(amount: number, pricePerUnit: number): string {
  if (amount <= 0 || pricePerUnit <= 0) return "0.001"
  return Math.max(pricePerUnit, 0.001).toFixed(3)
}

function resolvePrice(
  type:        RelicType,
  amount:      number,
  mode:        "auto" | "fixed",
  autoFloor:   number,
  fixedPrices: FixedPrices,
): string {
  if (mode === "fixed") {
    return fixedPrice(amount, fixedPrices[type] ?? 0.001)
  }
  return autoPrice(amount, autoFloor)
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

export async function* runRelicMarketSell(
  params: RunRelicMarketSellParams,
  signal?: AbortSignal,
): AsyncGenerator<RelicMarketSellEvent> {
  const { sellers, pricingMode, autoFloor, fixedPrices } = params

  const autoFloorNum = Math.max(0.001, autoFloor)
  const hiveClient   = makeClient()

  try {
    yield {
      type:    "step",
      step:    "fetch",
      status:  "running",
      message: `Processing ${sellers.length} account(s)...`,
    }

    let sellOk    = 0
    let sellSkip  = 0
    let sellError = 0
    const listedByRarity: Record<string, number> = {}

    for (const seller of sellers) {
      assertNotAborted(signal)

      let relics: UserRelic[]
      try {
        assertNotAborted(signal)
        relics = await fetchPlayerRelics(seller.username)
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") throw err
        yield {
          type:     "account-error",
          username: seller.username,
          message:  err instanceof Error ? err.message : "Failed to fetch relics",
        }
        sellError++
        await sleep(1_000, signal)
        continue
      }

      const alreadyListed = relics.filter((r) => r.amount > 0 && r.market.listed)
      const toList        = relics.filter((r) => r.amount > 0 && !r.market.listed)

      yield {
        type:     "account",
        username: seller.username,
        unlisted: toList.length,
        listed:   alreadyListed.length,
      }

      if (toList.length === 0 && alreadyListed.length === 0) {
        yield {
          type:     "sell-action",
          username: seller.username,
          action:   "skip",
          count:    0,
          status:   "skip",
          message:  "No relics — skipped.",
        }
        sellSkip++
      } else if (toList.length === 0) {
        yield {
          type:     "sell-action",
          username: seller.username,
          action:   "already-listed",
          count:    alreadyListed.length,
          status:   "skip",
          message:  `${alreadyListed.length} type(s) already listed — skipped broadcast.`,
          byRarity: alreadyListed.reduce((acc, r) => {
            acc[r.type] = (acc[r.type] ?? 0) + r.amount
            return acc
          }, {} as Record<string, number>),
        }
        sellSkip++
      } else {
        try {
          const operations: [string, Record<string, unknown>][] = toList.map((r) => {
            const price = resolvePrice(r.type, r.amount, pricingMode, autoFloorNum, fixedPrices)
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
            ]
          })

          const key = PrivateKey.fromString(seller.active_key)
          assertNotAborted(signal)
          const tx  = await hiveClient.broadcast.sendOperations(operations as any, key)

          const byRarity: Record<string, number> = {}
          for (const r of toList) {
            byRarity[r.type]       = (byRarity[r.type]       ?? 0) + r.amount
            listedByRarity[r.type] = (listedByRarity[r.type] ?? 0) + r.amount
          }

          yield {
            type:     "sell-action",
            username: seller.username,
            action:   "list",
            count:    toList.length,
            status:   "ok",
            txId:     tx.id,
            byRarity,
            message:  `Listed ${toList.length} type(s) — TX: ${tx.id.slice(0, 10)}...`,
          }
          sellOk++
        } catch (err) {
          if ((err as DOMException)?.name === "AbortError") throw err
          const errMsg = err instanceof Error ? err.message : String(err)
          yield {
            type:     "sell-action",
            username: seller.username,
            action:   "list",
            count:    toList.length,
            status:   "error",
            message:  errMsg,
          }
          sellError++
        }
      }

      await sleep(1_000, signal)
    }

    yield { type: "step", step: "fetch", status: "done",  message: `Processed ${sellers.length} account(s).` }
    yield { type: "step", step: "sell",  status: "done",  message: `${sellOk} listed, ${sellSkip} skipped, ${sellError} errors.` }

    yield {
      type:    "done",
      success: true,
      summary: {
        sellers:      sellers.length,
        sellOk,
        sellSkip,
        sellError,
        listedByRarity,
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
