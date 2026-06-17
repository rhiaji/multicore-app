/**
 * server/automation/auto-relic-market/index.ts
 *
 * Entry point for the combined relic market automation.
 *
 * Each loop cycle:
 *   SELL PHASE — iterate every seller account, broadcast tm_create for unlisted
 *     relics, then add the listing count to a cache (Map<username, count>).
 *   TRIGGER CHECK — after each account: if total cached listings >= batchTrigger
 *     (default 25), wait triggerDelay ms (default 5s), fetch live market data
 *     for all cached accounts, verify listings, then mass-buy as the main account.
 *   FLUSH PHASE — after all sellers: flush any remaining cached listings the
 *     same way (accounts that never pushed the total over the trigger threshold).
 *
 * Usage:
 *   pnpm run auto:relic-market
 */

import { loadConfig }             from "./config/env"
import { RelicMarketService }     from "./service/relic-market-service"
import { logHeader, logError }    from "../../shared/lib/logger"

async function main() {
  try {
    logHeader("RELIC MARKET BOT — STARTING")

    const config  = loadConfig()
    const service = new RelicMarketService(config.sellers, config.buyer)
    await service.runContinuous(config.pollInterval)
  } catch (err) {
    logError(`Fatal: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}

main()
