import { loadConfig }                from "./config/env"
import { logHeader, logInfo, logError } from "../../shared/lib/logger"
import { AccountAutomationService }  from "./service/account-automation"

async function main() {
  try {
    logHeader("TERRACORE BOT — STARTING")

    const config = loadConfig()
    logInfo(`Loaded ${config.accounts.length} account(s)`)

    if (config.mainAccount) logInfo(`Main account: @${config.mainAccount} (SCRAP transfers enabled)`)

    const automation = new AccountAutomationService(config.accounts, config.mainAccount)
    await automation.runContinuous(config.pollInterval)
  } catch (err) {
    logError(`Fatal: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}

main()
