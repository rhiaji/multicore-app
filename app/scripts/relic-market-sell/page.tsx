"use client"

import { useState, useRef, useCallback } from "react"
import {
  Play,
  Lock,
  Unlock,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Terminal,
  KeyRound,
  ScanSearch,
  Zap,
  ClipboardPaste,
  MinusCircle,
  Users,
  X,
  TriangleAlert,
  ArrowLeftRight,
  Tag,
  RefreshCw,
  SlidersHorizontal,
  Settings,
} from "lucide-react"
import Link from "next/link"
import { HiveLoginNav } from "@/components/market/hive-login-nav"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { decryptAccounts } from "@/lib/encryption"
import { runRelicMarketSell } from "@/lib/server-events/relic-market-sell/action"


type PricingMode = "auto" | "fixed"

const RARITY_TIERS: { key: string; label: string; color: string }[] = [
  { key: "common_relics",    label: "Common",    color: "text-muted-foreground" },
  { key: "uncommon_relics",  label: "Uncommon",  color: "text-green-400"        },
  { key: "rare_relics",      label: "Rare",      color: "text-blue-400"         },
  { key: "epic_relics",      label: "Epic",      color: "text-purple-400"       },
  { key: "legendary_relics", label: "Legendary", color: "text-yellow-400"       },
]

// ── Types ─────────────────────────────────────────────────────────────────────

type StepId     = "decrypt" | "fetch" | "sell"
type StepStatus = "idle" | "running" | "done" | "error"
interface StepState { status: StepStatus; message: string }

interface AccountRow {
  username: string
  unlisted: number
  listed:   number
}

interface SellRow {
  username: string
  action:   "list" | "skip" | "already-listed"
  count:    number
  status:   "ok" | "error" | "skip" | "pending"
  message:  string
  txId?:    string
  byRarity?: Record<string, number>
}

interface LogLine {
  id: number; time: string; type: "info" | "ok" | "skip" | "error" | "system"; text: string
}

interface Summary {
  sellers:        number
  sellOk:         number
  sellSkip:       number
  sellError:      number
  listedByRarity: Record<string, number>
}

// ── Step metadata ─────────────────────────────────────────────────────────────

const STEP_META: { id: StepId; label: string; icon: React.ReactNode }[] = [
  { id: "decrypt", label: "Decrypt Keys",        icon: <KeyRound     className="size-4" /> },
  { id: "fetch",   label: "Fetch & List Relics", icon: <ScanSearch   className="size-4" /> },
  { id: "sell",    label: "Complete",            icon: <Tag          className="size-4" /> },
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
  sell:    { status: "idle", message: "" },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RelicMarketCyclePage() {
  // Sidebar drawer
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Config
  const [encryptedConfig,  setEncryptedConfig]  = useState("")
  const [encryptionKey,    setEncryptionKey]    = useState("")
  const [showKey,          setShowKey]          = useState(false)

  // Pricing config
  const [pricingMode, setPricingMode] = useState<PricingMode>("auto")
  const [autoFloor,   setAutoFloor]   = useState("0.1")
  const [fixedPrices, setFixedPrices] = useState<Record<string, string>>({
    common_relics:    "0.001",
    uncommon_relics:  "0.005",
    rare_relics:      "0.010",
    epic_relics:      "0.050",
    legendary_relics: "0.100",
  })

  // Runtime
  const [running,      setRunning]      = useState(false)
  const [steps,        setSteps]        = useState<Record<StepId, StepState>>(INITIAL_STEPS)
  const [accountRows,  setAccountRows]  = useState<AccountRow[]>([])
  const [sellRows,     setSellRows]     = useState<SellRow[]>([])
  const [logs,         setLogs]         = useState<LogLine[]>([])
  const [summary,      setSummary]      = useState<Summary | null>(null)
  const [showAccounts, setShowAccounts] = useState(false)

  const logIdRef           = useRef(0)
  const logContainerRef    = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const pushLog = useCallback((type: LogLine["type"], text: string) => {
    setLogs((prev) => [...prev, { id: logIdRef.current++, time: ts(), type, text }])
    setTimeout(() => {
      const el = logContainerRef.current
      if (el) el.scrollTop = el.scrollHeight
    }, 50)
  }, [])

  const reset = useCallback(() => {
    setSteps(INITIAL_STEPS)
    setAccountRows([])
    setSellRows([])
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
    pushLog("system", "Script started — Relic Market Sell")

    try {
      // Decrypt client-side — keys never leave the browser
      let sellers: { username: string; active_key: string; posting_key: string }[]
      try {
        const parsed   = JSON.parse(encryptedConfig)
        const accounts = decryptAccounts(parsed, encryptionKey)
        // Exclude main account from sellers — it is the buyer, not a seller
        sellers = accounts
        setSteps((prev) => ({ ...prev, decrypt: { status: "done", message: `${sellers.length} seller(s) decrypted.` } }))
        pushLog("ok", `[DECRYPT] ${sellers.length} seller(s) decrypted.`)
      } catch (err) {
        setSteps((prev) => ({ ...prev, decrypt: { status: "error", message: err instanceof Error ? err.message : "Decryption failed" } }))
        pushLog("error", `[DECRYPT] ${err instanceof Error ? err.message : "Decryption failed"}`)
        setRunning(false)
        return
      }

      const fp = Object.fromEntries(
        Object.entries(fixedPrices).map(([k, v]) => [k, parseFloat(v) || 0.001])
      ) as { common_relics: number; uncommon_relics: number; rare_relics: number; epic_relics: number; legendary_relics: number }

      const controller = new AbortController()
      abortControllerRef.current = controller

      for await (const evt of runRelicMarketSell(
        { sellers, pricingMode, autoFloor: parseFloat(autoFloor) || 0.1, fixedPrices: fp },
        controller.signal,
      )) {
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

          case "account":
            setAccountRows((prev) => {
              const idx = prev.findIndex((r) => r.username === evt.username)
              const row: AccountRow = {
                username: evt.username,
                unlisted: evt.unlisted,
                listed:   evt.listed,
              }
              if (idx >= 0) { const n = [...prev]; n[idx] = row; return n }
              return [...prev, row]
            })
            pushLog("info", `@${evt.username} — unlisted: ${evt.unlisted}, listed: ${evt.listed}`)
            break

          case "account-error":
            pushLog("error", `@${evt.username}: ${evt.message}`)
            break

          case "sell-action":
            setSellRows((prev) => [...prev, {
              username: evt.username,
              action:   evt.action,
              count:    evt.count,
              status:   evt.status,
              message:  evt.message,
              txId:     evt.txId,
              byRarity: evt.byRarity,
            }])
            pushLog(
              evt.status === "ok" ? "ok" : evt.status === "skip" ? "skip" : "error",
              `@${evt.username} — ${evt.message}`
            )
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
  }, [running, encryptedConfig, encryptionKey, pricingMode, autoFloor, fixedPrices, reset, pushLog])

  const canRun = !!encryptedConfig && !!encryptionKey && !running

  const activeStepIndex = STEP_META.findIndex((s) => steps[s.id].status === "running")

  const totalListed  = sellRows.filter((r) => r.status === "ok").length
  const totalSkipped = sellRows.filter((r) => r.status === "skip").length
  const totalErrors  = sellRows.filter((r) => r.status === "error").length

  // Aggregate relic counts per rarity from all successful sell rows
  const listedByRarity = sellRows
    .filter((r) => r.status === "ok" && r.byRarity)
    .reduce((acc, r) => {
      for (const [k, v] of Object.entries(r.byRarity!)) {
        acc[k] = (acc[k] ?? 0) + v
      }
      return acc
    }, {} as Record<string, number>)

  // Use summary listedByRarity if available (after done event)
  const rarityBreakdown = summary?.listedByRarity ?? listedByRarity
  const totalRelicsListed = Object.values(rarityBreakdown).reduce((s, v) => s + v, 0)

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
              Relic Market Sell
            </span>
          </div>
          <HiveLoginNav />
        </div>
      </header>

      {/* ── Settings Drawer ── */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="left" className="w-[300px] p-0 flex flex-col font-mono">
          <SheetHeader className="px-4 pt-4 pb-3 border-b border-border flex-shrink-0">
            <SheetTitle className="flex items-center gap-2 text-sm font-bold">
              <ArrowLeftRight className="size-4 text-primary" />
              Relic Market Sell
            </SheetTitle>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Decrypt seller accounts and automatically list all their relics on the market using auto-price.
            </p>
          </SheetHeader>

          <div className="p-4 space-y-4 flex-1 overflow-y-auto">
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
                placeholder={"{'accounts':[...],'version':'1.0'}"}
                disabled={running}
                rows={4}
                className="w-full p-2.5 text-[10px] font-mono bg-muted border border-border rounded-lg focus:outline-none focus:border-primary resize-none disabled:opacity-50 placeholder:text-muted-foreground/40"
              />
              <p className="text-[10px] text-muted-foreground">
                Output from the{" "}
                <Link href="/scripts" className="text-primary hover:underline">Encrypt</Link>{" "}
                step
              </p>
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

            {/* ── Pricing Config ── */}
            <div className="space-y-3 pt-1 border-t border-border">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="size-3.5 text-primary" />
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Pricing Mode
                </label>
              </div>

              {/* Mode toggle */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setPricingMode("auto")}
                  disabled={running}
                  className={`py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-colors disabled:opacity-50 ${
                    pricingMode === "auto"
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-muted border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  Auto Total
                </button>
                <button
                  onClick={() => setPricingMode("fixed")}
                  disabled={running}
                  className={`py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-colors disabled:opacity-50 ${
                    pricingMode === "fixed"
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-muted border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  Fixed/Relic
                </button>
              </div>

              {/* Auto mode: single floor input */}
              {pricingMode === "auto" && (
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground">
                    Total listing price (HIVE)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0.001"
                      step="0.01"
                      value={autoFloor}
                      onChange={(e) => setAutoFloor(e.target.value)}
                      disabled={running}
                      className="w-full p-2.5 pr-14 text-[11px] font-mono bg-muted border border-border rounded-lg focus:outline-none focus:border-primary disabled:opacity-50"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">HIVE</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    {"Unit price = " + (autoFloor || "0.1") + " / quantity. Every listing sells for this total."}
                  </p>
                </div>
              )}

              {/* Fixed mode: per-rarity inputs */}
              {pricingMode === "fixed" && (
                <div className="space-y-2">
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Price per single relic unit for each rarity.
                  </p>
                  {RARITY_TIERS.map((tier) => (
                    <div key={tier.key} className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold w-[72px] flex-shrink-0 ${tier.color}`}>
                        {tier.label}
                      </span>
                      <div className="relative flex-1">
                        <input
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={fixedPrices[tier.key] ?? "0.001"}
                          onChange={(e) =>
                            setFixedPrices((prev) => ({ ...prev, [tier.key]: e.target.value }))
                          }
                          disabled={running}
                          className="w-full p-2 pr-10 text-[11px] font-mono bg-muted border border-border rounded-lg focus:outline-none focus:border-primary disabled:opacity-50"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground pointer-events-none">HIVE</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                    <XCircle className="size-3.5" /> Stop
                  </button>
                )}
                <button
                  onClick={handleRun}
                  disabled={!canRun}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-primary/50 text-primary text-[10px] font-bold uppercase tracking-wider hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {running ? <><Loader2 className="size-3.5 animate-spin" /> Running</> : <><Play className="size-3.5" /> Run</>}
                </button>
              </div>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {accountRows.length === 0 && sellRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                  <ArrowLeftRight className="size-8 opacity-20" />
                  <p className="text-[11px]">Configure the script and press Run to start</p>
                </div>
              ) : (
                <div className="p-4 space-y-4">

                  {/* Stat cards + Show Accounts */}
                  {accountRows.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sell Status</p>
                        <button
                          onClick={() => setShowAccounts(true)}
                          className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border border-border hover:border-primary/40 hover:text-primary text-muted-foreground transition-colors"
                        >
                          <Users className="size-3" />
                          Show Accounts
                          <span className="ml-0.5 text-[9px] font-normal opacity-60">({accountRows.length})</span>
                        </button>
                      </div>

                      <div className="flex flex-col gap-2">
                        {/* Listed Relics — full-width relic tile card */}
                        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-green-400/70">Listed Relics</span>
                            <Tag className="size-3 text-green-400/50" />
                          </div>
                          <div className="flex items-baseline gap-2 mb-3">
                            <p className="text-2xl font-bold text-green-400 leading-none font-mono">
                              {totalRelicsListed.toFixed(2)}
                            </p>
                            <p className="text-[9px] text-muted-foreground">
                              total qty across {totalListed} seller(s)
                            </p>
                          </div>
                          {/* Per-rarity relic image tiles */}
                          <div className="grid grid-cols-5 gap-1.5">
                            {RARITY_TIERS.map((tier) => {
                              const qty = rarityBreakdown[tier.key] ?? 0
                              return (
                                <div
                                  key={tier.key}
                                  className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 transition-opacity ${
                                    qty === 0
                                      ? "border-border bg-muted/20 opacity-30"
                                      : "border-border bg-muted/30"
                                  }`}
                                >
                                  <img
                                    src={`https://www.terracoregame.com/images/relics/${tier.key.replace("_relics", "")}.png`}
                                    alt={tier.label}
                                    width={32}
                                    height={32}
                                    className="size-8 object-contain"
                                    crossOrigin="anonymous"
                                  />
                                  <span className={`text-[8px] font-semibold uppercase tracking-wider ${tier.color}`}>
                                    {tier.label}
                                  </span>
                                  <span className={`text-xs font-bold font-mono leading-none ${qty > 0 ? tier.color : "text-muted-foreground"}`}>
                                    {qty > 0 ? qty.toFixed(2) : "—"}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        {/* Skipped + Errors side by side */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-yellow-400/70">Skipped</span>
                              <MinusCircle className="size-3 text-yellow-400/50" />
                            </div>
                            <p className="text-2xl font-bold text-yellow-400 leading-none">{totalSkipped}</p>
                            <p className="text-[9px] text-muted-foreground mt-1">no relics / already listed</p>
                          </div>

                          <div className={`rounded-lg border p-3 ${totalErrors > 0 ? "border-red-500/20 bg-red-500/5" : "border-border bg-muted/20"}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className={`text-[9px] font-bold uppercase tracking-wider ${totalErrors > 0 ? "text-red-400/70" : "text-muted-foreground"}`}>Errors</span>
                              <TriangleAlert className={`size-3 ${totalErrors > 0 ? "text-red-400/50" : "text-muted-foreground/30"}`} />
                            </div>
                            <p className={`text-2xl font-bold leading-none ${totalErrors > 0 ? "text-red-400" : "text-muted-foreground"}`}>{totalErrors}</p>
                            <p className="text-[9px] text-muted-foreground mt-1">failed listings</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Accounts drawer */}
                  <Sheet open={showAccounts} onOpenChange={setShowAccounts}>
                    <SheetContent side="right" className="w-[480px] p-0 flex flex-col font-mono">
                      <SheetHeader className="px-5 py-3 border-b border-border flex-shrink-0">
                        <SheetTitle className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
                          <Users className="size-4 text-primary" />
                          Account Actions
                          <span className="text-[10px] text-muted-foreground font-normal normal-case tracking-normal">({accountRows.length})</span>
                        </SheetTitle>
                      </SheetHeader>
                      <div className="flex-1 overflow-y-auto p-4">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Account</th>
                              <th className="text-left pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Relics</th>
                              <th className="text-right pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Result</th>
                            </tr>
                          </thead>
                          <tbody>
                            {accountRows.map((acct) => {
                              const row    = sellRows.find((r) => r.username === acct.username)
                              const status = row?.status ?? "skip"
                              const count  = row?.count  ?? acct.unlisted
                              return (
                                <tr key={acct.username} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                                  <td className="py-2 font-bold">@{acct.username}</td>
                                  <td className="py-2 text-muted-foreground">
                                    {row
                                      ? <span className="font-bold text-foreground">{count} type(s)</span>
                                      : <span>—</span>}
                                  </td>
                                  <td className="py-2 text-right">
                                    <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                                      status === "ok"
                                        ? "bg-green-500/10 text-green-400 border-green-500/20"
                                        : status === "error"
                                        ? "bg-red-500/10 text-red-400 border-red-500/20"
                                        : status === "pending"
                                        ? "bg-primary/10 text-primary border-primary/20"
                                        : "bg-muted/60 text-muted-foreground border-border"
                                    }`}>
                                      {status === "ok"
                                        ? <CheckCircle2 className="size-2.5" />
                                        : status === "error"
                                        ? <XCircle className="size-2.5" />
                                        : status === "pending"
                                        ? <Loader2 className="size-2.5 animate-spin" />
                                        : <MinusCircle className="size-2.5" />}
                                      {status}
                                    </span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </SheetContent>
                  </Sheet>
                </div>
              )}
            </div>
          </div>

          {/* ── Output log — stacked below content ── */}
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
                  <span className="text-[10px]">Configure the script and press Run to start</span>
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
