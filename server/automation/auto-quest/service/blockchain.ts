import { Client, PrivateKey } from "@hiveio/dhive"
import { NodeSelector, HIVE_NODES } from "../../../shared/config/node-selector"
import { logInfo, logError } from "../../../shared/lib/logger"

function txHash(): string {
  return Math.random().toString(36).slice(2, 22)
}

/**
 * Blockchain service for the auto-quest automation.
 *
 * collectQuest — terracore_quest_collect custom_json (posting key)
 * startQuest   — ssc-mainnet-hive SCRAP transfer (active key)
 *
 * Node selection: self-owned NodeSelector fetches live beacon scores at
 * startup via initialize(). Falls back gracefully to the static HIVE_NODES
 * list if the beacon is unreachable.
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

  // ── Quests ──────────────────────────────────────────────────────────────────

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
}
