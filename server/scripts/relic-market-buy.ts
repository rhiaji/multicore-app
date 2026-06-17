/**
 * server/scripts/relic-market-buy.ts
 *
 * Buys listed relics from accounts stored in TERRACORE_ACCOUNTS_ENC.
 *
 * Flow (mirrors /api/scripts/relic-market-buy route):
 *   - All accounts in TERRACORE_ACCOUNTS_ENC are treated as tracked sellers.
 *   - The buyer is the account named by TERRACORE_ACCOUNT_MAIN; its entry is
 *     decrypted from TERRACORE_ACCOUNTS_ENC using the shared
 *     TERRACORE_ENCRYPTION_KEY (same key used for all accounts).
 *   - For each seller:
 *       1. Fetch listed relics via the Terracore API
 *       2. Apply optional rarity + max-price-per-unit filters
 *       3. Append matching listings to a rolling batch cache
 *       4. When the cache hits BATCH_SIZE (25), broadcast as one Hive tx
 *   - After all sellers are checked, broadcast any remaining listings (< 25).
 *
 * Required env vars:
 *   TERRACORE_ACCOUNTS_ENC   — encrypted accounts JSON (sellers + buyer entry)
 *   TERRACORE_ENCRYPTION_KEY — AES key for all accounts (sellers and buyer)
 *   TERRACORE_ACCOUNT_MAIN   — Hive username of the buyer account
 *
 * Optional env vars:
 *   RELIC_RARITY_FILTER      — comma-separated rarity types to buy
 *                               e.g. "epic_relics,legendary_relics"
 *   RELIC_MAX_PRICE_PER_UNIT — max HIVE per 1 unit; skip pricier listings
 *
 * Usage:
 *   pnpm run script:relic-market-buy
 */

import path   from "path"
import dotenv from "dotenv"

import { Client, PrivateKey }             from "@hiveio/dhive"
import { buildHiveClient }                from "../shared/config/node-selector"
import { loadAccounts }                from "../shared/config/env"
import { getPlayerRelics, type UserRelic } from "../shared/api/terracore"

// ── Load env ──────────────────────────────────────────────────────────────────

dotenv.config({ path: path.resolve(process.cwd(), ".env") })
dotenv.config()

// ── Constants ─────────────────────────────────────────────────────────────────

const BATCH_SIZE     = 25
const MARKET_ACCOUNT = "terracore.market"
const DELAY_MS       = 500     // ms between per-account fetches
const BATCH_DELAY_MS = 1_500   // ms between batch broadcasts

// ── Buyer account ─────────────────────────────────────────────────────────────
// The buyer is identified by TERRACORE_ACCOUNT_MAIN and resolved from the
// shared TERRACORE_ACCOUNTS_ENC pool (decrypted with TERRACORE_ENCRYPTION_KEY).

function loadBuyerAccount(): { username: string; active_key: string } {
  const buyerUsername = process.env.TERRACORE_ACCOUNT_MAIN
  if (!buyerUsername) throw new Error("TERRACORE_ACCOUNT_MAIN must be set in .env")

  const accounts = loadAccounts()
  const entry    = accounts.find((a) => a.username === buyerUsername)

  if (!entry) {
    throw new Error(
      `Buyer "@${buyerUsername}" not found in TERRACORE_ACCOUNTS_ENC. ` +
      `Available: ${accounts.map((a) => a.username).join(", ")}`,
    )
  }

  if (!entry.active_key) {
    throw new Error(`active_key missing in decrypted entry for @${buyerUsername}`)
  }

  return { username: entry.username, active_key: entry.active_key }
}

// ── Filters ───────────────────────────────────────────────────────────────────

function loadFilters(): { rarityFilter: string[] | null; maxPricePerUnit: number | null } {
  const rarityRaw = process.env.RELIC_RARITY_FILTER
  const priceRaw  = process.env.RELIC_MAX_PRICE_PER_UNIT

  const rarityFilter    = rarityRaw
    ? rarityRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : null
  const maxPricePerUnit = priceRaw ? parseFloat(priceRaw) : null

  return { rarityFilter, maxPricePerUnit }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PendingListing {
  seller:    string
  type:      string
  amount:    number
  unitPrice: number
  lineTotal: number
  rawPrice:  string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseHiveAmt(price: string): number {
  return parseFloat(price.split(" ")[0]) || 0
}

function generateActionId(): string {
  return `tm_purchase-${Math.random().toString(36).slice(2, 10)}`
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Batch broadcast ───────────────────────────────────────────────────────────

async function broadcastBatch(
  client:     Client,
  batch:      PendingListing[],
  buyer:      { username: string; active_key: string },
  batchIndex: number,
): Promise<{ ok: number; error: number; hive: number }> {
  const batchTotal = batch.reduce((s, l) => s + l.lineTotal, 0)

  console.log(`\n[relic-buy] ─── Batch #${batchIndex} ─────────────────────────────────`)
  console.log(`[relic-buy]   ${batch.length} listing(s) — ${batchTotal.toFixed(3)} HIVE total`)
  for (const l of batch) {
    console.log(
      `[relic-buy]   · @${l.seller}  ${l.type}  ×${l.amount}` +
      `  ${l.rawPrice}  = ${l.lineTotal.toFixed(3)} HIVE`,
    )
  }

  try {
    const key        = PrivateKey.fromString(buyer.active_key)
    const operations = batch.map((l) => {
      const memo = JSON.stringify({
        action:      generateActionId(),
        marketplace: MARKET_ACCOUNT,
        item_number: "0",
        type:        l.type,
        buyer:       buyer.username,
        seller:      l.seller,
        amount:      l.amount,
      })
      return [
        "transfer",
        {
          from:   buyer.username,
          to:     MARKET_ACCOUNT,
          amount: `${l.lineTotal.toFixed(3)} HIVE`,
          memo,
        },
      ] as [string, Record<string, unknown>]
    })

    const tx = await client.broadcast.sendOperations(operations as any, key)
    console.log(`[relic-buy]   TX: ${tx.id}  — ${batch.length} purchase(s) OK`)
    return { ok: batch.length, error: 0, hive: batchTotal }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[relic-buy]   ERROR: ${msg}`)
    return { ok: 0, error: batch.length, hive: 0 }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const buyer   = loadBuyerAccount()
  const sellers = loadAccounts().filter((a) => a.username !== buyer.username)
  const { rarityFilter, maxPricePerUnit } = loadFilters()
  const client  = await buildHiveClient()

  console.log(`[relic-buy] ══════════════════════════════════════════════════`)
  console.log(`[relic-buy]   Buyer   : @${buyer.username}`)
  console.log(`[relic-buy]   Sellers : ${sellers.length} account(s)`)
  if (rarityFilter)    console.log(`[relic-buy]   Rarity  : ${rarityFilter.join(", ")}`)
  if (maxPricePerUnit) console.log(`[relic-buy]   Max px  : ${maxPricePerUnit} HIVE/unit`)
  console.log(`[relic-buy]   Batch   : ${BATCH_SIZE} listings/tx`)
  console.log(`[relic-buy] ══════════════════════════════════════════════════\n`)

  const pending: PendingListing[] = []
  let batchIndex = 0
  let totalOk    = 0
  let totalError = 0
  let totalHive  = 0

  for (let i = 0; i < sellers.length; i++) {
    const seller = sellers[i]
    process.stdout.write(`[relic-buy]  ${i + 1}/${sellers.length}  @${seller.username}  — `)

    let relics: UserRelic[]
    try {
      relics = await getPlayerRelics(seller.username)
    } catch (err) {
      console.log(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
      await sleep(DELAY_MS)
      continue
    }

    // Extract listed relics and apply filters
    let listed = relics.filter((r) => r.market.listed && r.market.amount > 0)

    if (rarityFilter && rarityFilter.length > 0) {
      listed = listed.filter((r) => rarityFilter.includes(r.type))
    }
    if (maxPricePerUnit && maxPricePerUnit > 0) {
      listed = listed.filter((r) => parseHiveAmt(r.market.price) <= maxPricePerUnit)
    }

    if (listed.length === 0) {
      console.log(`no matching listings`)
      await sleep(DELAY_MS)
      continue
    }

    const newListings: PendingListing[] = listed.map((r) => ({
      seller:    r.market.seller || seller.username,
      type:      r.type,
      amount:    r.market.amount,
      unitPrice: parseHiveAmt(r.market.price),
      lineTotal: parseHiveAmt(r.market.price) * r.market.amount,
      rawPrice:  r.market.price,
    }))

    pending.push(...newListings)
    console.log(`${listed.length} listing(s) found — cache: ${pending.length}`)

    // Broadcast every time cache reaches BATCH_SIZE
    while (pending.length >= BATCH_SIZE) {
      const batch = pending.splice(0, BATCH_SIZE)
      batchIndex++
      const result = await broadcastBatch(client, batch, buyer, batchIndex)
      totalOk    += result.ok
      totalError += result.error
      totalHive  += result.hive
      await sleep(BATCH_DELAY_MS)
    }

    await sleep(DELAY_MS)
  }

  // Broadcast any remaining listings under the threshold
  if (pending.length > 0) {
    batchIndex++
    const batch  = pending.splice(0)
    const result = await broadcastBatch(client, batch, buyer, batchIndex)
    totalOk    += result.ok
    totalError += result.error
    totalHive  += result.hive
  }

  console.log(`\n[relic-buy] ─── Summary ──────────────────────────────────────`)
  console.log(`[relic-buy]   Batches : ${batchIndex}`)
  console.log(`[relic-buy]   Bought  : ${totalOk}`)
  if (totalError > 0)
    console.log(`[relic-buy]   Errors  : ${totalError}`)
  console.log(`[relic-buy]   Spent   : ${totalHive.toFixed(3)} HIVE`)
  console.log(`[relic-buy] ──────────────────────────────────────────────────`)
}

main().catch((err) => {
  console.error(`[relic-buy] Fatal: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
