import { Client, PrivateKey }          from "@hiveio/dhive"
import { NodeSelector, HIVE_NODES }    from "../../../shared/config/node-selector"
import { logInfo, logError, logSuccess } from "../../../shared/lib/logger"

/**
 * Handles all Hive blockchain broadcasts for the auto-token-transfer bot.
 *
 * Active-key operations:
 *   transferNative     — native HIVE / HBD transfer op
 *   transferHiveEngine — ssc-mainnet-hive custom_json (any HE token)
 *
 * Node selection: NodeSelector fetches live beacon scores at startup via
 * initialize(), falls back to the static HIVE_NODES list on failure.
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

  // ── Node initialisation ─────────────────────────────────────────────────────

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

  /** Expose the underlying dhive Client for read-only queries (e.g. getAccounts). */
  getClient(): Client {
    return this.client
  }

  // ── Transfers ───────────────────────────────────────────────────────────────

  /**
   * Broadcast a native HIVE or HBD transfer.
   * Requires active key.
   */
  async transferNative(
    from:      string,
    activeKey: string,
    to:        string,
    amount:    number,
    symbol:    "HIVE" | "HBD",
    memo:      string,
  ): Promise<string> {
    const key = PrivateKey.fromString(activeKey)

    const op: [string, Record<string, unknown>] = [
      "transfer",
      { from, to, amount: `${amount.toFixed(3)} ${symbol}`, memo },
    ]

    const tx = await this.client.broadcast.sendOperations([op as any], key)
    logSuccess(
      `Transfer | ${from} → ${to} | ${amount.toFixed(3)} ${symbol} | TX: ${tx.id.slice(0, 10)}...`,
    )
    return tx.id
  }

  /**
   * Broadcast a Hive Engine token transfer via ssc-mainnet-hive custom_json.
   * Requires active key.
   */
  async transferHiveEngine(
    from:      string,
    activeKey: string,
    to:        string,
    quantity:  number,
    symbol:    string,
    memo:      string,
  ): Promise<string> {
    const key = PrivateKey.fromString(activeKey)

    const op: [string, Record<string, unknown>] = [
      "custom_json",
      {
        required_auths:         [from],
        required_posting_auths: [],
        id:                     "ssc-mainnet-hive",
        json:                   JSON.stringify({
          contractName:    "tokens",
          contractAction:  "transfer",
          contractPayload: {
            symbol,
            to,
            quantity: quantity.toFixed(8),
            memo,
          },
        }),
      },
    ]

    const tx = await this.client.broadcast.sendOperations([op as any], key)
    logSuccess(
      `Transfer | ${from} → ${to} | ${quantity.toFixed(8)} ${symbol} | TX: ${tx.id.slice(0, 10)}...`,
    )
    return tx.id
  }
}
