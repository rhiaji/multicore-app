import { loadAccounts }  from "../../shared/config/env"
import { logHeader, logInfo, logError } from "../../shared/lib/logger"
import { AccountAutomationService } from "./service/account-automation"

async function main() {
  try {
    logHeader("TERRACORE QUEST BOT — STARTING")

    const accounts = loadAccounts()
    logInfo(`Loaded ${accounts.length} account(s)`)

    const pollInterval = parseInt(process.env.POLL_INTERVAL || "60000", 10)

    const automation = new AccountAutomationService(accounts)
    await automation.runContinuous(pollInterval)
  } catch (err) {
    logError(`Fatal: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}

main()
