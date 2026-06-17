/**
 * server/scripts/token-transfer.ts
 *
 * Transfer a token from every encrypted account to a single recipient.
 *
 * Usage:
 *   pnpm run script:token-transfer <TOKEN_SYMBOL> <username>
 *
 * Examples:
 *   pnpm run script:token-transfer HIVE  dustin0623
 *   pnpm run script:token-transfer HBD   dustin0623
 *   pnpm run script:token-transfer SCRAP dustin0623
 */

import { Client, PrivateKey } from "@hiveio/dhive"
import { loadAccounts }       from "../shared/config/env"
import { buildHiveClient }    from "../shared/config/node-selector"

// ── CLI args ──────────────────────────────────────────────────────────────────

const tokenSymbol = process.argv[2]?.trim().toUpperCase()
const recipient   = process.argv[3]?.trim().toLowerCase()

if (!tokenSymbol || !recipient) {
  console.error("[token-transfer] ERROR: Missing arguments.")
  console.error("  Usage: pnpm run script:token-transfer <TOKEN_SYMBOL> <username>")
  process.exit(1)
}

// ── Balance helpers ───────────────────────────────────────────────────────────

const NATIVE_TOKENS = new Set(["HIVE", "HBD"])

async function getNativeBalance(client: Client, username: string, symbol: string): Promise<number> {
  const [account] = await client.database.getAccounts([username])
  if (!account) throw new Error(`Account "${username}" not found on chain`)
  const field  = symbol === "HBD" ? account.hbd_balance : account.balance
  const balStr = typeof field === "string" ? field : (field as any).toString()
  return parseFloat(balStr.split(" ")[0])
}

async function getHiveEngineBalance(username: string, symbol: string): Promise<number> {
  const body = {
    jsonrpc: "2.0", method: "find", id: 1,
    params: {
      contract: "tokens", table: "balances",
      query: { account: username, symbol }, limit: 1,
    },
  }
  const res  = await fetch("https://api.hive-engine.com/rpc/contracts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body:   JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Hive Engine API error: ${res.status}`)
  const json = await res.json()
  const rows: { balance: string }[] = json?.result ?? []
  return rows.length ? parseFloat(rows[0].balance) || 0 : 0
}

async function getBalance(client: Client, username: string, symbol: string): Promise<number> {
  return NATIVE_TOKENS.has(symbol)
    ? getNativeBalance(client, username, symbol)
    : getHiveEngineBalance(username, symbol)
}

// ── Broadcast ─────────────────────────────────────────────────────────────────

async function broadcastTransfer(
  client:    Client,
  from:      string,
  activeKey: string,
  to:        string,
  amount:    number,
  symbol:    string,
): Promise<string> {
  const key = PrivateKey.fromString(activeKey)

  if (NATIVE_TOKENS.has(symbol)) {
    const op: [string, Record<string, unknown>] = [
      "transfer",
      { from, to, amount: `${amount.toFixed(3)} ${symbol}`, memo: "" },
    ]
    const tx = await client.broadcast.sendOperations([op as any], key)
    return tx.id
  }

  const op: [string, Record<string, unknown>] = [
    "custom_json",
    {
      required_auths:         [from],
      required_posting_auths: [],
      id:                     "ssc-mainnet-hive",
      json: JSON.stringify({
        contractName:    "tokens",
        contractAction:  "transfer",
        contractPayload: { symbol, to, quantity: amount.toFixed(8), memo: "" },
      }),
    },
  ]
  const tx = await client.broadcast.sendOperations([op as any], key)
  return tx.id
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const accounts = loadAccounts()
  const client   = await buildHiveClient()

  console.log(`[token-transfer] Token     : ${tokenSymbol}`)
  console.log(`[token-transfer] Recipient : @${recipient}`)
  console.log(`[token-transfer] Accounts  : ${accounts.length}\n`)

  let totalTransferred = 0
  let successCount = 0
  let skipCount    = 0
  let errorCount   = 0

  for (const account of accounts) {
    const { username, active_key } = account

    try {
      const balance = await getBalance(client, username, tokenSymbol)

      if (balance <= 0) {
        console.log(`[token-transfer]  SKIP  @${username}  zero balance`)
        skipCount++
        continue
      }

      if (username === recipient) {
        console.log(`[token-transfer]  SKIP  @${username}  sender === recipient`)
        skipCount++
        continue
      }

      console.log(`[token-transfer]  SEND  @${username} -> @${recipient}  ${balance.toFixed(3)} ${tokenSymbol}`)
      const txId = await broadcastTransfer(client, username, active_key, recipient, balance, tokenSymbol)
      console.log(`[token-transfer]   OK   TX: ${txId.slice(0, 10)}...`)

      totalTransferred += balance
      successCount++
    } catch (err) {
      console.error(`[token-transfer] ERROR  @${username}  ${err instanceof Error ? err.message : String(err)}`)
      errorCount++
    }

    await new Promise((r) => setTimeout(r, 1500))
  }

  console.log(`\n[token-transfer] ─── Summary ────────────────────────────────`)
  console.log(`[token-transfer]   Transferred : ${successCount} (${totalTransferred.toFixed(3)} ${tokenSymbol})`)
  console.log(`[token-transfer]   Skipped     : ${skipCount}`)
  console.log(`[token-transfer]   Errors      : ${errorCount}`)
  console.log(`[token-transfer] ────────────────────────────────────────────`)
}

main().catch((err) => {
  console.error(`[token-transfer] Fatal: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
