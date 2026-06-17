import { Client, PrivateKey } from "@hiveio/dhive"
import { NodeSelector, HIVE_NODES } from "../../../shared/config/node-selector"
import { logInfo, logError, logSuccess } from "../../../shared/lib/logger"
import settings from "../config/settings"

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Handles all Hive blockchain broadcasts for the claim-battle bot.
 *
 * Posting-key operations : attack, claim
 * Active-key operations  : transferScrap (ssc-mainnet-hive)
 *
 * Node selection: uses NodeSelector (PeakD beacon) to pick the best live
 * node at startup, then falls back to the static HIVE_NODES list.
 */
export class BlockchainService {
  private client:       Client
  private nodeSelector: NodeSelector

  constructor() {
    this.nodeSelector = new NodeSelector()
    this.client = new Client(HIVE_NODES, {
      timeout:           10_000,
      failoverThreshold: 0,
      consoleOnFailover: true,
    })
  }

  /**
   * Fetch live node scores from the PeakD beacon, pick the top node, and
   * rebuild the dhive Client with that node leading the failover list.
   * Call once at automation startup before the first account loop.
   */
  async initialize(): Promise<void> {
    try {
      await this.nodeSelector.initialize()
      const liveEndpoints = this.nodeSelector.getAllEndpoints()
      const merged = [
        ...liveEndpoints,
        ...HIVE_NODES.filter((n) => !liveEndpoints.includes(n)),
      ]
      this.client = new Client(merged, {
        timeout:           10_000,
        failoverThreshold: 0,
        consoleOnFailover: true,
      })
      logInfo(`[blockchain] Using node: ${this.nodeSelector.getCurrentEndpoint()}`)
    } catch (err) {
      logError(
        `[blockchain] Beacon init failed — falling back to static nodes. ` +
        `Reason: ${err instanceof Error ? err.message : String(err)}`,
      )
      this.client = new Client(HIVE_NODES, {
        timeout:           10_000,
        failoverThreshold: 0,
        consoleOnFailover: true,
      })
    }
  }

  /**
   * Rebuild the dhive Client to use a specific endpoint as the primary.
   * Called on manual failover.
   */
  setEndpoint(endpoint: string): void {
    const others = this.nodeSelector.getAllEndpoints().filter((e) => e !== endpoint)
    const merged = [
      endpoint,
      ...others,
      ...HIVE_NODES.filter((n) => n !== endpoint && !others.includes(n)),
    ]
    this.client = new Client(merged, {
      timeout:           10_000,
      failoverThreshold: 0,
      consoleOnFailover: true,
    })
    logInfo(`[blockchain] Primary node set to: ${endpoint}`)
  }

  // ── Battle ──────────────────────────────────────────────────────────────────

  /**
   * Broadcast attack operations against the given targets.
   */
  async attack(
    username:        string,
    postingKey:      string,
    targetUsernames: string[],
    txHash:          string,
  ): Promise<void> {
    const key = PrivateKey.fromString(postingKey)

    const ops: [string, object][] = targetUsernames.map((target) => [
      "custom_json",
      {
        required_auths:         [],
        required_posting_auths: [username],
        id:                     "terracore_battle",
        json:                   JSON.stringify({ target, "tx-hash": txHash }),
      },
    ])

    await this.client.broadcast.sendOperations(ops as any, key)
    logInfo(`Attack | ${username} → ${targetUsernames.join(", ")}`)
    await delay(settings.delays.betweenAttacks)
  }

  // ── Claim ───────────────────────────────────────────────────────────────────

  /**
   * Broadcast terracore_claim custom_json.
   * Returns the transaction id.
   */
  async claim(
    username:   string,
    postingKey: string,
    txHash:     string,
  ): Promise<string> {
    const key = PrivateKey.fromString(postingKey)

    const op: [string, object] = [
      "custom_json",
      {
        required_auths:         [],
        required_posting_auths: [username],
        id:                     "terracore_claim",
        json:                   JSON.stringify({ amount: 0.0, "tx-hash": txHash }),
      },
    ]

    try {
      const tx = await this.client.broadcast.sendOperations([op] as any, key)
      logSuccess(`Claimed │ TX: ${tx.id.slice(0, 10)}...`)
      return tx.id
    } catch (err) {
      logError(`Claim broadcast failed: ${err instanceof Error ? err.message : String(err)}`)
      throw err
    }
  }

  // ── Token Transfer ──────────────────────────────────────────────────────────

  /**
   * Transfer SCRAP to the main account via Hive Engine (active key).
   * Used at the end of each account's cycle to consolidate earnings.
   */
  async transferScrap(
    username:  string,
    activeKey: string,
    to:        string,
    quantity:  number,
    memo:      string,
  ): Promise<string> {
    const key = PrivateKey.fromString(activeKey)

    const op: [string, Record<string, unknown>] = [
      "custom_json",
      {
        required_auths:         [username],
        required_posting_auths: [],
        id:                     "ssc-mainnet-hive",
        json:                   JSON.stringify({
          contractName:    "tokens",
          contractAction:  "transfer",
          contractPayload: { symbol: "SCRAP", to, quantity: quantity.toString(), memo },
        }),
      },
    ]

    const tx = await this.client.broadcast.sendOperations([op as any], key)
    logInfo(`Transfer | ${username} → ${to} | ${quantity.toFixed(3)} SCRAP | TX: ${tx.id.slice(0, 10)}...`)
    return tx.id
  }
}
