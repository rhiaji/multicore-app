"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import {
  Play,
  Lock,
  Unlock,
  CheckCircle2,
  XCircle,
  Loader2,
  KeyRound,
  ScanSearch,
  ShoppingCart,
  ClipboardPaste,
  Settings,
  ChevronRight,
  Terminal,
  Square,
  Users,
} from "lucide-react"
import Link from "next/link"
import { HiveLoginNav } from "@/components/market/hive-login-nav"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { decryptAccounts } from "@/lib/encryption"
import { runRelicMarketBuy } from "@/lib/server-events/relic-market-buy/action"


// ── Types ─────────────────────────────────────────────────────────────────────

type StepId     = "decrypt" | "fetch" | "buy"
type StepStatus = "idle" | "running" | "done" | "error"
interface StepState { status: StepStatus; message: string }

interface AccountChecked {
  username:     string
  listed:       number
  added:        number
  pendingTotal: number
  status:       "ok" | "error"
  message?:     string
}

interface BuyAction {
  batchIndex: number
  seller:     string
  type:       string
  amount:     number
  price:      string
  status:     "ok" | "error"
  txId?:      string
  message:    string
}

interface BuyPlanListing {
  seller:    string
  type:      string
  amount:    number
  unitPrice: string
  lineTotal: string
}

interface BuyBatch {
  batchIndex: number
  listings:   BuyPlanListing[]
  totalHive:  string
}

interface Summary {
  buyer:     string
  batches:   number
  listings:  number
  totalHive: string
  buyOk:     number
  buyError:  number
}

interface LogLine {
  id: number; time: string; type: "info" | "ok" | "skip" | "error" | "system"; text: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RARITY_COLORS: Record<string, string> = {
  common_relics:    "text-zinc-300 border-zinc-500/40 bg-zinc-600/20",
  uncommon_relics:  "text-green-400 border-green-500/40 bg-green-500/10",
  rare_relics:      "text-blue-400 border-blue-400/40 bg-blue-400/10",
  epic_relics:      "text-purple-400 border-purple-400/40 bg-purple-400/10",
  legendary_relics: "text-amber-400 border-amber-400/40 bg-amber-400/10",
}

const RARITY_LABELS: Record<string, string> = {
  common_relics:    "Common",
  uncommon_relics:  "Uncommon",
  rare_relics:      "Rare",
  epic_relics:      "Epic",
  legendary_relics: "Legendary",
}

const STEP_META: { id: StepId; label: string; icon: React.ReactNode }[] = [
  { id: "decrypt", label: "Decrypt Key",  icon: <KeyRound     className="size-4" /> },
  { id: "fetch",   label: "Fetch Market", icon: <ScanSearch   className="size-4" /> },
  { id: "buy",     label: "Buy",          icon: <ShoppingCart className="size-4" /> },
]

const STEP_STATUS_COLOR: Record<StepStatus, string> = {
  idle:    "text-muted-foreground border-border bg-muted/30",
  running: "text-primary border-primary bg-primary/10 animate-pulse",
  done:    "text-green-400 border-green-500/40 bg-green-500/10",
  error:   "text-destructive border-destructive/40 bg-destructive/10",
}

const STEP_STATUS_ICON: Record<StepStatus, React.ReactNode> = {
  idle:    <span className="size-2 rounded-full bg-muted-foreground/40 inline-block" />,
  running: <Loader2      className="size-3.5 animate-spin" />,
  done:    <CheckCircle2 className="size-3.5" />,
  error:   <XCircle      className="size-3.5" />,
}

const LOG_COLOR: Record<string, string> = {
  system: "text-primary",
  ok:     "text-green-400",
  skip:   "text-yellow-400",
  error:  "text-red-400",
  info:   "text-muted-foreground",
}

function ts() {
  return new Date().toLocaleTimeString("en-US", { hour12: false })
}

const INITIAL_STEPS: Record<StepId, StepState> = {
  decrypt: { status: "idle", message: "" },
  fetch:   { status: "idle", message: "" },
  buy:     { status: "idle", message: "" },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RelicMarketBuyPage() {
  const [settingsOpen,  setSettingsOpen]  = useState(false)
  const [showAccounts,  setShowAccounts]  = useState(false)

  // Config
  const [encryptedConfig,   setEncryptedConfig]   = useState("")
  const [encryptionKey,     setEncryptionKey]     = useState("")
  const [showKey,           setShowKey]           = useState(false)
  const [decryptedAccounts, setDecryptedAccounts] = useState<{ username: string }[]>([])
  const [buyerUsername,     setBuyerUsername]     = useState("")

  // Runtime
  const [running,          setRunning]          = useState(false)
  const [steps,            setSteps]            = useState<Record<StepId, StepState>>(INITIAL_STEPS)
  const [accountsChecked,  setAccountsChecked]  = useState<AccountChecked[]>([])
  const [batches,          setBatches]          = useState<BuyBatch[]>([])
  const [buyActions,       setBuyActions]       = useState<BuyAction[]>([])
  const [pendingCount,     setPendingCount]      = useState(0)
  const [logs,             setLogs]             = useState<LogLine[]>([])
  const [summary,          setSummary]          = useState<Summary | null>(null)

  const logIdRef           = useRef(0)
  const logContainerRef    = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Preview-decrypt config to populate buyer selector
  useEffect(() => {
    if (!encryptedConfig || !encryptionKey) {
      setDecryptedAccounts([])
      setBuyerUsername("")
      return
    }
    try {
      const parsed   = JSON.parse(encryptedConfig)
      const accounts = decryptAccounts(parsed, encryptionKey)
      setDecryptedAccounts(accounts)
      if (accounts.length > 0 && !accounts.find((a) => a.username === buyerUsername)) {
        setBuyerUsername(accounts[0].username)
      }
    } catch {
      setDecryptedAccounts([])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encryptedConfig, encryptionKey])

  const pushLog = useCallback((type: LogLine["type"], text: string) => {
    setLogs((prev) => [...prev, { id: logIdRef.current++, time: ts(), type, text }])
    setTimeout(() => {
      const el = logContainerRef.current
      if (el) el.scrollTop = el.scrollHeight
    }, 50)
  }, [])

  const reset = useCallback(() => {
    setSteps(INITIAL_STEPS)
    setAccountsChecked([])
    setBatches([])
    setBuyActions([])
    setPendingCount(0)
    setLogs([])
    setSummary(null)
  }, [])

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort()
    setRunning(false)
    pushLog("system", "Script stopped by user.")
  }, [pushLog])

  const handleRun = useCallback(async () => {
    if (running) return
    setRunning(true)
    reset()
    pushLog("system", "Script started — Relic Market Buy")

    try {
      // Decrypt client-side — keys never leave the browser
      let accounts: { username: string; active_key: string; posting_key: string }[]
      try {
        const parsed = JSON.parse(encryptedConfig)
        accounts     = decryptAccounts(parsed, encryptionKey)
        if (!accounts.length) throw new Error("No accounts found in config")
        const buyer = accounts.find((a) => a.username === buyerUsername)
        if (!buyer) throw new Error(`Buyer "@${buyerUsername}" not found in config`)
        setSteps((prev) => ({ ...prev, decrypt: { status: "done", message: `${accounts.length} account(s) decrypted. Buyer: @${buyerUsername}, ${accounts.length - 1} seller(s).` } }))
        pushLog("ok", `[DECRYPT] ${accounts.length} account(s) decrypted. Buyer: @${buyerUsername}, ${accounts.length - 1} seller(s).`)
      } catch (err) {
        setSteps((prev) => ({ ...prev, decrypt: { status: "error", message: err instanceof Error ? err.message : "Decryption failed" } }))
        pushLog("error", `[DECRYPT] ${err instanceof Error ? err.message : "Decryption failed"}`)
        setRunning(false)
        return
      }

      const controller = new AbortController()
      abortControllerRef.current = controller

      for await (const evt of runRelicMarketBuy({ accounts, buyerUsername }, controller.signal)) {
        switch (evt.type) {
          case "step":
            setSteps((prev) => ({
              ...prev,
              [evt.step]: { status: evt.status, message: evt.message },
            }))
            pushLog(
              evt.status === "error" ? "error" : evt.status === "done" ? "ok" : "info",
              `[${evt.step.toUpperCase()}] ${evt.message}`
            )
            break

          case "account-checked":
            setAccountsChecked((prev) => [...prev, {
              username:     evt.username,
              listed:       evt.listed,
              added:        evt.added,
              pendingTotal: evt.pendingTotal,
              status:       evt.status,
              message:      evt.message,
            }])
            setPendingCount(evt.pendingTotal)
            pushLog(
              evt.status === "error" ? "error" : evt.added > 0 ? "ok" : "info",
              `@${evt.username} — ${evt.listed} listed, ${evt.added} added to batch (cache: ${evt.pendingTotal})`
            )
            break

          case "buy-plan":
            setBatches((prev) => [...prev, {
              batchIndex: evt.batchIndex,
              listings:   evt.listings,
              totalHive:  evt.totalHive,
            }])
            pushLog("info", `Batch #${evt.batchIndex}: ${evt.listings.length} listing(s) — ${evt.totalHive} HIVE`)
            break

          case "buy-action":
            setBuyActions((prev) => [...prev, {
              batchIndex: evt.batchIndex,
              seller:     evt.seller,
              type:       evt.type_relic,
              amount:     evt.amount,
              price:      evt.price,
              status:     evt.status,
              txId:       evt.txId,
              message:    evt.message,
            }])
            pushLog(evt.status === "ok" ? "ok" : "error", evt.message)
            break

          case "error":
            pushLog("error", evt.message)
            break

          case "done":
            if (evt.summary) setSummary(evt.summary)
            pushLog("system", evt.success ? "Script completed." : "Script finished with errors.")
            break
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        pushLog("error", err instanceof Error ? err.message : "Unknown error")
      }
    } finally {
      setRunning(false)
    }
  }, [running, encryptedConfig, encryptionKey, buyerUsername, reset, pushLog])

  const canRun = !!encryptedConfig && !!encryptionKey && !!buyerUsername && decryptedAccounts.length > 1 && !running

  const totalOk    = buyActions.filter((a) => a.status === "ok").length
  const totalError = buyActions.filter((a) => a.status === "error").length
  const totalHiveSpent = batches.reduce((s, b) => s + parseFloat(b.totalHive), 0)

  const activeStepIndex = STEP_META.findIndex((s) => steps[s.id].status === "running")

  return (
    <div className="min-h-screen bg-background text-foreground font-mono flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm flex-shrink-0">
        <div className="px-6 h-12 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest"
            >
              Dashboard
            </Link>
            <span className="text-border">/</span>
            <Link
              href="/scripts"
              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest"
            >
              Scripts
            </Link>
            <span className="text-border">/</span>
            <span className="text-[11px] font-semibold text-primary uppercase tracking-widest">
              Relic Market Buy
            </span>
          </div>
          <HiveLoginNav />
        </div>
      </header>

      {/* Settings Drawer */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="left" className="w-[300px] p-0 flex flex-col font-mono">
          <SheetHeader className="px-4 pt-4 pb-3 border-b border-border flex-shrink-0">
            <SheetTitle className="flex items-center gap-2 text-sm font-bold">
              <ShoppingCart className="size-4 text-primary" />
              Relic Market Buy
            </SheetTitle>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Paste your encrypted config, pick a buyer, and purchase relics listed by all other accounts in the config.
            </p>
          </SheetHeader>

          <div className="p-4 space-y-5 flex-1 overflow-y-auto">

            {/* Encrypted Config */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Encrypted Config
                </label>
                <button
                  onClick={() => navigator.clipboard.readText().then(setEncryptedConfig).catch(() => {})}
                  className="inline-flex items-center gap-1 text-[9px] text-muted-foreground hover:text-primary transition-colors"
                >
                  <ClipboardPaste className="size-3" /> Paste
                </button>
              </div>
              <textarea
                value={encryptedConfig}
                onChange={(e) => setEncryptedConfig(e.target.value)}
                placeholder={'{"accounts":[{"username":"...","encryptedPrivate":"..."}],"version":"1.0"}'}
                disabled={running}
                rows={4}
                className="w-full p-2.5 text-[10px] font-mono bg-muted border border-border rounded-lg focus:outline-none focus:border-primary resize-none disabled:opacity-50 placeholder:text-muted-foreground/40"
              />
            </div>

            {/* Encryption Key */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Encryption Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={encryptionKey}
                  onChange={(e) => setEncryptionKey(e.target.value)}
                  placeholder="64-char hex key"
                  disabled={running}
                  className="w-full pr-8 p-2.5 text-[11px] font-mono bg-muted border border-border rounded-lg focus:outline-none focus:border-primary disabled:opacity-50 placeholder:text-muted-foreground/40"
                />
                <button
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showKey ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
                </button>
              </div>
            </div>

            {/* Buyer input — always visible, shows match status once config decrypts */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Main Buyer Account
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-[11px] font-mono select-none">@</span>
                <input
                  type="text"
                  value={buyerUsername}
                  onChange={(e) => setBuyerUsername(e.target.value.replace(/^@/, "").trim())}
                  placeholder="username"
                  disabled={running}
                  className="w-full pl-6 p-2.5 text-[11px] font-mono bg-muted border border-border rounded-lg focus:outline-none focus:border-primary disabled:opacity-50 placeholder:text-muted-foreground/40"
                />
                {decryptedAccounts.length > 0 && buyerUsername && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    {decryptedAccounts.find((a) => a.username === buyerUsername)
                      ? <CheckCircle2 className="size-3.5 text-primary" />
                      : <XCircle     className="size-3.5 text-destructive" />
                    }
                  </span>
                )}
              </div>
              {/* Quick-pick chips once config decrypts */}
              {decryptedAccounts.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {decryptedAccounts.map((a) => (
                    <button
                      key={a.username}
                      onClick={() => setBuyerUsername(a.username)}
                      disabled={running}
                      className={cn(
                        "text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors",
                        a.username === buyerUsername
                          ? "border-primary text-primary bg-primary/10"
                          : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      )}
                    >
                      @{a.username}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                This account sends HIVE to the market contract. All other accounts in the config are sellers.
              </p>
            </div>

          </div>
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Main panel ── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">

            {/* Pipeline */}
            <div className="border-b border-border px-4 py-3 flex items-center gap-2 flex-shrink-0 overflow-x-auto">
              {/* Settings trigger — far left */}
              <button
                onClick={() => setSettingsOpen(true)}
                className="flex-shrink-0 p-1.5 rounded-md border border-border text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-colors mr-1"
                aria-label="Open script settings"
              >
                <Settings className="size-3.5" />
              </button>

              {STEP_META.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2 flex-shrink-0">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider transition-all ${STEP_STATUS_COLOR[steps[s.id].status]}`}>
                    {STEP_STATUS_ICON[steps[s.id].status]}
                    {s.icon}
                    <span>{s.label}</span>
                  </div>
                  {i < STEP_META.length - 1 && (
                    <ChevronRight className={`size-3.5 flex-shrink-0 transition-colors ${
                      i < (activeStepIndex === -1 ? 0 : activeStepIndex) ? "text-primary" : "text-border"
                    }`} />
                  )}
                </div>
              ))}

              {/* Run / Stop — far right */}
              <div className="ml-auto flex items-center gap-2 flex-shrink-0">

                {running && (
                  <button
                    onClick={handleStop}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-destructive/50 text-destructive text-[10px] font-bold uppercase tracking-wider hover:bg-destructive/10 transition-colors"
                  >
                    <Square className="size-3.5" /> Stop
                  </button>
                )}
                <button
                  onClick={handleRun}
                  disabled={!canRun}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-primary/50 text-primary text-[10px] font-bold uppercase tracking-wider hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title={!encryptedConfig ? "Paste config in settings" : !encryptionKey ? "Enter key in settings" : !buyerUsername ? "Select a buyer account" : decryptedAccounts.length < 2 ? "Need at least 2 accounts (1 buyer + sellers)" : "Run script"}
                >
                  {running
                    ? <><Loader2 className="size-3.5 animate-spin" /> Running</>
                    : <><Play className="size-3.5" /> Run</>
                  }
                </button>
              </div>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {!running && logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                  <ShoppingCart className="size-8 text-muted-foreground/20" />
                  <div>
                    <p className="text-[13px] font-bold text-foreground">Relic Market Buy</p>
                    <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">
                      Paste your encrypted config and select the buyer account. All other accounts in the config will be the sellers.
                    </p>
                  </div>
                  <button
                    onClick={() => setSettingsOpen(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                  >
                    <Settings className="size-3.5" />
                    Open Settings
                  </button>
                </div>
              ) : (
                <div className="p-4 space-y-4">

                  {/* Pending cache indicator — shows while running */}
                  {running && pendingCount > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 text-[11px] font-mono">
                      <Loader2 className="size-3.5 text-primary animate-spin flex-shrink-0" />
                      <span className="text-primary font-semibold">{pendingCount}</span>
                      <span className="text-muted-foreground">listing(s) accumulated — waiting for batch threshold ({25})</span>
                    </div>
                  )}

                  {/* Stats row */}
                  {(accountsChecked.length > 0 || batches.length > 0) && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Buy Status</p>
                        <button
                          onClick={() => setShowAccounts(true)}
                          className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border border-border hover:border-primary/40 hover:text-primary text-muted-foreground transition-colors"
                        >
                          <Users className="size-3" />
                          Show Accounts
                          <span className="ml-0.5 text-[9px] font-normal opacity-60">({accountsChecked.length})</span>
                        </button>
                      </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg border border-border bg-muted/20 p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Checked</p>
                        <p className="text-xl font-bold font-mono text-foreground">{accountsChecked.length}</p>
                        <p className="text-[9px] text-muted-foreground">accounts</p>
                      </div>
                      <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-green-400/70 mb-1">Bought</p>
                        <p className="text-xl font-bold font-mono text-green-400">{totalOk}</p>
                        <p className="text-[9px] text-muted-foreground">{batches.length} batch(es)</p>
                      </div>
                      <div className={cn("rounded-lg border p-3", totalError > 0 ? "border-red-500/20 bg-red-500/5" : "border-border bg-muted/20")}>
                        <p className={cn("text-[9px] font-bold uppercase tracking-wider mb-1", totalError > 0 ? "text-red-400/70" : "text-muted-foreground")}>Errors</p>
                        <p className={cn("text-xl font-bold font-mono", totalError > 0 ? "text-red-400" : "text-muted-foreground")}>{totalError}</p>
                        <p className="text-[9px] text-muted-foreground">{totalHiveSpent.toFixed(3)} HIVE</p>
                      </div>
                      </div>
                    </div>
                  )}

                  {/* Accounts Checked Sheet */}
                  <Sheet open={showAccounts} onOpenChange={setShowAccounts}>
                    <SheetContent side="right" className="w-[480px] p-0 flex flex-col font-mono">
                      <SheetHeader className="px-5 py-3 border-b border-border flex-shrink-0">
                        <SheetTitle className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
                          <Users className="size-4 text-primary" />
                          Accounts Checked
                          <span className="text-[10px] text-muted-foreground font-normal normal-case tracking-normal">({accountsChecked.length})</span>
                        </SheetTitle>
                      </SheetHeader>
                      <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-[11px]">
                          <thead className="sticky top-0 bg-card border-b border-border">
                            <tr>
                              <th className="text-left px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Account</th>
                              <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Listed</th>
                              <th className="text-right px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Added</th>
                            </tr>
                          </thead>
                          <tbody>
                            {accountsChecked.map((a, i) => (
                              <tr key={i} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                                <td className="px-5 py-2.5">
                                  <div className="flex items-center gap-2.5">
                                    <img
                                      src={`https://images.hive.blog/u/${a.username}/avatar/small`}
                                      alt={a.username}
                                      className="size-6 rounded-full flex-shrink-0"
                                      crossOrigin="anonymous"
                                      onError={(e) => { e.currentTarget.style.display = "none" }}
                                    />
                                    <span className="font-semibold text-foreground truncate">@{a.username}</span>
                                    {a.status === "error" && (
                                      <span className="text-[9px] text-destructive truncate">{a.message}</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{a.listed}</td>
                                <td className="px-5 py-2.5 text-right">
                                  {a.status === "error"
                                    ? <XCircle className="size-3.5 text-destructive ml-auto" />
                                    : a.added > 0
                                      ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary">+{a.added}</span>
                                      : <span className="text-[9px] text-muted-foreground/50">—</span>
                                  }
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </SheetContent>
                  </Sheet>

                  {/* Per-account check results — removed, now in the Sheet above */}

                  {/* Per-batch buy results */}
                  {batches.map((batch) => {
                    const batchActions = buyActions.filter((a) => a.batchIndex === batch.batchIndex)
                    const batchOk      = batchActions.filter((a) => a.status === "ok").length
                    const allDone      = batchActions.length === batch.listings.length
                    return (
                      <div key={batch.batchIndex}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Batch #{batch.batchIndex}
                          </p>
                          <span className={cn(
                            "text-[9px] font-bold px-1.5 py-0.5 rounded border",
                            allDone && batchOk === batch.listings.length
                              ? "border-green-500/30 bg-green-500/10 text-green-400"
                              : allDone
                                ? "border-red-500/30 bg-red-500/10 text-red-400"
                                : "border-primary/30 bg-primary/10 text-primary animate-pulse"
                          )}>
                            {allDone ? `${batchOk}/${batch.listings.length} ok` : "broadcasting..."} · {batch.totalHive} HIVE
                          </span>
                        </div>
                        <div className="border border-border rounded-xl overflow-hidden">
                          <div className="flex flex-col divide-y divide-border">
                            {batch.listings.map((l, i) => {
                              const action = batchActions.find((a) => a.seller === l.seller && a.type === l.type)
                              return (
                                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                                  <img
                                    src={`https://images.hive.blog/u/${l.seller}/avatar/small`}
                                    alt={l.seller}
                                    className="size-5 rounded-full flex-shrink-0"
                                    crossOrigin="anonymous"
                                    onError={(e) => { e.currentTarget.style.display = "none" }}
                                  />
                                  <span className="text-[11px] font-semibold text-foreground flex-1 truncate">@{l.seller}</span>
                                  <span className={cn(
                                    "text-[9px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0",
                                    RARITY_COLORS[l.type] ?? ""
                                  )}>
                                    {RARITY_LABELS[l.type] ?? l.type}
                                  </span>
                                  <div className="text-right flex-shrink-0">
                                    <p className="text-[11px] font-bold font-mono">{l.lineTotal} HIVE</p>
                                    <p className="text-[9px] text-muted-foreground font-mono">
                                      {l.amount} × {parseFloat(l.unitPrice).toFixed(3)}
                                    </p>
                                  </div>
                                  <div className="w-5 flex-shrink-0 flex items-center justify-center">
                                    {action?.status === "ok"    && <CheckCircle2 className="size-3.5 text-green-400" />}
                                    {action?.status === "error" && <XCircle      className="size-3.5 text-destructive" />}
                                    {!action                    && <Loader2      className="size-3.5 animate-spin text-muted-foreground" />}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {/* Summary */}
                  {summary && (
                    <div className={cn(
                      "border rounded-xl px-5 py-4 flex items-center gap-4",
                      summary.buyError === 0
                        ? "border-green-500/30 bg-green-500/5"
                        : "border-destructive/30 bg-destructive/5"
                    )}>
                      <div className={cn(
                        "size-10 rounded-full flex items-center justify-center flex-shrink-0",
                        summary.buyError === 0
                          ? "bg-green-500/20 border border-green-500/30"
                          : "bg-destructive/20 border border-destructive/30"
                      )}>
                        {summary.buyError === 0
                          ? <CheckCircle2 className="size-5 text-green-400" />
                          : <XCircle      className="size-5 text-destructive" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground">
                          {summary.buyError === 0 ? "Purchases Complete" : "Finished With Errors"}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                          @{summary.buyer} · {summary.batches} batch(es) · {summary.listings} listing(s) · {summary.totalHive} HIVE
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-bold font-mono text-green-400">{summary.buyOk} ok</p>
                        {summary.buyError > 0 && (
                          <p className="text-xs font-bold font-mono text-destructive">{summary.buyError} error</p>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>
          </div>

          {/* ── Output log — docked at bottom ── */}
          <div className="h-52 flex-shrink-0 border-t border-border flex flex-col">
            <div className="px-4 py-2 border-b border-border flex items-center gap-2 flex-shrink-0">
              <Terminal className="size-3.5 text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Output Log</span>
              {logs.length > 0 && (
                <span className="ml-auto text-[9px] text-muted-foreground">{logs.length} lines</span>
              )}
            </div>
            <div ref={logContainerRef} className="flex-1 overflow-y-auto p-3 space-y-0.5">
              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground/40">
                  <span className="text-2xl font-mono">&gt;_</span>
                  <span className="text-[10px]">Waiting for run...</span>
                </div>
              ) : (
                logs.map((l) => (
                  <div key={l.id} className="flex gap-2 text-[10px] leading-5">
                    <span className="text-muted-foreground/50 flex-shrink-0 select-none">{l.time}</span>
                    <span className={LOG_COLOR[l.type]}>{l.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
