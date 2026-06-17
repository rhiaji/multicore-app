import { loadAccounts }                      from "../../shared/config/env"
import { logHeader, logInfo, logError }      from "../../shared/lib/logger"
import { AccountAutomationService }          from "./service/account-automation"

async function main() {
  try {
    logHeader("TERRACORE CLAIM BOT — STARTING")

    const accounts = loadAccounts()
    logInfo(`Loaded ${accounts.length} account(s)`)

    const mainAccount = process.env.TERRACORE_ACCOUNT_MAIN ?? ""
    if (mainAccount) logInfo(`Main account: @${mainAccount} (SCRAP transfers enabled)`)

    const automation = new AccountAutomationService(accounts, mainAccount)
    await automation.runContinuous()
  } catch (err) {
    logError(`Fatal: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}

main()
