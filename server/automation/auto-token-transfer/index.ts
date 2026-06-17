/**
 * server/automation/auto-token-transfer/index.ts
 *
 * Continuously sweeps a configurable token from every sub-account to a single
 * recipient.  Supports native HIVE / HBD and any Hive Engine token.
 *
 * Required env vars:
 *   TOKEN_SYMBOL               — e.g. SCRAP, HIVE, HBD
 *   TOKEN_TRANSFER_RECIPIENT   — username that receives every sweep
 *
 * Optional env vars:
 *   POLL_INTERVAL              — ms between loop cycles   (default: 60000)
 *   RUN_ONCE                   — exit after one pass       (default: false)
 *   SEND_MAX_BALANCE           — true = sweep full balance, false = use CUSTOM_AMOUNT
 *   CUSTOM_AMOUNT              — fixed amount to send per account (when SEND_MAX_BALANCE=false)
 *
 * Usage:
 *   pnpm run auto:token-transfer
 */

import { loadConfig }                  from "./config/env"
import settings                        from "./config/settings"
import { AccountAutomationService }    from "./service/account-automation"
import { logHeader, logError, logInfo } from "../../shared/lib/logger"

async function main() {
  try {
    logHeader("TOKEN TRANSFER BOT — STARTING")

    const config  = loadConfig()
    const service = new AccountAutomationService(
      config.senders,
      config.recipient,
      config.tokenSymbol,
      config.sendMaxBalance,
      config.customAmount,
    )

    const runOnce = config.runOnce || settings.runOnce

    if (runOnce) {
      logInfo("RUN_ONCE mode — executing a single pass then exiting")
      await service.runAndExit()
    } else {
      await service.runContinuous(config.pollInterval)
    }
  } catch (err) {
    logError(`Fatal: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}

main()
