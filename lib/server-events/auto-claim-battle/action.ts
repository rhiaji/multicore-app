/**
 * lib/server-events/auto-claim-battle/action.ts
 *
 * Server Action (async generator) for the auto-claim-battle script.
 * Yields event objects directly — no push callback, no SSE encoding.
 * The calling page iterates with: for await (const evt of runAutoClaimBattle(params)) { ... }
 */

import { Client, PrivateKey }        from "@hiveio/dhive"
import { makeClientRelaxed }         from "@/lib/shared/hive-client"
import { fetchPlayer, fetchBattleTargets } from "@/lib/shared/api/terracore"
import type { PlayerData, BattleTarget }   from "@/lib/shared/api/terracore"
import type { AutoClaimBattleEvent }       from "@/lib/shared/events/types"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AccountEntry {
  username:    string
  posting_key: string
}

export interface ScriptSettings {
  scrapRequirement: { enabled: boolean; multiplier: number }
  manualClaim:      { enabled: boolean }
  attacks:          { enabled: boolean; minimumRequired: number }
}

export interface RunAutoClaimBattleParams {
  accounts: AccountEntry[]
  settings: ScriptSettings
}

export const DEFAULT_SETTINGS: ScriptSettings = {
  scrapRequirement: { enabled: true,  multiplier: 4 },
  manualClaim:      { enabled: false },
  attacks:          { enabled: true,  minimumRequired: 2 },
}

// ── Hardcoded delays ──────────────────────────────────────────────────────────

const DELAYS = {
  betweenAttacks:  1500,
  betweenAccounts: 2000,
  retryDelay:      1500,
}

// ── Hive client ───────────────────────────────────────────────────────────────
// makeClientRelaxed() imported from lib/shared/hive-client.ts

// ── Terracore API ─────────────────────────────────────────────────────────────
// fetchPlayer(), fetchBattleTargets() imported from lib/shared/api/terracore.ts

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function claimHash(): string {
  return Math.random().toString(36).slice(2, 15) + Math.random().toString(36).slice(2, 15)
}

// ── Core action ───────────────────────────────────────────────────────────────

export async function* runAutoClaimBattle(
  params: RunAutoClaimBattleParams,
  signal?: AbortSignal,
): AsyncGenerator<AutoClaimBattleEvent> {
  const { accounts, settings } = params
  const hiveClient = makeClientRelaxed()

  try {
    yield {
      type:    "step",
      step:    "execute",
      status:  "running",
      message: `Processing ${accounts.length} account(s)...`,
    }

    let totalClaimed = 0
    let totalSkipped = 0
    let totalAttacks = 0
    let totalErrors  = 0

    for (const account of accounts) {
      assertNotAborted(signal)

      // ── Step 1: Fetch player data for this account ─────────────────────
      let player: PlayerData
      try {
        assertNotAborted(signal)
        player = await fetchPlayer(account.username)
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") throw err
        yield {
          type:     "player-error",
          username: account.username,
          message:  err instanceof Error ? err.message : "Failed to fetch",
        }
        totalErrors++
        await sleep(DELAYS.betweenAccounts, signal)
        continue
      }

      const mineratePerHour = player.minerate * 3600

      yield {
        type:       "player",
        username:   account.username,
        attacks:    player.attacks,
        maxAttacks: player.maxAttacks,
        claims:     player.claims,
        lastclaim:  player.lastclaim,
        minerate:   mineratePerHour,
        scrap:      player.scrap,
      }

      // ── Step 2: Scrap requirement check ────────────────────────────────
      const requiredScrap = mineratePerHour * settings.scrapRequirement.multiplier

      const hasEnoughScrap =
        settings.manualClaim.enabled ||
        (settings.scrapRequirement.enabled && player.scrap > 0 && requiredScrap <= player.scrap) ||
        (!settings.scrapRequirement.enabled && player.scrap > 0)

      if (!hasEnoughScrap) {
        yield {
          type:     "account-action",
          username: account.username,
          action:   "skip",
          reason:   `not enough scrap (have: ${player.scrap.toFixed(2)}, need: ${requiredScrap.toFixed(2)})`,
        }
        totalSkipped++
        await sleep(DELAYS.betweenAccounts, signal)
        continue
      }

      if ((player.claims ?? 0) === 0) {
        yield {
          type:     "account-action",
          username: account.username,
          action:   "skip",
          reason:   "no claims available",
        }
        totalSkipped++
        await sleep(DELAYS.betweenAccounts, signal)
        continue
      }

      // ── Step 3: Attacks ────────────────────────────────────────────────
      const attacksAvail = player.attacks ?? 0
      const shouldAttack = settings.attacks.enabled && attacksAvail >= settings.attacks.minimumRequired

      if (shouldAttack) {
        try {
          assertNotAborted(signal)
          const targets  = await fetchBattleTargets(player.stats?.damage ?? 0)
          const toAttack = targets.slice(0, 2)

          yield {
            type:     "account-action",
            username: account.username,
            action:   "attacks-start",
            count:    toAttack.length,
          }

          const key        = PrivateKey.fromString(account.posting_key)
          const attackOps: [string, Record<string, unknown>][] = toAttack.map((t) => [
            "custom_json",
            {
              required_auths:         [],
              required_posting_auths: [account.username],
              id:   "terracore_battle",
              json: JSON.stringify({ target: t.username }),
            },
          ])

          assertNotAborted(signal)
          await hiveClient.broadcast.sendOperations(attackOps as any, key)
          await sleep(DELAYS.betweenAttacks, signal)

          totalAttacks += toAttack.length
          yield {
            type:     "account-action",
            username: account.username,
            action:   "attacks-done",
            count:    toAttack.length,
            targets:  toAttack.map((t) => t.username),
          }
        } catch (err) {
          if ((err as DOMException)?.name === "AbortError") throw err
          yield {
            type:     "account-action",
            username: account.username,
            action:   "attacks-error",
            message:  err instanceof Error ? err.message : String(err),
          }
        }
      } else if (!settings.attacks.enabled) {
        yield {
          type:     "account-action",
          username: account.username,
          action:   "attacks-skip",
          reason:   "attacks disabled",
        }
      } else {
        yield {
          type:     "account-action",
          username: account.username,
          action:   "attacks-skip",
          reason:   `only ${attacksAvail} attack(s) — need ${settings.attacks.minimumRequired}`,
        }
      }

      // ── Step 4: Claim ──────────────────────────────────────────────────
      try {
        const hash    = claimHash()
        const claimOp: [string, Record<string, unknown>] = [
          "custom_json",
          {
            required_auths:         [],
            required_posting_auths: [account.username],
            id:   "terracore_claim",
            json: JSON.stringify({ amount: 0, "tx-hash": hash }),
          },
        ]

        const key = PrivateKey.fromString(account.posting_key)
        assertNotAborted(signal)
        const tx  = await hiveClient.broadcast.sendOperations([claimOp] as any, key)

        yield {
          type:     "account-action",
          username: account.username,
          action:   "claim-ok",
          txId:     tx.id,
          minerate: mineratePerHour.toFixed(4),
        }

        totalClaimed++
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") throw err
        yield {
          type:     "account-action",
          username: account.username,
          action:   "claim-error",
          message:  err instanceof Error ? err.message : String(err),
        }
        totalErrors++
      }

      await sleep(DELAYS.betweenAccounts, signal)
    }

    yield {
      type:    "step",
      step:    "execute",
      status:  "done",
      message: `Done — ${totalClaimed} claimed, ${totalSkipped} skipped, ${totalErrors} errors.`,
    }

    yield {
      type:    "done",
      success: true,
      summary: {
        accounts:     accounts.length,
        totalClaimed,
        totalSkipped,
        totalAttacks,
        totalErrors,
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
