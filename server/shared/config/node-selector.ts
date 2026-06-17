/**
 * NodeSelector — fetches live Hive node list from the PeakD beacon and
 * provides automatic failover.  Shared by all server automations and scripts.
 *
 * HIVE_NODES is the static fallback list used when the beacon is unreachable
 * or as the initial Client seed before initialize() resolves.  All code that
 * previously imported from hive-client.ts should import from here instead.
 */

export const BEACON_URL = "https://beacon.peakd.com/api/nodes"

/** Static fallback node list — used when the beacon is unavailable. */
export const HIVE_NODES = [
  "https://api.hive.blog",
  "https://anyx.io",
  "https://api.deathwing.me",
  "https://rpc.mahdiyari.info",
  "https://hived.emre.sh",
  "https://hive-api.arcange.eu",
]

export interface HiveNode {
  name:       string
  endpoint:   string
  version:    string
  score:      number
  updated_at: string
  success:    number
  lastBlock:  number | null
  fail:       number
  features:   string[]
}

export class NodeSelector {
  private nodes:            HiveNode[] = []
  private currentNodeIndex: number     = 0
  private beaconUrl:        string

  constructor(beaconUrl: string = BEACON_URL) {
    this.beaconUrl = beaconUrl
  }

  async initialize(): Promise<void> {
    const response = await fetch(this.beaconUrl, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw new Error(`Beacon returned HTTP ${response.status}`)

    const allNodes = (await response.json()) as HiveNode[]

    this.nodes = allNodes
      .filter((n) => n.score >= 50 && n.features?.includes("broadcast"))
      .sort((a, b) => b.score - a.score)

    if (this.nodes.length === 0) throw new Error("No viable Hive nodes found from beacon")

    console.log(
      `[NodeSelector] ${this.nodes.length} node(s) ready. Top: ${this.nodes[0].name} (${this.nodes[0].endpoint})`,
    )
  }

  getCurrentNode(): HiveNode {
    if (this.nodes.length === 0) throw new Error("No nodes available — call initialize() first")
    return this.nodes[this.currentNodeIndex % this.nodes.length]
  }

  getCurrentEndpoint(): string {
    return this.getCurrentNode().endpoint
  }

  /** Advance to the next node and return its endpoint */
  failover(): string {
    this.currentNodeIndex++
    const node = this.getCurrentNode()
    console.log(`[NodeSelector] Failover → ${node.name} (${node.endpoint})`)
    return node.endpoint
  }

  getAllEndpoints(): string[] {
    return this.nodes.map((n) => n.endpoint)
  }
}

// ── Script helper ─────────────────────────────────────────────────────────────

/**
 * Build a dhive Client for one-shot scripts.
 *
 * Attempts to seed the node list from the PeakD beacon so the script always
 * uses the fastest available node.  Falls back to the static HIVE_NODES list
 * if the beacon is unreachable (same graceful-degradation behaviour as the
 * long-running automations).
 *
 * Usage: `const client = await buildHiveClient()`
 */
export async function buildHiveClient() {
  const { Client } = await import("@hiveio/dhive")
  const selector   = new NodeSelector()
  try {
    await selector.initialize()
    const endpoints = [
      ...selector.getAllEndpoints(),
      ...HIVE_NODES.filter((n) => !selector.getAllEndpoints().includes(n)),
    ]
    return new Client(endpoints, { timeout: 10_000, failoverThreshold: 3, consoleOnFailover: true })
  } catch {
    console.warn("[buildHiveClient] Beacon unreachable — using static node list")
    return new Client(HIVE_NODES, { timeout: 10_000, failoverThreshold: 3, consoleOnFailover: true })
  }
}
