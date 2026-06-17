import { Client, PrivateKey } from "@hiveio/dhive"
import { NodeSelector, HIVE_NODES } from "../../../shared/config/node-selector"
import { logInfo, logError } from "../../../shared/lib/logger"
import settings from "../config/settings"

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function txHash(): string {
  return Math.random().toString(36).slice(2, 22)
}

/**
 * Combined blockchain service for the terracore automation.
 *
 * Posting-key operations : attack, claim, collectQuest
 * Active-key operations  : startQuest, transferScrap (ssc-mainnet-hive)
 *
 * Node selection: uses NodeSelector (PeakD beacon) to pick the best live
 * node at startup, then falls back to the static HIVE_NODES list so dhive
 * can still failover if the primary goes down during a run.
 */
export class BlockchainService {
  private client:       Client
  private nodeSelector: NodeSelector

  constructor() {
    this.nodeSelector = new NodeSelector()
    // Start with the static list; initialize() swaps to beacon-selected nodes
    this.client = new Client(HIVE_NODES, {
      timeout:           10_000,
      failoverThreshold: 0,
      consoleOnFailover: true,
    })
  }

  /**
   * Fetch live node scores from the PeakD beacon, pick the top node, and
   * rebuild the dhive Client with that node leading the failover list.
   * Call this once at automation startup before the first account loop.
   */
  async initialize(): Promise<void> {
    try {
      await this.nodeSelector.initialize()
      const liveEndpoints = this.nodeSelector.getAllEndpoints()
      // Merge: beacon-ranked live nodes first, then static fallbacks for any gaps
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
      // Reduce timeout on static fallback so bad nodes don't stall the loop
      this.client = new Client(HIVE_NODES, {
        timeout:           10_000,
        failoverThreshold: 0,
        consoleOnFailover: true,
      })
    }
  }

  /**
   * Rebuild the dhive Client to use a specific endpoint as the primary,
   * keeping the rest of the beacon-ranked list as failover.
   * Called by AccountAutomationService.failoverNode().
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

  // ── Claim + Battle ──────────────────────────────────────────────────────────

  /**
   * Broadcast terracore_battle custom_json for each target.
   */
  async attack(
    username:   string,
    postingKey: string,
    targets:    string[],
  ): Promise<void> {
    const hash = txHash()
    const key  = PrivateKey.fromString(postingKey)

    const ops: [string, object][] = targets.map((target) => [
      "custom_json",
      {
        required_auths:         [],
        required_posting_auths: [username],
        id:                     "terracore_battle",
        json:                   JSON.stringify({ target, "tx-hash": hash }),
      },
    ])

    await this.client.broadcast.sendOperations(ops as any, key)
    logInfo(`Attack | ${username} → ${targets.join(", ")}`)
    await delay(settings.delays.betweenAttacks)
  }

  /**
   * Broadcast terracore_claim custom_json.
   */
  async claim(
    username:   string,
    postingKey: string,
  ): Promise<string> {
    const hash = txHash()
    const key  = PrivateKey.fromString(postingKey)

    const op: [string, object] = [
      "custom_json",
      {
        required_auths:         [],
        required_posting_auths: [username],
        id:                     "terracore_claim",
        json:                   JSON.stringify({ amount: 0.0, "tx-hash": hash }),
      },
    ]

    try {
      const tx = await this.client.broadcast.sendOperations([op] as any, key)
      logInfo(`Claim  | ${username} | TX: ${tx.id.slice(0, 10)}...`)
      return tx.id
    } catch (err) {
      logError(`Claim failed for ${username}: ${err instanceof Error ? err.message : String(err)}`)
      throw err
    }
  }

  // ── Quests ──────────────────────────────────────────────────────────────────

  /**
   * Broadcast terracore_quest_collect custom_json (posting key).
   */
  async collectQuest(
    username:   string,
    postingKey: string,
    questId:    string,
  ): Promise<string> {
    const hash = txHash()
    const key  = PrivateKey.fromString(postingKey)

    const op: [string, Record<string, unknown>] = [
      "custom_json",
      {
        required_auths:         [],
        required_posting_auths: [username],
        id:                     "terracore_quest_collect",
        json:                   JSON.stringify({ quest_id: questId, "tx-hash": hash }),
      },
    ]

    const tx = await this.client.broadcast.sendOperations([op as any], key)
    logInfo(`Collect | ${username} | quest: ${questId.slice(0, 8)}... | TX: ${tx.id.slice(0, 10)}...`)
    return tx.id
  }

  /**
   * Broadcast ssc-mainnet-hive SCRAP transfer to start a quest (active key).
   */
  async startQuest(
    username:  string,
    activeKey: string,
    questType: string,
    tier:      string,
    scrapCost: number,
  ): Promise<string> {
    const hash = txHash()
    const memo = `terracore_quest_start-${questType}-${tier}-${hash}`
    const key  = PrivateKey.fromString(activeKey)

    const op: [string, Record<string, unknown>] = [
      "custom_json",
      {
        required_auths:         [username],
        required_posting_auths: [],
        id:                     "ssc-mainnet-hive",
        json:                   JSON.stringify({
          contractName:    "tokens",
          contractAction:  "transfer",
          contractPayload: { symbol: "SCRAP", to: "null", quantity: String(scrapCost), memo },
        }),
      },
    ]

    const tx = await this.client.broadcast.sendOperations([op as any], key)
    logInfo(`Start  | ${username} | ${questType} T${tier} | TX: ${tx.id.slice(0, 10)}...`)
    return tx.id
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
          contractPayload: { symbol: "SCRAP", to, quantity: quantity.toFixed(8), memo },
        }),
      },
    ]

    const tx = await this.client.broadcast.sendOperations([op as any], key)
    logInfo(`Transfer | ${username} → ${to} | ${quantity.toFixed(8)} SCRAP | TX: ${tx.id.slice(0, 10)}...`)
    return tx.id
  }
}
