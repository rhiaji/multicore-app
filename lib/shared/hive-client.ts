/**
 * lib/shared/hive-client.ts
 *
 * Single makeClient() factory used by all lib/server-events actions.
 *
 * Two named exports for the two timeout profiles used across server-events:
 *   makeClient()        — 10s timeout, no failover  (market sell/buy, transfer)
 *   makeClientRelaxed() — 30s timeout, 3 failovers  (auto-claim-battle, auto-quest)
 */

import { Client } from "@hiveio/dhive"
import { HIVE_NODES } from "./hive-nodes"

export function makeClient(): Client {
  return new Client(HIVE_NODES, {
    timeout:           10_000,
    failoverThreshold: 0,
    consoleOnFailover: false,
  })
}

export function makeClientRelaxed(): Client {
  return new Client(HIVE_NODES, {
    timeout:           30_000,
    failoverThreshold: 3,
    consoleOnFailover: false,
  })
}
