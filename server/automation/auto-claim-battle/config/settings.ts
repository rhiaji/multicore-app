// Terracore Claim Bot Settings
// Update these values to control bot behavior

export interface BotSettings {
  scrapRequirement: {
    enabled:    boolean
    multiplier: number
  }
  manualClaim: {
    enabled: boolean
  }
  transfer: {
    /** Set to true to sweep SCRAP to TERRACORE_ACCOUNT_MAIN after each claim cycle. */
    enabled:        boolean
    /** Amount of SCRAP to leave in each sub-account (not swept). */
    scrapAllowance: number
    /** Memo attached to the HE token transfer. */
    memo:           string
  }
  delays: {
    /** Between individual attack broadcasts (ms). */
    betweenAttacks:  number
    /** Between processing each account (ms). */
    betweenAccounts: number
    /** Between full loop cycles (ms). */
    betweenLoops:    number
    /** Before a retry attempt — multiplied by attempt number (ms). */
    retryDelay:      number
    /**
     * How long to wait after a successful claim before reading the
     * Hive Engine SCRAP balance. Allows the mint to propagate on-chain.
     * Target: 3 000 ms.
     */
    claimPropagation: number
  }
  attacks: {
    enabled:         boolean
    minimumRequired: number
  }
}

const settings: BotSettings = {
  scrapRequirement: {
    enabled:    true,
    multiplier: 4,
  },

  manualClaim: {
    enabled: false,
  },

  transfer: {
    // Enable SCRAP sweeping to main account after each claim cycle
    enabled:        false,
    // Leave this many SCRAP in each sub-account
    scrapAllowance: 200,
    memo:           "terracore auto-transfer",
  },

  delays: {
    betweenAttacks:   1_500,
    betweenAccounts:  2_000,
    betweenLoops:     5_000,
    retryDelay:       1_500,
    claimPropagation: 3_000,
  },

  attacks: {
    enabled:         true,
    minimumRequired: 2,
  },
}

export default settings
