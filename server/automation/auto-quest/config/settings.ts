// Auto-Quest Bot Settings
// Update these values to control quest automation behaviour

export interface QuestSettings {
  quests: {
    /** Max board slots to start per account per cycle (1–3) */
    maxStartsPerCycle: number
  }
  delays: {
    /** ms between collect/start broadcasts for the same account */
    betweenActions: number
    /** ms between accounts in one loop pass */
    betweenAccounts: number
    /** ms to wait before next full loop (overridden by POLL_INTERVAL env var) */
    betweenLoops: number
    /** ms before a retry attempt, multiplied by attempt number */
    retryDelay: number
  }
  retry: {
    /** Maximum broadcast retry attempts per account before giving up */
    maxAttempts: number
  }
}

const settings: QuestSettings = {
  quests: {
    maxStartsPerCycle: 3,
  },

  delays: {
    betweenActions:  1_500,
    betweenAccounts: 2_000,
    betweenLoops:    5_000,
    retryDelay:      1_500,
  },

  retry: {
    maxAttempts: 3,
  },
}

export default settings
