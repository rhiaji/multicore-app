# Multicore — Terracore Multi-Account Dashboard

A Next.js dashboard for tracking and managing multiple [Terracore](https://terracoregame.com) game accounts on the Hive blockchain. Includes battle automation, quest automation, relic market tooling, SCRAP staking/claiming, stat upgrades, RC delegation, token transfers, and server-side scripts for bulk operations.

---

## Tech Stack

- **Next.js 16** (App Router)
- **React 19**
- **Tailwind CSS v4**
- **shadcn/ui**
- **Hive Keychain** (browser extension — all on-chain UI actions)
- **@hiveio/dhive** (server-side blockchain broadcasting)
- **CryptoJS** (AES-256 account encryption/decryption)

---

## Getting Started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                          # Dashboard (home)
│   ├── market/relics/page.tsx            # Relics marketplace browser
│   └── scripts/
│       ├── page.tsx                      # Scripts index / launcher
│       ├── token-transfer/page.tsx       # Bulk token transfer UI
│       ├── auto-claim-battle/page.tsx    # Auto claim & battle UI
│       ├── auto-quest/page.tsx           # Auto quest UI
│       ├── relic-market-sell/page.tsx    # Relic market sell UI
│       └── relic-market-buy/page.tsx     # Relic market buy UI
│
├── app/api/scripts/
│   ├── token-transfer/route.ts           # SSE stream for token transfer
│   ├── auto-claim-battle/route.ts        # SSE stream for claim & battle
│   ├── auto-quest/route.ts               # SSE stream for auto quest
│   ├── relic-market-sell/route.ts        # SSE stream for relic sell
│   └── relic-market-buy/route.ts         # SSE stream for relic buy
│
├── components/
│   ├── dashboard.tsx                     # Root multi-account dashboard
│   ├── account-card.tsx                  # Per-account stats, relics, quests
│   ├── active-quest-card.tsx             # Active quest progress display
│   ├── quest-card.tsx                    # Quest board slot card
│   ├── quest-detail-modal.tsx            # Quest detail with requirements
│   ├── quest-history-modal.tsx           # Per-account quest history log
│   ├── battle-modal.tsx                  # Manual battle target selection
│   ├── upgrade-stat-modal.tsx            # Upgrade DMG / DEF / ENG stats
│   ├── stake-scrap-modal.tsx             # Stake SCRAP via Hive Engine
│   ├── contribute-favor-modal.tsx        # Burn SCRAP for Favor
│   ├── send-hive-modal.tsx               # HIVE transfer via Keychain
│   ├── sell-relic-modal.tsx              # List a single relic type
│   ├── sell-all-relics-modal.tsx         # Batch list all relic types
│   ├── delegate-rc-modal.tsx             # RC delegation via Keychain
│   ├── rc-overview-panel.tsx             # Batch RC fetch for all accounts
│   ├── add-account.tsx                   # Add a tracked account
│   ├── configure-accounts-modal.tsx      # Encrypt accounts for scripts
│   └── market/
│       ├── relics-market.tsx             # Marketplace browser
│       ├── buy-relic-modal.tsx           # Buy a single listing
│       ├── mass-buy-relics-modal.tsx     # Sweep tracked-account listings
│       ├── relics-market-logs.tsx        # Market activity log
│       ├── user-market-logs.tsx          # Per-user market log
│       ├── hive-login-button.tsx         # Keychain login button
│       └── hive-login-nav.tsx            # Nav-bar login widget
│
├── lib/
│   ├── types.ts                          # Canonical domain types
│   ├── hive-auth.ts                      # Keychain login / session
│   ├── encryption.ts                     # AES-256 encrypt/decrypt helpers
│   ├── quest-utils.ts                    # Quest requirements, stat helpers
│   ├── utils.ts                          # Tailwind cn() helper
│   │
│   ├── events/                           # Keychain (browser) event wrappers
│   │   ├── battle/action.ts              # terracore_battle custom_json
│   │   ├── buy-relic/action.ts           # Relic market purchase (transfer)
│   │   ├── claim-scrap/action.ts         # terracore_claim custom_json
│   │   ├── contribute-favor/action.ts    # Burn SCRAP for Favor
│   │   ├── delegate-rc/action.ts         # RC delegation custom_json
│   │   ├── delegation-stats/action.ts    # Fetch incoming/outgoing VESTS
│   │   ├── mass-buy-relics/action.ts     # Batch relic purchase (broadcast)
│   │   ├── quest-collect/action.ts       # terracore_quest_collect
│   │   ├── quest-start/action.ts         # Quest start SCRAP burn
│   │   ├── sell-all-relics/action.ts     # Batch tm_create listings
│   │   ├── sell-relic/action.ts          # Single tm_create listing
│   │   ├── stake-scrap/action.ts         # Hive Engine SCRAP stake
│   │   ├── transfer-hive/action.ts       # requestTransfer HIVE
│   │   └── upgrade-stat/action.ts        # Burn SCRAP to upgrade stat
│   │
│   ├── server-events/                    # Server-side async generators (SSE)
│   │   ├── auto-claim-battle/action.ts   # Claim + battle for N accounts
│   │   ├── auto-quest/action.ts          # Collect/start quests for N accounts
│   │   ├── relic-market-buy/action.ts    # Sweep and buy relic listings
│   │   ├── relic-market-sell/action.ts   # List relics for N accounts
│   │   └── transfer/action.ts            # Bulk token transfer
│   │
│   └── shared/                           # Shared server utilities
│       ├── hive-nodes.ts                 # Hive RPC node list
│       ├── hive-client.ts                # dhive client factory
│       ├── api/terracore.ts              # Terracore REST API fetchers
│       └── events/types.ts               # Typed SSE event discriminated unions
```

---

## Dashboard Features

The main dashboard (`/`) tracks multiple Terracore accounts simultaneously. All on-chain actions go through the **Hive Keychain** browser extension.

### Account tracking

- Add any number of Hive/Terracore usernames
- Accounts persist across sessions (localStorage)
- Prev / Next arrows to cycle accounts without opening the Switch modal
- Export accounts as a JSON template for use with the encryption tool

### Per-account stats (account-card)

| Field | Source |
|---|---|
| Level, XP | Terracore API `/player/:username` |
| DMG, DEF, ENG | Terracore player stats |
| SCRAP (liquid + staked) | Terracore + Hive Engine |
| FAVOR, LUCK, DODGE, HP | Terracore player stats |
| RC % | Hive API (batch-fetched via Show RCs) |
| HIVE balance | Hive API |

### Actions available per account

| Action | Keychain call | Authority |
|---|---|---|
| Claim SCRAP | `requestCustomJson` id=`terracore_claim` | Posting |
| Battle targets (up to 5) | `requestCustomJson` id=`terracore_battle` | Posting |
| Upgrade DMG / DEF / ENG | `requestCustomJson` id=`ssc-mainnet-hive` (burn SCRAP) | Active |
| Stake SCRAP | `requestCustomJson` id=`ssc-mainnet-hive` (stake) | Active |
| Burn SCRAP for Favor | `requestCustomJson` id=`ssc-mainnet-hive` (transfer to null) | Active |
| Start quest | `requestCustomJson` id=`ssc-mainnet-hive` (burn SCRAP) | Active |
| Collect quest | `requestCustomJson` id=`terracore_quest_collect` | Posting |
| Sell relic (single type) | `requestCustomJson` id=`ssc-mainnet-hive` (`tm_create`) | Active |
| Sell all relics | `requestBroadcast` (multiple `tm_create` ops) | Active |
| Buy relic | `requestTransfer` → `terracore.market` | Active |
| Mass-buy relics | `requestBroadcast` (multiple transfers) | Active |
| Send HIVE | `requestTransfer` | Active |
| Delegate RC | `requestCustomJson` id=`rc` | Posting |

### Stat upgrade cost formula

```
cost (SCRAP) = currentLevel²
currentLevel (damage)     = floor(player.damage / 10)
currentLevel (defense)    = floor(player.defense / 10)
currentLevel (engineering) = player.engineering
```

Memo format: `terracore_<stat>-<random_hash>` (e.g. `terracore_damage-vpyn1lzzfyil27mtptm5l`)

### Quests

Five quest types with tier 1–5 progression:

| Type | Primary stat | Secondary | Required item slot |
|---|---|---|---|
| COMBAT | DMG | CRIT | Weapon |
| SALVAGE | ENG | — | Tool |
| STEALTH | DODGE (items) | LUCK | Armor |
| FORTUNE | LUCK (items) | CRIT | Avatar |
| DEFENSE | DEF | — | Ship |

Tier requirements (level / stat / item):

| Tier | Level | Stat | Item required |
|---|---|---|---|
| 1 | 1 | 10 | No |
| 2 | 10 | 50 | No |
| 3 | 25 | 100 | Yes |
| 4 | 50 | 200 | Yes |
| 5 | 100 | 500 | Yes |

### Relic Market (`/market/relics`)

- Browse all active listings, filter by rarity and price
- Buy a single listing (Keychain transfer to `terracore.market`)
- Mass-buy: sweep all listings from every tracked account in one `requestBroadcast`
- Login with Keychain to enable purchases

---

## Account Encryption

Scripts run server-side and need private keys. Keys are encrypted client-side before leaving the browser and decrypted in-memory on the server only during execution.

### Step 1 — Export usernames

In the dashboard click **Switch** → **Export Config**. This produces a JSON template:

```json
[
  { "username": "dvpm01", "active_key": "", "posting_key": "" },
  { "username": "dvpm02", "active_key": "", "posting_key": "" }
]
```

### Step 2 — Fill in keys

Paste the template into a text editor and fill `active_key` and `posting_key` from your Hive wallet.

### Step 3 — Encrypt

Open the **Encrypt** modal (button on `/scripts`), paste the filled JSON, click **Encrypt Accounts**. You receive:

- **Encryption Key** — 64-character hex string, e.g. `a1b2c3d4...`
- **Encrypted Config** — AES-256 encrypted JSON blob

### Step 4 — Set environment variables

```bash
# .env.local
TERRACORE_ENCRYPTION_KEY="a1b2c3d4e5f6..."
TERRACORE_ACCOUNTS_ENC='{"accounts":[{"username":"dvpm01","encryptedPrivate":"U2FsdGVkX1..."}],"version":"1.0"}'
```

The scripts page reads these variables on the server. Plaintext keys are never stored or logged.

---

## Scripts (`/scripts`)

All scripts run server-side. The browser POSTs a config payload to an API route, which streams Server-Sent Events (SSE) back in real time. Each script page renders a live log and results table as events arrive.

### Token Transfer (`/scripts/token-transfer`)

Sweeps a token balance from every decrypted account to a single recipient.

**Supports:** HIVE, HBD (native transfers), and any Hive Engine token including SCRAP.

| Option | Description |
|---|---|
| Recipient | Target Hive username |
| Token | `HIVE` / `HBD` / `SCRAP` / any HE symbol |
| Amount | `MAX` (full balance) or a fixed number |
| Memo | Optional transfer memo |

**Flow:** Decrypt → Validate recipient → Fetch balances → Broadcast transfers

Skips accounts with zero balance and accounts where sender = recipient.

---

### Auto Claim & Battle (`/scripts/auto-claim-battle`)

For each account: optionally attack targets, then claim SCRAP rewards.

| Setting | Default | Description |
|---|---|---|
| Scrap requirement | Enabled, 4× | Only claim if stash ≥ minerate/hr × multiplier |
| Manual claim | Off | Bypass scrap requirement and claim unconditionally |
| Attacks | Enabled, min 2 available | Attack up to 2 targets before claiming |

**Battle target selection:** fetches targets with defense below `player.damage - 10`.

**Flow:** Decrypt → Fetch player data → Check scrap/claims → Attack targets → Broadcast claim

---

### Auto Quest (`/scripts/auto-quest`)

Collects completed quests and optionally starts new ones for each account.

| Setting | Default | Description |
|---|---|---|
| Collect ready quests | On | Broadcast `terracore_quest_collect` for completed quests |
| Start available quests | Off | Burn SCRAP to start quests the account can do |

**Quest start uses active key** (Hive Engine SCRAP burn). **Quest collect uses posting key.**

**Flow:** Decrypt → Fetch quest board → Fetch active quests per account → Collect/start

---

### Relic Market Sell (`/scripts/relic-market-sell`)

Lists all unlisted relics from every seller account on the market.

| Setting | Description |
|---|---|
| Auto-price | Computes a per-rarity listing price automatically |
| Skip already listed | Skips relic types that already have an active listing |

Uses `custom_json` id=`ssc-mainnet-hive` with `contractAction: "tm_create"` (active key).

**Flow:** Decrypt → Fetch relics per account → List unlisted types

---

### Relic Market Buy (`/scripts/relic-market-buy`)

Buys relics listed by your tracked dashboard accounts using a single buyer account.

| Setting | Description |
|---|---|
| Max unit price | Skip listings above this HIVE price per relic |
| Rarity filters | Choose which rarities (common → legendary) to buy |
| Tracked accounts | Only buys from accounts currently tracked in the dashboard |

Uses `transfer` to `terracore.market` with a memo referencing the listing (active key).

**Flow:** Decrypt → Fetch listings from tracked accounts → Plan batches → Broadcast transfers

---

## Shared Library

### `lib/shared/hive-nodes.ts`
Single-source Hive RPC node list used by all server-side generators. Edit this file to update nodes everywhere.

```ts
export const HIVE_NODES = [
  "https://api.hive.blog",
  "https://api.deathwing.me",
  "https://hive-api.arcange.eu",
]
```

### `lib/shared/api/terracore.ts`
All Terracore REST API fetchers in one place:

| Function | Endpoint | Returns |
|---|---|---|
| `fetchPlayer(username)` | `/player/:username` | `PlayerData` |
| `fetchPlayerRelics(username)` | `/items/:username` | `UserRelic[]` |
| `fetchQuestBoard(username)` | `/quest_board?username=` | `QuestBoard` |
| `fetchActiveQuests(username)` | `/quests/:username` | `ActiveQuest[]` |
| `fetchBattleTargets(maxDefense)` | `/battle?maxDefense=` | `BattleTarget[]` |

`fetchPlayer` auto-retries up to 5× on HTTP 429.

### `lib/shared/events/types.ts`
Typed discriminated union for every SSE generator:

| Export | Generator |
|---|---|
| `RelicMarketSellEvent` | `runRelicMarketSell` |
| `RelicMarketBuyEvent` | `runRelicMarketBuy` |
| `AutoQuestEvent` | `runAutoQuest` |
| `AutoClaimBattleEvent` | `runAutoClaimBattle` |
| `TransferEvent` | `runTransfer` |

### `lib/encryption.ts`
AES-256 helpers (CryptoJS) used in both the browser (Encrypt modal) and on the server (script decryption):

- `generateEncryptionKey()` — 32-byte random hex key
- `encryptAccounts(accounts, key)` → `EncryptedConfig`
- `decryptAccounts(config, key)` → `AccountWithKeys[]`

---

## Troubleshooting

**"Failed to decrypt TERRACORE_ACCOUNTS_ENC"**
Verify `TERRACORE_ENCRYPTION_KEY` exactly matches the key shown by the Encrypt tool. Check for truncation or stray whitespace when copying the encrypted JSON.

**Keychain not found / actions not working**
Install and unlock the [Hive Keychain](https://hive-keychain.com) browser extension. All UI actions require it.

**RC errors on broadcast**
The account does not have enough Resource Credits. Use the RC delegation feature to delegate from another account. Use **Show RCs** on the dashboard to batch-check all accounts at once.

**Script shows stale results / wrong accounts**
Make sure both `TERRACORE_ACCOUNTS_ENC` and `TERRACORE_ENCRYPTION_KEY` are set and match. Re-encrypt if accounts have changed.

**Stat upgrade sends wrong on-chain action**
Damage, defense, and engineering upgrades each produce a distinct memo prefix (`terracore_damage-…`, `terracore_defense-…`, `terracore_engineering-…`). Verify you are on the latest version of `lib/events/upgrade-stat/action.ts`.
