"use client"

import { useState, useRef, useCallback } from "react"
import {
  Play,
  Square,
  Lock,
  Unlock,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Terminal,
  KeyRound,
  Zap,
  ClipboardPaste,
  Settings,
  Swords,
  Users,
  TriangleAlert,
  Coins,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
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
import { runAutoClaimBattle } from "@/lib/server-events/auto-claim-battle/action"


// ── Types ─────────────────────────────────────────────────────────────────────

type StepId     = "decrypt" | "execute"
type StepStatus = "idle" | "running" | "done" | "error"
interface StepState { status: StepStatus; message: string }

interface PlayerRow {
  username:  string
  attacks:   number
  maxAttacks: number
  claims:    number
  lastclaim: number
  minerate:  number
  scrap:     number
}

interface AccountAction {
  username: string
  action:   string
  reason?:  string
  count?:   number
  targets?: string[]
  txId?:    string
  minerate?: string
  message?: string
}

interface LogLine {
  id: number; time: string; type: "info" | "ok" | "skip" | "error" | "system"; text: string
}

interface Summary {
  accounts:     number
  totalClaimed: number
  totalSkipped: number
  totalAttacks: number
  totalErrors:  number
}

// ── Script settings (mirrors settings.js exactly, minus debug) ────────────────

interface ScriptSettings {
  scrapRequirement: { enabled: boolean; multiplier: number }
  manualClaim:      { enabled: boolean }
  attacks: { enabled: boolean; minimumRequired: number }
}

const DEFAULT_SETTINGS: ScriptSettings = {
  scrapRequirement: { enabled: true,  multiplier: 4 },
  manualClaim:      { enabled: false },
  attacks: { enabled: true, minimumRequired: 2 },
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STEP_META: { id: StepId; label: string; icon: React.ReactNode }[] = [
  { id: "decrypt", label: "Decrypt Keys", icon: <KeyRound className="size-3.5" /> },
  { id: "execute", label: "Execute",      icon: <Zap      className="size-3.5" /> },
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
  error:  "text-destructive",
  info:   "text-muted-foreground",
}

function ts() {
  return new Date().toLocaleTimeString("en-US", { hour12: false })
}

function makeSteps(): Record<StepId, StepState> {
  return {
    decrypt: { status: "idle", message: "" },
    execute: { status: "idle", message: "" },
  }
}

// ── Small reusable toggle ─────────────────────────────────────────────────────

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => onChange(!value)}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1 text-[10px] font-bold transition-colors disabled:opacity-50",
        value ? "text-primary" : "text-muted-foreground"
      )}
    >
      {value
        ? <ToggleRight className="size-5 text-primary" />
        : <ToggleLeft  className="size-5 text-muted-foreground" />}
      {value ? "On" : "Off"}
    </button>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AutoClaimBattlePage() {
  // Settings state
  const [settingsOpen,    setSettingsOpen]    = useState(false)
  const [encryptedConfig, setEncryptedConfig] = useState("")
  const [encryptionKey,   setEncryptionKey]   = useState("")
  const [showKey,         setShowKey]         = useState(false)
  const [config,          setConfig]          = useState<ScriptSettings>(DEFAULT_SETTINGS)

  // Run state
  const [running,      setRunning]      = useState(false)
  const [steps,        setSteps]        = useState<Record<StepId, StepState>>(makeSteps())
  const [players,      setPlayers]      = useState<PlayerRow[]>([])
  const [actions,      setActions]      = useState<AccountAction[]>([])
  const [logs,         setLogs]         = useState<LogLine[]>([])
  const [summary,      setSummary]      = useState<Summary | null>(null)
  const [showAccounts, setShowAccounts] = useState(false)
  const logIdRef           = useRef(0)
  const logContainerRef    = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  function addLog(type: LogLine["type"], text: string) {
    const line: LogLine = { id: logIdRef.current++, time: ts(), type, text }
    setLogs((prev) => [...prev, line])
    setTimeout(() => {
      if (logContainerRef.current) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
      }
    }, 20)
  }

  function setStep(id: StepId, status: StepStatus, message = "") {
    setSteps((prev) => ({ ...prev, [id]: { status, message } }))
  }

  function patchConfig<K extends keyof ScriptSettings>(key: K, patch: Partial<ScriptSettings[K]>) {
    setConfig((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort()
    setRunning(false)
    addLog("error", "Script stopped by user.")
  }, [])

  const handleRun = useCallback(async () => {
    if (running) return
    setRunning(true)
    setSteps(makeSteps())
    setPlayers([])
    setActions([])
    setLogs([])
    setSummary(null)

    addLog("system", "=== Auto Claim & Battle started ===")

    try {
      // Decrypt client-side — keys never leave the browser
      setStep("decrypt", "running", "Decrypting accounts...")
      let accounts: { username: string; posting_key: string }[]
      try {
        const parsed = JSON.parse(encryptedConfig)
        accounts = decryptAccounts(parsed, encryptionKey).map((a) => ({
          username:    a.username,
          posting_key: a.posting_key ?? "",
        }))
        setStep("decrypt", "done", `${accounts.length} account(s) decrypted.`)
        addLog("ok", `[DECRYPT] ${accounts.length} account(s) decrypted.`)
      } catch (err) {
        setStep("decrypt", "error", err instanceof Error ? err.message : "Decryption failed")
        addLog("error", `[DECRYPT] ${err instanceof Error ? err.message : "Decryption failed"}`)
        setRunning(false)
        return
      }

      const controller = new AbortController()
      abortControllerRef.current = controller

      for await (const evt of runAutoClaimBattle({ accounts, settings: config }, controller.signal)) {
        const { type } = evt

        if (type === "step") {
          setStep(evt.step as StepId, evt.status as StepStatus, evt.message)
          const color: LogLine["type"] =
            evt.status === "done"    ? "ok"
            : evt.status === "error" ? "error"
            : evt.status === "running" ? "system"
            : "info"
          addLog(color, `[${evt.step.toUpperCase()}] ${evt.message}`)
        }

        else if (type === "player") {
          setPlayers((prev) => {
            const existing = prev.find((x) => x.username === evt.username)
            if (existing) return prev.map((x) => x.username === evt.username ? { ...x, ...evt } : x)
            return [...prev, evt]
          })
          addLog("info", `@${evt.username} — attacks: ${evt.attacks}/${evt.maxAttacks} | claims: ${evt.claims} | stash: ${(evt.scrap ?? 0).toFixed(4)} SCRAP | minerate: ${(evt.minerate ?? 0).toFixed(2)}/hr`)
        }

        else if (type === "player-error") {
          addLog("error", `@${evt.username} — failed to fetch: ${evt.message}`)
        }

        else if (type === "account-action") {
          setActions((prev) => [...prev, evt])
          if (evt.action === "skip")              addLog("skip",  `@${evt.username} — skipped: ${evt.reason}`)
          else if (evt.action === "attacks-start") addLog("info",  `@${evt.username} — attacking ${evt.count} target(s)...`)
          else if (evt.action === "attacks-done")  addLog("ok",    `@${evt.username} — hit ${evt.count} target(s): ${(evt.targets ?? []).join(", ")}`)
          else if (evt.action === "attacks-skip")  addLog("skip",  `@${evt.username} — attacks skipped: ${evt.reason}`)
          else if (evt.action === "attacks-error") addLog("error", `@${evt.username} — attack error: ${evt.message}`)
          else if (evt.action === "claim-ok")      addLog("ok",    `@${evt.username} — claimed TX:${evt.txId?.slice(0, 10)}...`)
          else if (evt.action === "claim-error")   addLog("error", `@${evt.username} — claim error: ${evt.message}`)
        }

        else if (type === "error") {
          addLog("error", `Error: ${evt.message}`)
        }

        else if (type === "done") {
          if (evt.summary) {
            setSummary(evt.summary)
          }
          addLog("system", `=== Script finished ===`)
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        addLog("error", `Unexpected error: ${(err as Error).message}`)
      }
    } finally {
      setRunning(false)
    }
  }, [running, encryptedConfig, encryptionKey, config])

  const canRun          = !!encryptedConfig && !!encryptionKey && !running
  const activeStepIndex = STEP_META.findIndex((s) => steps[s.id].status === "running")

  return (
    <div className="min-h-screen bg-background text-foreground font-mono flex flex-col">

      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm flex-shrink-0">
        <div className="px-6 h-12 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest">
              Dashboard
            </Link>
            <span className="text-border">/</span>
            <Link href="/scripts" className="text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest">
              Scripts
            </Link>
            <span className="text-border">/</span>
            <span className="text-[11px] font-semibold text-primary uppercase tracking-widest">
              Auto Claim &amp; Battle
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
              <Swords className="size-4 text-primary" />
              Auto Claim &amp; Battle
            </SheetTitle>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Decrypt multi-account config, attack targets based on your damage stat, then claim SCRAP per account.
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
              <p className="text-[10px] text-muted-foreground">Multi-account config — one posting key per account.</p>
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

            {/* Scrap Requirement */}
            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-3.5 text-primary" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Scrap Requirement</span>
                </div>
                <Toggle
                  value={config.scrapRequirement.enabled}
                  onChange={(v) => patchConfig("scrapRequirement", { enabled: v })}
                  disabled={running}
                />
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Only claim when stash &ge; minerate &times; multiplier.
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">Multiplier</span>
                <div className="flex gap-1">
                  {[2, 3, 4, 5, 6].map((n) => (
                    <button
                      key={n}
                      onClick={() => patchConfig("scrapRequirement", { multiplier: n })}
                      disabled={running || !config.scrapRequirement.enabled}
                      className={cn(
                        "w-7 py-1 rounded border text-[10px] font-bold transition-colors disabled:opacity-40",
                        config.scrapRequirement.multiplier === n
                          ? "bg-primary/15 border-primary/50 text-primary"
                          : "bg-muted border-border text-muted-foreground hover:border-primary/30"
                      )}
                    >
                      {n}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Manual Claim */}
            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Coins className="size-3.5 text-primary" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Manual Claim</span>
                </div>
                <Toggle
                  value={config.manualClaim.enabled}
                  onChange={(v) => patchConfig("manualClaim", { enabled: v })}
                  disabled={running}
                />
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Bypass scrap requirement and force claim regardless of stash.
              </p>
            </div>

            {/* Attacks */}
            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Swords className="size-3.5 text-primary" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Attacks</span>
                </div>
                <Toggle
                  value={config.attacks.enabled}
                  onChange={(v) => patchConfig("attacks", { enabled: v })}
                  disabled={running}
                />
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Min attacks needed before the attack sequence runs. Skips attacks (still claims) if below.
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">Min Required</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => patchConfig("attacks", { minimumRequired: n })}
                      disabled={running || !config.attacks.enabled}
                      className={cn(
                        "w-7 py-1 rounded border text-[10px] font-bold transition-colors disabled:opacity-40",
                        config.attacks.minimumRequired === n
                          ? "bg-primary/15 border-primary/50 text-primary"
                          : "bg-muted border-border text-muted-foreground hover:border-primary/30"
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Delays and Dry Run removed — defaults are hardcoded in the API route */}

          </div>
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">

            {/* Pipeline bar */}
            <div className="border-b border-border px-4 py-3 flex items-center gap-2 flex-shrink-0 overflow-x-auto">
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
                    <ChevronRight className={cn(
                      "size-3.5 flex-shrink-0 transition-colors",
                      i < (activeStepIndex === -1 ? 0 : activeStepIndex) ? "text-primary" : "text-border"
                    )} />
                  )}
                </div>
              ))}

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
                  title={!encryptedConfig ? "Paste config in settings" : !encryptionKey ? "Enter key in settings" : "Run script"}
                >
                  {running
                    ? <><Loader2 className="size-3.5 animate-spin" /> Running</>
                    : <><Play    className="size-3.5" /> Run</>}
                </button>
              </div>
            </div>

            {/* Content area */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {!running && logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                  <Swords className="size-8 opacity-20" />
                  <p className="text-[11px] text-center max-w-xs">
                    Configure your accounts and encryption key in settings, then click Run to auto-attack and claim SCRAP.
                  </p>
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

                  {/* Stats cards + Show Accounts button */}
                  {players.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Account Status</p>
                        <button
                          onClick={() => setShowAccounts(true)}
                          className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border border-border hover:border-primary/40 hover:text-primary text-muted-foreground transition-colors"
                        >
                          <Users className="size-3" />
                          Show Accounts
                          <span className="ml-0.5 text-[9px] font-normal opacity-60">({players.length})</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {/* Claimed */}
                        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-green-400/70">Claimed</span>
                            <Coins className="size-3 text-green-400/50" />
                          </div>
                          <p className="text-2xl font-bold text-green-400 leading-none font-mono">
                            {actions.filter((a) => a.action === "claim-ok").length}
                          </p>
                          <p className="text-[9px] text-muted-foreground mt-1">accounts claimed</p>
                        </div>

                        {/* Total Attacks */}
                        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-destructive/70">Attacks</span>
                            <Swords className="size-3 text-destructive/50" />
                          </div>
                          <p className="text-2xl font-bold text-destructive leading-none font-mono">
                            {actions.filter((a) => a.action === "attacks-done").reduce((s, a) => s + (a.count ?? 0), 0)}
                          </p>
                          <p className="text-[9px] text-muted-foreground mt-1">total hits sent</p>
                        </div>

                        {/* Errors */}
                        {(() => {
                          const errCount = actions.filter((a) => a.action === "claim-error" || a.action === "attacks-error").length
                          return (
                            <div className={`rounded-lg border p-3 ${errCount > 0 ? "border-red-500/20 bg-red-500/5" : "border-border bg-muted/20"}`}>
                              <div className="flex items-center justify-between mb-2">
                                <span className={`text-[9px] font-bold uppercase tracking-wider ${errCount > 0 ? "text-red-400/70" : "text-muted-foreground"}`}>Errors</span>
                                <TriangleAlert className={`size-3 ${errCount > 0 ? "text-red-400/50" : "text-muted-foreground/30"}`} />
                              </div>
                              <p className={`text-2xl font-bold leading-none font-mono ${errCount > 0 ? "text-red-400" : "text-muted-foreground"}`}>{errCount}</p>
                              <p className="text-[9px] text-muted-foreground mt-1">failed actions</p>
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Summary card */}
                  {summary && (
                    <div className={cn(
                      "border rounded-xl px-5 py-4",
                      summary.totalErrors === 0
                        ? "border-green-500/30 bg-green-500/5"
                        : "border-amber-500/30 bg-amber-500/5"
                    )}>
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "size-10 rounded-full flex items-center justify-center flex-shrink-0",
                          summary.totalErrors === 0
                            ? "bg-green-500/20 border border-green-500/30"
                            : "bg-amber-500/20 border border-amber-500/30"
                        )}>
                          {summary.totalErrors === 0
                            ? <CheckCircle2 className="size-5 text-green-400" />
                            : <TriangleAlert className="size-5 text-amber-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground">Run Complete</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                            {summary.accounts} account(s)
                          </p>
                        </div>
                        <div className="grid grid-cols-4 gap-3 text-right flex-shrink-0">
                          {[
                            { label: "Claimed",  value: summary.totalClaimed,  color: "text-green-400" },
                            { label: "Attacked", value: summary.totalAttacks,  color: "text-destructive" },
                            { label: "Skipped",  value: summary.totalSkipped,  color: "text-yellow-400" },
                            { label: "Errors",   value: summary.totalErrors,   color: "text-muted-foreground" },
                          ].map((s) => (
                            <div key={s.label}>
                              <p className={cn("text-lg font-bold font-mono leading-none", s.color)}>{s.value}</p>
                              <p className="text-[9px] text-muted-foreground mt-0.5">{s.label}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Accounts right-side Sheet */}
                  <Sheet open={showAccounts} onOpenChange={setShowAccounts}>
                    <SheetContent side="right" className="w-[520px] p-0 flex flex-col font-mono">
                      <SheetHeader className="px-5 py-3 border-b border-border flex-shrink-0">
                        <SheetTitle className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
                          <Users className="size-4 text-primary" />
                          Account Actions
                          <span className="text-[10px] text-muted-foreground font-normal normal-case tracking-normal">({players.length})</span>
                        </SheetTitle>
                      </SheetHeader>
                      <div className="flex-1 overflow-y-auto p-4">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Account</th>
                              <th className="text-right pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Claimed</th>
                              <th className="text-right pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Attacks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {players.map((p) => {
                              const playerActions = actions.filter((a) => a.username === p.username)
                              const claimed       = playerActions.some((a) => a.action === "claim-ok")
                              const claimErr      = playerActions.some((a) => a.action === "claim-error")
                              const skipped       = playerActions.some((a) => a.action === "skip")
                              const attacksDone   = playerActions.find((a)  => a.action === "attacks-done")
                              const attacksSkip   = playerActions.some((a)  => a.action === "attacks-skip")
                              const attackCount   = attacksDone?.count ?? 0

                              return (
                                <tr key={p.username} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                                  {/* Col 1 — avatar + name + attacks/claims */}
                                  <td className="py-2.5">
                                    <div className="flex items-center gap-2.5">
                                      <img
                                        src={`https://images.hive.blog/u/${p.username}/avatar/small`}
                                        alt={p.username}
                                        className="size-6 rounded-full flex-shrink-0"
                                        crossOrigin="anonymous"
                                        onError={(e) => { e.currentTarget.style.display = "none" }}
                                      />
                                      <div className="min-w-0">
                                        <p className="font-bold text-foreground truncate">@{p.username}</p>
                                        <p className="text-[9px] text-muted-foreground font-mono mt-0.5">
                                          {p.attacks}/{p.maxAttacks} atk · {p.claims} claims · {(p.scrap ?? 0).toFixed(2)} SCRAP
                                        </p>
                                      </div>
                                    </div>
                                  </td>

                                  {/* Col 2 — claimed status */}
                                  <td className="py-2.5 text-right">
                                    {claimed && (
                                      <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/20 text-green-400">
                                        <CheckCircle2 className="size-2.5" />
                                        {(p.minerate ?? 0).toFixed(2)}/hr
                                      </span>
                                    )}
                                    {claimErr && (
                                      <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400">
                                        <XCircle className="size-2.5" /> Error
                                      </span>
                                    )}
                                    {skipped && (
                                      <span className="text-[9px] text-yellow-400 font-mono">skipped</span>
                                    )}
                                    {!claimed && !claimErr && !skipped && running && (
                                      <Loader2 className="size-3 animate-spin text-muted-foreground" />
                                    )}
                                  </td>

                                  {/* Col 3 — attacks used */}
                                  <td className="py-2.5 text-right">
                                    {attacksDone && (
                                      <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-destructive/10 border border-destructive/20 text-destructive">
                                        <Swords className="size-2.5" />
                                        {attackCount}
                                      </span>
                                    )}
                                    {attacksSkip && !attacksDone && (
                                      <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted/60 border border-border text-muted-foreground">
                                        <AlertCircle className="size-2.5" /> Skip
                                      </span>
                                    )}
                                    {!attacksDone && !attacksSkip && running && (
                                      <Loader2 className="size-3 animate-spin text-muted-foreground" />
                                    )}
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

          {/* Output log — bottom docked */}
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
