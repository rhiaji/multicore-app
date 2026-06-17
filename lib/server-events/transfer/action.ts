/**
 * lib/server-events/transfer/action.ts
 *
 * Server Action (async generator) for the bulk token transfer script.
 * Yields event objects directly — no push callback, no SSE encoding.
 * The calling page iterates with: for await (const evt of runTransfer(params)) { ... }
 */

import { Client, PrivateKey } from "@hiveio/dhive"
import { makeClientRelaxed }  from "@/lib/shared/hive-client"
import type { TransferEvent } from "@/lib/shared/events/types"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AccountWithKeys {
  username:    string
  active_key:  string
  posting_key: string
}

export interface RunTransferParams {
  accounts:  AccountWithKeys[]
  recipient: string
  memo:      string
  /**
   * Token symbol, e.g. "HIVE", "HBD", "SCRAP".
   * Note: the legacy API route used the field name `token` for this value.
   * The page state variable is also called `token` — pass it here as `symbol`.
   */
  symbol:    string
  amount:    "max" | number
}

// ── Hive client ───────────────────────────────────────────────────────────────
// makeClientRelaxed() imported from lib/shared/hive-client.ts

// ── Balance fetchers ──────────────────────────────────────────────────────────

async function getNativeBalances(
  client: Client,
  usernames: string[],
  symbol: string,
): Promise<Record<string, number>> {
  const accounts = await client.database.getAccounts(usernames)
  const field    = symbol === "HBD" ? "hbd_balance" : "balance"
  const map: Record<string, number> = {}
  for (const acc of accounts) {
    if (!acc) continue
    const raw =
      typeof (acc as any)[field] === "string"
        ? (acc as any)[field]
        : (acc as any)[field].toString()
    map[acc.name] = parseFloat(raw.split(" ")[0])
  }
  return map
}

async function getHiveEngineBalances(
  usernames: string[],
  symbol: string,
): Promise<Record<string, number>> {
  const CHUNK = 1000
  const map: Record<string, number> = {}
  for (let i = 0; i < usernames.length; i += CHUNK) {
    const chunk = usernames.slice(i, i + CHUNK)
    const res = await fetch("https://api.hive-engine.com/rpc/contracts", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id:      1,
        method:  "find",
        params: {
          contract: "tokens",
          table:    "balances",
          query:    { symbol, account: { $in: chunk } },
          limit:    CHUNK,
          offset:   0,
        },
      }),
    })
    const json = await res.json()
    for (const row of json?.result ?? []) {
      map[row.account] = parseFloat(row.balance)
    }
  }
  return map
}

// ── Broadcast helpers ─────────────────────────────────────────────────────────

async function broadcastNativeTransfer(
  client: Client,
  from: string,
  activeKey: string,
  to: string,
  amount: number,
  symbol: string,
  memo: string,
): Promise<string> {
  const amountStr = `${amount.toFixed(3)} ${symbol}`
  const operation: [string, Record<string, unknown>] = [
    "transfer",
    { from, to, amount: amountStr, memo },
  ]
  const key = PrivateKey.fromString(activeKey)
  const tx  = await client.broadcast.sendOperations([operation as any], key)
  return tx.id
}

async function broadcastHiveEngineTransfer(
  client: Client,
  from: string,
  activeKey: string,
  to: string,
  amount: number,
  symbol: string,
  memo: string,
): Promise<string> {
  const payload = JSON.stringify({
    contractName:    "tokens",
    contractAction:  "transfer",
    contractPayload: { symbol, to, quantity: amount.toString(), memo },
  })
  const operation: [string, Record<string, unknown>] = [
    "custom_json",
    {
      required_auths:         [from],
      required_posting_auths: [],
      id:                     "ssc-mainnet-hive",
      json:                   payload,
    },
  ]
  const key = PrivateKey.fromString(activeKey)
  const tx  = await client.broadcast.sendOperations([operation as any], key)
  return tx.id
}

function isNativeToken(symbol: string): boolean {
  return symbol === "HIVE" || symbol === "HBD"
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"))
    const id = setTimeout(resolve, ms)
    signal?.addEventListener("abort", () => { clearTimeout(id); reject(new DOMException("Aborted", "AbortError")) }, { once: true })
  })
}

// ── Core action ───────────────────────────────────────────────────────────────

export async function* runTransfer(
  params: RunTransferParams,
  signal?: AbortSignal,
): AsyncGenerator<TransferEvent> {
  const { accounts, recipient, memo, symbol: rawSymbol, amount } = params

  const symbol      = String(rawSymbol).toUpperCase().trim()
  const useMax      = amount === "max"
  const fixedAmount = useMax ? null : Number(amount)

  if (!useMax && (isNaN(fixedAmount!) || fixedAmount! <= 0)) {
    yield { type: "error", message: "amount must be 'max' or a positive number." }
    yield { type: "done",  success: false }
    return
  }

  const client = makeClientRelaxed()

  try {
    // ── Step 1: Validate recipient ───────────────────────────────────────
    yield { type: "step", step: "validate", status: "running", message: `Validating recipient @${recipient}...` }

    assertNotAborted(signal)
    const [recipientAccount] = await client.database.getAccounts([recipient]).catch(() => [null])
    if (!recipientAccount) {
      yield { type: "step", step: "validate", status: "error", message: `Recipient "@${recipient}" not found on Hive.` }
      yield { type: "done",  success: false }
      return
    }

    yield { type: "step", step: "validate", status: "done", message: `Recipient @${recipient} confirmed on chain.` }

    // ── Step 2: Fetch balances ───────────────────────────────────────────
    yield {
      type:    "step",
      step:    "balances",
      status:  "running",
      message: `Fetching ${symbol} balances (${isNativeToken(symbol) ? "native" : "Hive Engine"})...`,
    }

    const usernames = accounts.map((a) => a.username)
    let balanceMap: Record<string, number> = {}
    try {
      assertNotAborted(signal)
      balanceMap = isNativeToken(symbol)
        ? await getNativeBalances(client, usernames, symbol)
        : await getHiveEngineBalances(usernames, symbol)
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") throw err
      // leave balanceMap empty — each account will show error below
    }

    for (const acc of accounts) {
      if (!(acc.username in balanceMap)) balanceMap[acc.username] = -1
    }

    const totalAvailable = Object.values(balanceMap).reduce((s, v) => s + Math.max(0, v), 0)
    yield {
      type:     "step",
      step:     "balances",
      status:   "done",
      message:  `Total ${symbol} across accounts: ${totalAvailable.toFixed(3)} ${symbol}`,
      balances: balanceMap,
    }

    // ── Step 3: Broadcast transfers ──────────────────────────────────────
    yield {
      type:    "step",
      step:    "broadcast",
      status:  "running",
      message: `Starting ${symbol} transfers (${useMax ? "max balance" : `fixed ${fixedAmount} ${symbol}`})...`,
    }

    let successCount = 0
    let skipCount    = 0
    let errorCount   = 0
    let totalMoved   = 0

    for (const acc of accounts) {
      assertNotAborted(signal)

      const { username, active_key } = acc
      const balance = balanceMap[username] ?? -1

      if (balance < 0) {
        yield { type: "transfer", username, status: "error", message: "Failed to fetch balance", amount: 0, symbol }
        errorCount++
        continue
      }

      const sendAmount = useMax ? balance : Math.min(fixedAmount!, balance)

      if (sendAmount < 0.001) {
        yield {
          type:    "transfer",
          username,
          status:  "skip",
          message: `Balance too low (${balance.toFixed(3)} ${symbol})`,
          amount:  0,
          symbol,
        }
        skipCount++
        continue
      }

      if (username === recipient) {
        yield { type: "transfer", username, status: "skip", message: "Sender equals recipient", amount: 0, symbol }
        skipCount++
        continue
      }

      try {
        assertNotAborted(signal)
        const txId = isNativeToken(symbol)
          ? await broadcastNativeTransfer(client, username, active_key, recipient, sendAmount, symbol, memo)
          : await broadcastHiveEngineTransfer(client, username, active_key, recipient, sendAmount, symbol, memo)

        yield {
          type:    "transfer",
          username,
          status:  "ok",
          message: `Sent ${sendAmount.toFixed(3)} ${symbol} → TX: ${txId.slice(0, 10)}...`,
          amount:  sendAmount,
          symbol,
          txId,
        }
        totalMoved += sendAmount
        successCount++
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") throw err
        yield {
          type:    "transfer",
          username,
          status:  "error",
          message: err instanceof Error ? err.message : "Broadcast failed",
          amount:  0,
          symbol,
        }
        errorCount++
      }

      await sleep(1_200, signal)
    }

    yield {
      type:    "step",
      step:    "broadcast",
      status:  "done",
      message: `Completed: ${successCount} sent, ${skipCount} skipped, ${errorCount} errors`,
    }

    yield {
      type:    "done",
      success: true,
      symbol,
      summary: { successCount, skipCount, errorCount, totalMoved },
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
