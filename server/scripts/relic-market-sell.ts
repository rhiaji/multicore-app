/**
 * server/scripts/relic-market-sell.ts
 *
 * Lists every unlisted relic from all sub-accounts onto the Terracore marketplace.
 * The main account (TERRACORE_ACCOUNT_MAIN) is excluded — it acts as the buyer,
 * not a seller.
 *
 * Auto-price rule: unit price = ceil(0.1 / amount * 1000) / 1000
 *   so that qty x price >= 0.1 HIVE (marketplace minimum).
 *
 * Usage:
 *   pnpm run script:relic-market-sell
 */

import { Client, PrivateKey } from "@hiveio/dhive"
import { loadAccounts }       from "../shared/config/env"
import { buildHiveClient }    from "../shared/config/node-selector"
import { getPlayerRelics, type UserRelic } from "../shared/api/terracore"

// ── Helpers ───────────────────────────────────────────────────────────────────

function autoPrice(amount: number): string {
  if (amount <= 0) return "0.001"
  return (Math.ceil((0.1 / amount) * 1000) / 1000).toFixed(3)
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Per-account sell ──────────────────────────────────────────────────────────

async function sellRelicsForAccount(
  client:  Client,
  account: { username: string; active_key: string },
): Promise<"listed" | "already" | "skip"> {
  const relics  = await getPlayerRelics(account.username)
  const toList  = relics.filter((r) => r.amount > 0 && !r.market.listed)
  const already = relics.filter((r) => r.amount > 0 &&  r.market.listed)

  if (toList.length === 0 && already.length === 0) {
    console.log(`[relic-sell]  SKIP  @${account.username}  no relics`)
    return "skip"
  }

  if (toList.length === 0) {
    console.log(`[relic-sell]  SKIP  @${account.username}  all ${already.length} type(s) already listed`)
    return "already"
  }

  const ops: [string, Record<string, unknown>][] = toList.map((r: UserRelic) => [
    "custom_json",
    {
      required_auths:         [account.username],
      required_posting_auths: [],
      id:                     "tm_create",
      json: JSON.stringify({
        type:   r.type,
        amount: r.amount,
        price:  `${autoPrice(r.amount)} HIVE`,
      }),
    },
  ])

  const key = PrivateKey.fromString(account.active_key)
  const tx  = await client.broadcast.sendOperations(ops as any, key)

  console.log(
    `[relic-sell]  LISTED  @${account.username}  ${toList.length} type(s)` +
    (already.length > 0 ? `  (${already.length} already listed)` : "") +
    `  TX: ${tx.id.slice(0, 10)}...`,
  )

  return "listed"
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const mainAccount = process.env.TERRACORE_ACCOUNT_MAIN?.trim() ?? ""
  const accounts    = loadAccounts().filter((a) => a.username !== mainAccount)
  const client      = await buildHiveClient()

  console.log(`[relic-sell] ══════════════════════════════════════`)
  console.log(`[relic-sell]  Accounts : ${accounts.length}${mainAccount ? `  (excluding @${mainAccount})` : ""}`)
  console.log(`[relic-sell] ══════════════════════════════════════\n`)

  let listed  = 0
  let already = 0
  let skipped = 0
  let errors  = 0

  for (const account of accounts) {
    try {
      const result = await sellRelicsForAccount(client, account)
      if      (result === "listed")  listed++
      else if (result === "already") already++
      else                           skipped++
    } catch (err) {
      console.error(`[relic-sell] ERROR  @${account.username}  ${err instanceof Error ? err.message : String(err)}`)
      errors++
    }
    await sleep(1500)
  }

  console.log(`\n[relic-sell] ─── Summary ─────────────────────────────`)
  console.log(`[relic-sell]   Listed        : ${listed}`)
  console.log(`[relic-sell]   Already listed: ${already}`)
  console.log(`[relic-sell]   No relics     : ${skipped}`)
  console.log(`[relic-sell]   Errors        : ${errors}`)
  console.log(`[relic-sell] ─────────────────────────────────────────`)
}

main().catch((err) => {
  console.error(`[relic-sell] Fatal: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
