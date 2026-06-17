"use client"

import { useState, useCallback, useEffect } from "react"
import { AccountCard } from "@/components/account-card"
import { AddAccount } from "@/components/add-account"
import { RcOverviewPanel } from "@/components/rc-overview-panel"
import type { AccountData, PlayerData, QuestBoard, ScrapBalance, ActiveQuest, QuestLog, UserRelic, HiveData } from "@/lib/types"
import Image from "next/image"
import { RefreshCw, Trash2, ShoppingCart, ArrowLeftRight, Plus, CheckCircle2, Copy, Check, Zap, ChevronLeft, ChevronRight, Terminal } from "lucide-react"
import Link from "next/link"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { HiveLoginNav } from "@/components/market/hive-login-nav"

async function fetchPlayerData(username: string): Promise<PlayerData> {
  const res = await fetch(`https://api.terracoregame.com/player/${username}`)
  if (!res.ok) {
    if (res.status === 404) throw new Error(`Player "${username}" not found.`)
    throw new Error(`Failed to fetch player data (${res.status}).`)
  }
  return res.json()
}

async function fetchQuestBoard(username: string): Promise<QuestBoard> {
  const res = await fetch(`https://api.terracoregame.com/quest_board?username=${username}`)
  if (!res.ok) {
    if (res.status === 404) throw new Error(`Quest board for "${username}" not found.`)
    throw new Error(`Failed to fetch quest board (${res.status}).`)
  }
  return res.json()
}

async function fetchActiveQuests(username: string): Promise<ActiveQuest[]> {
  const res = await fetch(`https://api.terracoregame.com/quests/${username}`)
  if (!res.ok) {
    if (res.status === 404) return []
    throw new Error(`Failed to fetch active quests (${res.status}).`)
  }
  return res.json()
}

async function fetchQuestLogs(username: string): Promise<QuestLog[]> {
  const res = await fetch(`https://api.terracoregame.com/quest_logs/${username}`)
  if (!res.ok) {
    if (res.status === 404) return []
    throw new Error(`Failed to fetch quest logs (${res.status}).`)
  }
  const data = await res.json()
  // API may return bare array or wrapped object — normalise to array
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.logs)) return data.logs
  if (data && Array.isArray(data.data)) return data.data
  return []
}

async function fetchUserItems(username: string): Promise<UserRelic[]> {
  const res = await fetch(`https://api.terracoregame.com/items/${username}`)
  if (!res.ok) {
    if (res.status === 404) return []
    throw new Error(`Failed to fetch items (${res.status}).`)
  }
  const json = await res.json()
  return (json.relics ?? []) as UserRelic[]
}

async function fetchScrapBalance(username: string): Promise<ScrapBalance> {
  const res = await fetch("https://herpc.dtools.dev/contracts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: 0,
      jsonrpc: "2.0",
      method: "findOne",
      params: {
        contract: "tokens",
        table: "balances",
        query: { symbol: "SCRAP", account: username },
        limit: 1,
        offset: 0,
      },
    }),
  })
  if (!res.ok) throw new Error(`Failed to fetch SCRAP balance (${res.status}).`)
  const json = await res.json()
  if (!json.result) throw new Error(`No SCRAP balance found for "${username}".`)
  return json.result as ScrapBalance
}

async function fetchHiveData(username: string): Promise<HiveData> {
  // Fetch account, RC, and global props in parallel for accurate VESTS→HP conversion
  const [accountRes, rcRes, globalRes] = await Promise.all([
    fetch("https://api.hive.blog/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "condenser_api.get_accounts",
        params: [[username]],
      }),
    }),
    fetch("https://api.hive.blog/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 2,
        method: "rc_api.find_rc_accounts",
        params: { accounts: [username] },
      }),
    }),
    fetch("https://api.hive.blog/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 3,
        method: "condenser_api.get_dynamic_global_properties",
        params: [],
      }),
    }),
  ])

  const accountJson = await accountRes.json()
  const rcJson = await rcRes.json()
  const globalJson = await globalRes.json()

  const acc = accountJson?.result?.[0]
  if (!acc) throw new Error(`Hive account "${username}" not found.`)

  const rcAccount = rcJson?.result?.rc_accounts?.[0]
  const rcCurrent = rcAccount ? Number(rcAccount.rc_manabar.current_mana) : 0
  const rcMax = rcAccount ? Number(rcAccount.max_rc) : 0
  const rcPercent = rcMax > 0 ? Math.min(100, (rcCurrent / rcMax) * 100) : 0

  // Accurate VESTS → HP using global properties ratio
  const gp = globalJson?.result
  const totalVests = gp ? parseFloat((gp.total_vesting_shares as string).split(" ")[0]) : 1
  const totalHive = gp ? parseFloat((gp.total_vesting_fund_hive as string).split(" ")[0]) : 1
  const vestsPerHive = totalVests / totalHive  // VESTS per 1 HP

  const vestingShares    = parseFloat((acc.vesting_shares as string).split(" ")[0]) || 0
  const delegatedVesting = parseFloat((acc.delegated_vesting_shares as string).split(" ")[0]) || 0
  const receivedVesting  = parseFloat((acc.received_vesting_shares as string).split(" ")[0]) || 0
  const ownVests = vestingShares - delegatedVesting + receivedVesting
  const hpBalance = vestsPerHive > 0 ? ownVests / vestsPerHive : 0

  return {
    hiveBalance:  parseFloat((acc.balance as string).split(" ")[0]) || 0,
    hbdBalance:   parseFloat((acc.hbd_balance as string).split(" ")[0]) || 0,
    hiveSavings:  parseFloat((acc.savings_balance as string).split(" ")[0]) || 0,
    hbdSavings:   parseFloat((acc.savings_hbd_balance as string).split(" ")[0]) || 0,
    hpBalance,
    rcPercent,
    rcCurrent,
    rcMax,
  }
}

function emptyAccount(username: string): AccountData {
  return {
    username,
    player: null,
    quests: null,
    activeQuests: null,
    questLogs: null,
    userRelics: null,
    scrapBalance: null,
    hiveData: null,
    loading: true,
    error: null,
  }
}

const STORAGE_KEY_USERNAMES = "terracore_tracked_accounts"
const STORAGE_KEY_ACTIVE    = "terracore_active_account"

function loadStoredUsernames(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USERNAMES)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch { return [] }
}

function loadStoredActive(): string | null {
  try { return localStorage.getItem(STORAGE_KEY_ACTIVE) } catch { return null }
}

export function Dashboard() {
  // All saved usernames — start empty to avoid SSR/client mismatch, hydrate in useEffect
  const [usernames, setUsernames] = useState<string[]>([])
  // Currently viewed account — same: start null, hydrate in useEffect
  const [activeUsername, setActiveUsername] = useState<string | null>(null)
  // Track whether we've hydrated from localStorage yet
  const [hydrated, setHydrated] = useState(false)
  // Data for the active account only
  const [activeAccount, setActiveAccount] = useState<AccountData | null>(null)
  // Switch account modal
  const [switchOpen, setSwitchOpen] = useState(false)
  const [switchView, setSwitchView] = useState<"accounts" | "rcs">("accounts")
  const [copied, setCopied] = useState(false)

  // Persist usernames list whenever it changes — but only after hydration so we
  // don't overwrite stored data with the initial empty [] before the read effect runs
  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem(STORAGE_KEY_USERNAMES, JSON.stringify(usernames)) } catch { /* ignore */ }
  }, [usernames, hydrated])

  // Persist active account whenever it changes — same guard
  useEffect(() => {
    if (!hydrated) return
    try {
      if (activeUsername) localStorage.setItem(STORAGE_KEY_ACTIVE, activeUsername)
      else localStorage.removeItem(STORAGE_KEY_ACTIVE)
    } catch { /* ignore */ }
  }, [activeUsername, hydrated])

  // On mount: hydrate from localStorage, then load data for the restored account
  useEffect(() => {
    const list    = loadStoredUsernames()
    const stored  = loadStoredActive()
    const active  = stored && list.includes(stored) ? stored : list[0] ?? null
    setUsernames(list)
    setActiveUsername(active)
    setHydrated(true)
    if (active) loadAccount(active)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally run once on mount only

  const loadAccount = useCallback(async (username: string) => {
    // Preserve existing data during refresh so the UI doesn't flash skeletons.
    // Only reset to the empty skeleton state on the very first load (no existing account).
    setActiveAccount((prev) =>
      prev && prev.username === username
        ? { ...prev, loading: true, error: null }
        : { ...emptyAccount(username) }
    )

    try {
      const [player, quests, activeQuests, questLogs, userItems, balance, hive] = await Promise.allSettled([
        fetchPlayerData(username),
        fetchQuestBoard(username),
        fetchActiveQuests(username),
        fetchQuestLogs(username),
        fetchUserItems(username),
        fetchScrapBalance(username),
        fetchHiveData(username),
      ])

      const playerData = player.status === "fulfilled" ? player.value : null
      const questData = quests.status === "fulfilled" ? quests.value : null
      const activeQuestData = activeQuests.status === "fulfilled" ? activeQuests.value : null
      const questLogData = questLogs.status === "fulfilled" ? questLogs.value : null
      const userRelicsData = userItems.status === "fulfilled" ? userItems.value : null
      const balanceData = balance.status === "fulfilled" ? balance.value : null
      const hiveData = hive.status === "fulfilled" ? hive.value : null
      const errorMsg =
        player.status === "rejected"
          ? (player.reason as Error).message
          : quests.status === "rejected"
          ? (quests.reason as Error).message
          : null

      setActiveAccount({
        username,
        player: playerData,
        quests: questData,
        activeQuests: activeQuestData,
        questLogs: questLogData,
        userRelics: userRelicsData,
        scrapBalance: balanceData,
        hiveData,
        loading: false,
        error: errorMsg,
      })
    } catch (err) {
      setActiveAccount((prev) =>
        prev?.username === username
          ? {
              ...prev,
              loading: false,
              error: err instanceof Error ? err.message : "Unknown error",
            }
          : prev
      )
    }
  }, [])

  function addAccount(username: string) {
    setUsernames((prev) => [...prev, username])
    setActiveUsername(username)
    loadAccount(username)
  }

  function removeAccount(username: string) {
    setUsernames((prev) => {
      const next = prev.filter((u) => u !== username)
      // If we removed the active one, switch to the first remaining
      if (activeUsername === username) {
        const next0 = next[0] ?? null
        setActiveUsername(next0)
        if (next0) {
          loadAccount(next0)
        } else {
          setActiveAccount(null)
        }
      }
      return next
    })
  }

  function switchToAccount(username: string) {
    if (username === activeUsername) return
    setActiveUsername(username)
    loadAccount(username)
  }

  function refreshActive() {
    if (activeUsername) loadAccount(activeUsername)
  }

  const completedCount =
    activeAccount?.activeQuests?.filter(
      (q) => !q.collected && Date.now() >= q.completes_at
    ).length ?? 0

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="size-8 rounded-lg overflow-hidden flex-shrink-0">
              <Image src="/logo.png" alt="Multicore logo" width={32} height={32} className="size-8 object-cover" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold tracking-widest uppercase text-foreground leading-tight">
                Multicore
              </h1>
              <p className="text-[10px] text-muted-foreground tracking-wide hidden sm:block">Multi-Account Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <Link
              href="/scripts"
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest"
            >
              <Terminal className="size-3" />
              <span className="hidden xs:inline">Scripts</span>
              <span className="xs:hidden">Scripts</span>
            </Link>
            <Link
              href="/market/relics"
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest"
            >
              <ShoppingCart className="size-3" />
              <span>Market</span>
            </Link>
            <HiveLoginNav />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Add account */}
        <section className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">Track Accounts</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Add Hive usernames to monitor their Terracore stats and daily quests.
              </p>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap pt-0.5">
              {usernames.length} account{usernames.length !== 1 ? "s" : ""} tracked
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <AddAccount
                onAdd={addAccount}
                existingUsernames={usernames}
              />
            </div>
            {usernames.length > 0 && (() => {
              const currentIdx = activeUsername ? usernames.indexOf(activeUsername) : -1
              const hasPrev    = currentIdx > 0
              const hasNext    = currentIdx < usernames.length - 1

              function stepTo(idx: number) {
                const u = usernames[idx]
                if (!u) return
                setActiveUsername(u)
                loadAccount(u)
              }

              return (
                <div className="flex items-center">
                  <button
                    onClick={() => stepTo(currentIdx - 1)}
                    disabled={!hasPrev}
                    title="Previous account"
                    className="flex items-center justify-center w-8 h-9 rounded-l-lg border border-r-0 border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>
                  <button
                    onClick={() => setSwitchOpen(true)}
                    title="Switch account"
                    className="flex items-center gap-1.5 px-3 py-2 h-9 border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-muted/40 transition-all whitespace-nowrap"
                  >
                    <ArrowLeftRight className="size-3.5" />
                    Switch
                    {usernames.length > 1 && (
                      <span className="text-[10px] font-mono text-muted-foreground/60">
                        {currentIdx + 1}/{usernames.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => stepTo(currentIdx + 1)}
                    disabled={!hasNext}
                    title="Next account"
                    className="flex items-center justify-center w-8 h-9 rounded-r-lg border border-l-0 border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>
              )
            })()}
          </div>
        </section>

        {usernames.length > 0 ? (
          <>
            {/* Active account data */}
            {activeAccount && (
              <section>
                <AccountCard
                  account={activeAccount}
                  onRemove={removeAccount}
                  onRefresh={refreshActive}
                  hideHeader
                />
              </section>
            )}
          </>
        ) : (
          <section className="flex flex-col items-center justify-center py-20 gap-4 border border-dashed border-border rounded-xl bg-card/30">
            <div className="size-14 rounded-full overflow-hidden border border-border flex items-center justify-center bg-card">
              <Image src="/logo.png" alt="Multicore logo" width={56} height={56} className="size-14 object-cover" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">No accounts yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add a username above to start tracking.
              </p>
            </div>
            <div className="flex flex-col gap-1 items-center">
              <p className="text-[11px] text-muted-foreground/60">Try an example:</p>
              <div className="flex gap-2 flex-wrap justify-center">
                {["dvpm", "terracore", "player1"].map((name) => (
                  <button
                    key={name}
                    onClick={() => addAccount(name)}
                    className="text-[11px] font-mono text-primary/70 hover:text-primary border border-primary/20 hover:border-primary/50 rounded px-2 py-0.5 transition-colors"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Switch Account Modal */}
      <Dialog open={switchOpen} onOpenChange={(v) => { setSwitchOpen(v); if (!v) setSwitchView("accounts") }}>
        <DialogContent className="max-w-2xl w-full p-0 bg-card border-border gap-0 overflow-hidden">
          <DialogTitle className="sr-only">Switch Account</DialogTitle>

          {/* Header */}
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
            <ArrowLeftRight className="size-4 text-primary" />
            <h2 className="text-sm font-bold tracking-wide uppercase text-foreground">Switch Account</h2>
            <div className="ml-auto flex items-center gap-2">
              {/* Show RCs toggle */}
              <button
                onClick={() => setSwitchView((v) => v === "rcs" ? "accounts" : "rcs")}
                className={[
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                  switchView === "rcs"
                    ? "border-amber-500/60 bg-amber-500/10 text-amber-400"
                    : "border-amber-500/30 text-amber-400 hover:border-amber-500/60 hover:bg-amber-500/5",
                ].join(" ")}
                title="View RC status for all tracked accounts"
              >
                <Zap className="size-3.5" />
                Show RCs
              </button>
              {/* Export Config — only in accounts view */}
              {switchView === "accounts" && (
                <button
                  onClick={() => {
                    const payload = usernames.map((u) => ({
                      username: u,
                      active_key: "",
                      posting_key: "",
                    }))
                    const text = JSON.stringify(payload, null, 2)
                    // Primary: modern clipboard API
                    const doCopy = () => {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                      navigator.clipboard.writeText(text).then(doCopy).catch(() => {
                        // Fallback: execCommand
                        const ta = document.createElement("textarea")
                        ta.value = text
                        ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0"
                        document.body.appendChild(ta)
                        ta.focus()
                        ta.select()
                        document.execCommand("copy")
                        document.body.removeChild(ta)
                        doCopy()
                      })
                    } else {
                      // Fallback only
                      const ta = document.createElement("textarea")
                      ta.value = text
                      ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0"
                      document.body.appendChild(ta)
                      ta.focus()
                      ta.select()
                      document.execCommand("copy")
                      document.body.removeChild(ta)
                      doCopy()
                    }
                  }}
                  className={[
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all duration-200",
                    copied
                      ? "border-green-500/60 bg-green-500/15 text-green-400"
                      : "border-border text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5",
                  ].join(" ")}
                  title="Export accounts config"
                >
                  {copied ? (
                    <>
                      <Check className="size-3.5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" />
                      Export Config
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Body: swaps between account list and RC overview */}
          {switchView === "rcs" ? (
            <RcOverviewPanel
              key="rc-panel"
              open={true}
              onClose={() => setSwitchView("accounts")}
              usernames={usernames}
              inline
            />
          ) : (
          <div className="flex flex-col divide-y divide-border max-h-[60vh] overflow-y-auto">
            {usernames.map((u) => {
              const isActive = u === activeUsername
              const isLoading = isActive && activeAccount?.loading
              const player = isActive ? activeAccount?.player : null
              const scrap = isActive ? activeAccount?.scrapBalance : null
              const readyCount = isActive
                ? (activeAccount?.activeQuests?.filter((q) => !q.collected && Date.now() >= q.completes_at).length ?? 0)
                : 0

              return (
                <div
                  key={u}
                  className={[
                    "flex items-center gap-3 px-5 py-4 transition-all cursor-pointer",
                    isActive
                      ? "bg-primary/5"
                      : "hover:bg-muted/30",
                  ].join(" ")}
                  onClick={() => {
                    switchToAccount(u)
                    setSwitchOpen(false)
                  }}
                >
                  {/* Active indicator */}
                  <div className="flex-shrink-0 w-4 flex items-center justify-center">
                    {isActive && <CheckCircle2 className="size-3.5 text-primary" />}
                  </div>

                  {/* Avatar */}
                  <div className="size-8 rounded-full bg-primary/20 border border-primary/30 overflow-hidden flex-shrink-0">
                    <img
                      src={`https://images.hive.blog/u/${u}/avatar/small`}
                      alt={u}
                      className="size-full object-cover"
                      onError={(e) => {
                        const target = e.currentTarget
                        target.style.display = "none"
                        target.parentElement!.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="size-4 m-auto mt-2 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
                      }}
                    />
                  </div>

                  {/* Name + sub info */}
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-foreground truncate">@{u}</span>
                      {isLoading && <RefreshCw className="size-3 animate-spin text-muted-foreground flex-shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {player && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          Lv {player.level}
                        </span>
                      )}
                      {scrap ? (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {(parseFloat(scrap.balance ?? "0") + parseFloat(scrap.stake ?? "0")).toFixed(2)} SCRAP
                        </span>
                      ) : player ? (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {player.experience?.toLocaleString(undefined, { maximumFractionDigits: 0 })} XP
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Click to load</span>
                      )}
                      {readyCount > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[--color-ready]/20 border border-[--color-ready]/30 text-[--color-ready] animate-pulse">
                          {readyCount} ready
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeAccount(u)
                      if (usernames.filter((n) => n !== u).length === 0) setSwitchOpen(false)
                    }}
                    className="flex-shrink-0 size-6 flex items-center justify-center rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title={`Remove ${u}`}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              )
            })}

            {/* Add new account shortcut */}
            <button
              onClick={() => setSwitchOpen(false)}
              className="flex items-center justify-center gap-2 px-5 py-4 text-xs font-semibold text-muted-foreground hover:text-primary hover:bg-muted/20 transition-all border-dashed"
            >
              <Plus className="size-3.5" />
              Add a new account
            </button>
          </div>
          )} {/* end switchView ternary */}
        </DialogContent>
      </Dialog>

    </div>
  )
}
