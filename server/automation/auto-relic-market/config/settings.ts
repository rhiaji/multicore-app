// Auto Relic Market — Sell + Buy Automation Settings
// Controls the combined sell-then-buy cycle for all sub-accounts.

export interface RelicMarketSettings {
  sell: {
    /**
     * Pricing mode for listing relics.
     * "auto"  — unit price = ceil(autoFloor / amount * 1000) / 1000
     *           so that qty × price >= autoFloor HIVE (marketplace minimum).
     * "fixed" — flat per-unit price per rarity tier (see fixedPrices below).
     */
    pricingMode: "auto" | "fixed"

    /**
     * Minimum total listing price in HIVE used in "auto" mode.
     * Default: 0.1 (marketplace floor).
     */
    autoFloor: number

    /**
     * Per-unit prices in HIVE used in "fixed" mode.
     * Ignored when pricingMode is "auto".
     */
    fixedPrices: {
      common_relics:    number
      uncommon_relics:  number
      rare_relics:      number
      epic_relics:      number
      legendary_relics: number
    }
  }

  buy: {
    /**
     * Total number of cached listing types (across all seller accounts) that
     * triggers an immediate buy phase during the sell loop.
     * e.g. 25 means: once 25 listing types have been broadcast and cached,
     * stop and buy them before continuing to the next seller.
     */
    batchTrigger: number

    /**
     * How long to wait (ms) after the cache hits batchTrigger (or at
     * end-of-loop flush) before fetching live market data and buying.
     * Gives Hive + Terracore time to index the tm_create custom_jsons.
     */
    triggerDelay: number

    /**
     * Max operations per Hive broadcast transaction in the buy phase.
     * Hive allows up to 50 ops per tx — keep at 25 to stay comfortably under.
     */
    batchSize: number

    /**
     * Only buy relics of these rarity types.
     * Set to null / empty array to buy all rarities.
     */
    rarityFilter: string[] | null

    /**
     * Skip listings whose unit price (HIVE per 1 unit) exceeds this value.
     * Set to null to buy at any price.
     */
    maxPricePerUnit: number | null
  }

  delays: {
    /** Between processing each sub-account (ms). */
    betweenAccounts: number
    /** Between batch buy broadcasts (ms). */
    betweenBatches: number
    /** Between full sell+buy cycle iterations (overridden by POLL_INTERVAL). */
    betweenLoops: number
    /** Before a retry attempt — multiplied by attempt number (ms). */
    retryDelay: number
  }

  retry: {
    /** Max sell broadcast retries per account before giving up. */
    maxAttempts: number
  }
}

const settings: RelicMarketSettings = {
  sell: {
    pricingMode: "auto",
    autoFloor:   0.1,
    fixedPrices: {
      common_relics:    0.001,
      uncommon_relics:  0.001,
      rare_relics:      0.001,
      epic_relics:      0.001,
      legendary_relics: 0.001,
    },
  },

  buy: {
    batchTrigger:    25,
    triggerDelay:    5_000,
    batchSize:       25,
    rarityFilter:    null,
    maxPricePerUnit: null,
  },

  delays: {
    betweenAccounts: 1_500,
    betweenBatches:  1_500,
    betweenLoops:    5_000,
    retryDelay:      1_500,
  },

  retry: {
    maxAttempts: 4,
  },
}

export default settings
