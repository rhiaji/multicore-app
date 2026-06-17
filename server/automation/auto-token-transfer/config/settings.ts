// Auto Token Transfer — Settings
// Controls per-cycle transfer behaviour.

export interface TokenTransferSettings {
  /**
   * Token symbol to sweep.  HIVE / HBD are native; anything else is treated
   * as a Hive Engine token (ssc-mainnet-hive custom_json).
   *
   * Can be overridden at runtime via the TOKEN_SYMBOL env var.
   */
  tokenSymbol: string

  /**
   * When true  → send the full available balance (balance − allowance).
   * When false → send exactly customAmount per account.
   *
   * Can be overridden via SEND_MAX_BALANCE=true|false env var.
   */
  sendMaxBalance: boolean

  /**
   * Fixed amount to send per account when sendMaxBalance is false.
   * Accounts whose balance is below this amount are skipped.
   *
   * Can be overridden via CUSTOM_AMOUNT env var.
   */
  customAmount: number

  /**
   * Amount to leave in each sub-account after sweeping (only applies when
   * sendMaxBalance is true).
   * Swept amount = balance − allowance.
   * Set to 0 to sweep the full balance.
   */
  allowance: number

  /**
   * Memo attached to every transfer.
   * Supports the placeholder {username} which is replaced with the
   * sending account's username at runtime.
   */
  memo: string

  delays: {
    /** ms to wait between individual transfer broadcasts. */
    betweenTransfers: number
    /** ms between accounts in one loop pass. */
    betweenAccounts: number
    /** ms between full loop cycles (overridden by POLL_INTERVAL env var). */
    betweenLoops: number
    /** ms before a retry attempt, multiplied by attempt number. */
    retryDelay: number
  }

  retry: {
    /** Max broadcast retry attempts per account before giving up. */
    maxAttempts: number
  }

  /**
   * When true the bot runs once and exits (useful for cron-driven deploys).
   * When false it loops continuously.
   *
   * Can be overridden via RUN_ONCE=true env var.
   */
  runOnce: boolean
}

const settings: TokenTransferSettings = {
  tokenSymbol: "HIVE",
  sendMaxBalance: true,
  customAmount: 0,
  allowance: 0,
  memo: "Multicore bot token transfer consolidation",

  delays: {
    betweenTransfers: 1_500,
    betweenAccounts: 2_000,
    betweenLoops: 60_000,
    retryDelay: 1_500,
  },

  retry: {
    maxAttempts: 3,
  },

  runOnce: false,
}

export default settings
