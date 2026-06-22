// Terracore Combined Bot Settings
// Controls both the claim/battle flow and the quest flow for every account.

export interface BotSettings {
  // ── Claim + Battle ──────────────────────────────────────────────────────────
  scrapRequirement: {
    /** Enable or disable scrap threshold check before claiming */
    enabled: boolean
    /** Multiplier applied to minerate to calculate required scrap (e.g. 4 = 4× minerate) */
    multiplier: number
  }
  manualClaim: {
    /** Override the scrap check and claim regardless of balance */
    enabled: boolean
  }
  attacks: {
    /** Enable battle attacks before claiming */
    enabled: boolean
    /** Minimum available attacks needed before attempting the attack sequence */
    minimumRequired: number
  }

  // ── Quests ──────────────────────────────────────────────────────────────────
  quests: {
    /** Max board slots to start per account per cycle (1–3) */
    maxStartsPerCycle: number
  }

  // ── Token Transfer ───────────────────────────────────────────────────────────
  transfer: {
    /**
     * Enable SCRAP transfer to main account after each claim.
     * Requires TERRACORE_ACCOUNT_MAIN to be set in .env.
     */
    enabled: boolean
    /**
     * SCRAP balance the account is allowed to keep.
     * Any amount above this threshold is swept to the main account.
     * Default: 200
     */
    scrapAllowance: number
    /** Memo attached to every SCRAP transfer */
    memo: string
  }

  // ── Delays (ms) ─────────────────────────────────────────────────────────────
  delays: {
    /** Between individual attack broadcasts */
    betweenAttacks: number
    /** Between quest collect/start broadcasts for the same account */
    betweenActions: number
    /** Between processing each account in one loop pass */
    betweenAccounts: number
    /** Between full loop cycles (overridden by POLL_INTERVAL env var) */
    betweenLoops: number
    /** Before a retry attempt — multiplied by attempt number */
    retryDelay: number
    /**
     * How long to wait (ms) after a successful claim before reading the
     * Hive Engine SCRAP balance. Allows the mint to propagate on-chain.
     * Target: 3 000 ms. Defaults to 3 000 ms if omitted.
     */
    claimPropagation?: number
  }

  retry: {
    /** Maximum broadcast retry attempts per account before giving up */
    maxAttempts: number
  }
}

const settings: BotSettings = {
  scrapRequirement: {
    enabled: true,
    multiplier: 4,
  },

  manualClaim: {
    enabled: false,
  },

  attacks: {
    enabled: true,
    minimumRequired: 2,
  },

  quests: {
    maxStartsPerCycle: 3,
  },

  transfer: {
    enabled: true,
    scrapAllowance: 400,
    memo: "Multicore Bot consolidation",
  },

  delays: {
    betweenAttacks: 1_500,
    betweenActions: 1_500,
    betweenAccounts: 2_000,
    betweenLoops: 5_000,
    retryDelay: 1_500,
    claimPropagation: 3_000,
  },

  retry: {
    maxAttempts: 3,
  },
}

export default settings
