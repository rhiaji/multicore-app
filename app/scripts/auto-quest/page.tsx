"use client"

import { useState, useRef, useCallback } from "react"
import {
  Play,
  Lock,
  Unlock,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Terminal,
  Swords,
  KeyRound,
  LayoutGrid,
  ScanSearch,
  Zap,
  ClipboardPaste,
  PackageCheck,
  PackagePlus,
  MinusCircle,
  Users,
  X,
  Activity,
  TrendingUp,
  TriangleAlert,
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
import { cn } from "@/lib/utils"
import { decryptAccounts } from "@/lib/encryption"
import { runAutoQuest } from "@/lib/server-events/auto-quest/action"


// ── Types ─────────────────────────────────────────────────────────────────────

type StepId     = "decrypt" | "board" | "check" | "execute"
type StepStatus = "idle" | "running" | "done" | "error"
interface StepState { status: StepStatus; message: string }

interface AccountRow {
  username: string
  inProgress: number
  readyToCollect: number
  available: number
}

interface ActionRow {
  username: string
  action: "collect" | "start"
  quest: string
  status: "ok" | "error"
  message: string
  txId?: string
}

interface LogLine {
  id: number; time: string; type: "info" | "ok" | "skip" | "error" | "system"; text: string
}

// ── Step metadata ─────────────────────────────────────────────────────────────

const STEP_META: { id: StepId; label: string; icon: React.ReactNode }[] = [
  { id: "decrypt", label: "Decrypt Keys",  icon: <KeyRound     className="size-4" /> },
  { id: "board",   label: "Fetch Board",   icon: <LayoutGrid   className="size-4" /> },
  { id: "check",   label: "Check Quests",  icon: <ScanSearch   className="size-4" /> },
  { id: "execute", label: "Execute",       icon: <Zap          className="size-4" /> },
]

const STEP_STATUS_COLOR: Record<StepStatus, string> = {
  idle:    "text-muted-foreground border-border bg-muted/30",
  running: "text-primary border-primary bg-primary/10 animate-pulse",
  done:    "text-green-400 border-green-500/40 bg-green-500/10",
  error:   "text-destructive border-destructive/40 bg-destructive/10",
}

const STEP_STATUS_ICON: Record<StepStatus, React.ReactNode> = {
  idle:    <span className="size-2 rounded-full bg-muted-foreground/40 inline-block" />,
  running: <Loader2     className="size-3.5 animate-spin" />,
  done:    <CheckCircle2 className="size-3.5" />,
  error:   <XCircle     className="size-3.5" />,
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
  board:   { status: "idle", message: "" },
  check:   { status: "idle", message: "" },
  execute: { status: "idle", message: "" },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AutoQuestPage() {
  // Sidebar drawer
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Config
  const [encryptedConfig, setEncryptedConfig] = useState("")
  const [encryptionKey,   setEncryptionKey]   = useState("")
  const [showKey,         setShowKey]         = useState(false)

  // Runtime
  const [running,      setRunning]      = useState(false)
  const [steps,        setSteps]        = useState<Record<StepId, StepState>>(INITIAL_STEPS)
  const [accountRows,  setAccountRows]  = useState<AccountRow[]>([])
  const [actionRows,   setActionRows]   = useState<ActionRow[]>([])
  const [logs,         setLogs]         = useState<LogLine[]>([])
  const [summary,      setSummary]      = useState<{
    totalCollected: number; totalStarted: number; totalErrors: number; accounts: number
  } | null>(null)

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
    setActionRows([])
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
    pushLog("system", "Script started — Auto Quest")

    try {
      // Decrypt client-side — keys never leave the browser
      let accounts: { username: string; active_key: string; posting_key: string }[]
      try {
        const parsed = JSON.parse(encryptedConfig)
        accounts = decryptAccounts(parsed, encryptionKey)
        setSteps((prev) => ({ ...prev, decrypt: { status: "done", message: `${accounts.length} account(s) decrypted.` } }))
        pushLog("ok", `[DECRYPT] ${accounts.length} account(s) decrypted.`)
      } catch (err) {
        setSteps((prev) => ({ ...prev, decrypt: { status: "error", message: err instanceof Error ? err.message : "Decryption failed" } }))
        pushLog("error", `[DECRYPT] ${err instanceof Error ? err.message : "Decryption failed"}`)
        setRunning(false)
        return
      }

      const controller = new AbortController()
      abortControllerRef.current = controller

      for await (const evt of runAutoQuest({ accounts }, controller.signal)) {
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
                username:       evt.username,
                inProgress:     evt.inProgress,
                readyToCollect: evt.readyToCollect,
                available:      evt.available,
              }
              if (idx >= 0) {
                const next = [...prev]
                next[idx] = row
                return next
              }
              return [...prev, row]
            })
            pushLog("info", `@${evt.username} — in-progress: ${evt.inProgress}, ready: ${evt.readyToCollect}, available: ${evt.available}`)
            break

          case "action":
            setActionRows((prev) => [
              ...prev,
              {
                username: evt.username,
                action:   evt.action,
                quest:    evt.quest,
                status:   evt.status,
                message:  evt.message,
                txId:     evt.txId,
              },
            ])
            pushLog(
              evt.status === "ok" ? "ok" : evt.status === "error" ? "error" : "skip",
              `@${evt.username} ${evt.action === "collect" ? "collect" : "start"} "${evt.quest}" — ${evt.message}`
            )
            break

          case "account-error":
            pushLog("error", `@${evt.username}: ${evt.message}`)
            break

          case "error":
            pushLog("error", evt.message)
            break

          case "done":
            if (evt.summary) setSummary({ ...evt.summary })
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
  }, [running, encryptedConfig, encryptionKey, reset, pushLog])

  const canRun = !!encryptedConfig && !!encryptionKey && !running

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
              Auto Quest
            </span>
          </div>
          <HiveLoginNav />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Settings Drawer ── */}
        <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
          <SheetContent side="left" className="w-[300px] p-0 flex flex-col font-mono">
            <SheetHeader className="px-4 pt-4 pb-3 border-b border-border flex-shrink-0">
              <SheetTitle className="flex items-center gap-2 text-sm font-bold">
                <Swords className="size-4 text-primary" />
                Auto Quest
              </SheetTitle>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Check all accounts for quests ready to collect, and start available quests from today&apos;s board.
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
                  rows={5}
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
            </div>

          </SheetContent>
        </Sheet>

        {/* ── Main panel ── */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* ── TOP ROW: pipeline + account status + actions ── */}
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

            {/* Results — account status + actions */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {accountRows.length === 0 && actionRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                  <Swords className="size-8 opacity-20" />
                  <p className="text-[11px] text-center max-w-xs">
                    Configure your accounts and encryption key in settings, then click Run to process quests.
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
                  {/* Quest stats + Show Accounts */}
                  {accountRows.length > 0 && (() => {
                    const totalRunning   = accountRows.reduce((s, r) => s + r.inProgress,     0)
                    const totalReady     = accountRows.reduce((s, r) => s + r.readyToCollect, 0)
                    const totalAvailable = accountRows.reduce((s, r) => s + r.available,      0)
                    const totalErrors    = actionRows.filter((a) => a.status === "error").length
                    const totalStarted   = actionRows.filter((a) => a.action === "start").length
                    const totalCollected = actionRows.filter((a) => a.action === "collect").length

                    return (
                      <div>
                        {/* Section header */}
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Quest Status
                          </p>
                          <button
                            onClick={() => setShowAccounts(true)}
                            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border border-border hover:border-primary/40 hover:text-primary text-muted-foreground transition-colors"
                          >
                            <Users className="size-3" />
                            Show Accounts
                            <span className="ml-0.5 text-[9px] font-normal opacity-60">({accountRows.length})</span>
                          </button>
                        </div>

                        {/* Stat cards */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                          {/* Running */}
                          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400/70">Running</span>
                              <Activity className="size-3 text-amber-400/50" />
                            </div>
                            <p className="text-2xl font-bold text-amber-400 leading-none">{totalRunning}</p>
                            <p className="text-[9px] text-muted-foreground mt-1">quests in progress</p>
                          </div>

                          {/* Started */}
                          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-primary/70">Started</span>
                              <TrendingUp className="size-3 text-primary/50" />
                            </div>
                            <p className="text-2xl font-bold text-primary leading-none">{totalStarted}</p>
                            <p className="text-[9px] text-muted-foreground mt-1">quests started this run</p>
                          </div>

                          {/* Collected */}
                          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-green-400/70">Collected</span>
                              <PackageCheck className="size-3 text-green-400/50" />
                            </div>
                            <p className="text-2xl font-bold text-green-400 leading-none">{totalCollected}</p>
                            <p className="text-[9px] text-muted-foreground mt-1">quests collected</p>
                          </div>

                          {/* Errors */}
                          <div className={`rounded-lg border p-3 ${totalErrors > 0 ? "border-red-500/20 bg-red-500/5" : "border-border bg-muted/20"}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className={`text-[9px] font-bold uppercase tracking-wider ${totalErrors > 0 ? "text-red-400/70" : "text-muted-foreground"}`}>Errors</span>
                              <TriangleAlert className={`size-3 ${totalErrors > 0 ? "text-red-400/50" : "text-muted-foreground/30"}`} />
                            </div>
                            <p className={`text-2xl font-bold leading-none ${totalErrors > 0 ? "text-red-400" : "text-muted-foreground"}`}>{totalErrors}</p>
                            <p className="text-[9px] text-muted-foreground mt-1">failed actions</p>
                          </div>
                        </div>

                        {/* Available slot hint */}
                        {totalAvailable > 0 && (
                          <p className="mt-2 text-[10px] text-primary/70">
                            {totalAvailable} quest slot{totalAvailable !== 1 ? "s" : ""} available across accounts
                          </p>
                        )}
                        {totalReady > 0 && (
                          <p className="mt-1 text-[10px] text-green-400/70">
                            {totalReady} quest{totalReady !== 1 ? "s" : ""} ready to collect
                          </p>
                        )}
                      </div>
                    )
                  })()}

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
                        {(() => {
                          type ModalRow = {
                            username: string
                            action: "collect" | "start" | "skip"
                            quest: string
                            status: "ok" | "error" | "skip"
                          }
                          const rows: ModalRow[] = []
                          accountRows.forEach((acct) => {
                            const acctActions = actionRows.filter((a) => a.username === acct.username)
                            if (acctActions.length === 0) {
                              rows.push({ username: acct.username, action: "skip", quest: "Nothing to do", status: "skip" })
                            } else {
                              acctActions.forEach((a) =>
                                rows.push({ username: a.username, action: a.action, quest: a.quest, status: a.status })
                              )
                            }
                          })
                          return (
                            <table className="w-full text-[11px]">
                              <thead>
                                <tr className="border-b border-border">
                                  <th className="text-left pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Account</th>
                                  <th className="text-left pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quest</th>
                                  <th className="text-right pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Result</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((row, i) => (
                                  <tr key={i} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                                    <td className="py-2 font-bold">@{row.username}</td>
                                    <td className="py-2">
                                      <span className="text-muted-foreground">{row.quest}</span>
                                      {row.action !== "skip" && (
                                        <span className={`ml-2 inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                                          row.action === "collect"
                                            ? "bg-green-500/10 text-green-400 border-green-500/20"
                                            : "bg-primary/10 text-primary border-primary/20"
                                        }`}>
                                          {row.action === "collect"
                                            ? <PackageCheck className="size-2.5" />
                                            : <PackagePlus className="size-2.5" />}
                                          {row.action}
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2 text-right">
                                      <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                                        row.status === "ok"
                                          ? "bg-green-500/10 text-green-400 border-green-500/20"
                                          : row.status === "skip"
                                          ? "bg-muted/60 text-muted-foreground border-border"
                                          : "bg-red-500/10 text-red-400 border-red-500/20"
                                      }`}>
                                        {row.status === "ok"
                                          ? <CheckCircle2 className="size-2.5" />
                                          : row.status === "skip"
                                          ? <MinusCircle className="size-2.5" />
                                          : <XCircle className="size-2.5" />}
                                        {row.status === "skip" ? "skip" : row.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )
                        })()}
                      </div>
                    </SheetContent>
                  </Sheet>

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
                        <div className="grid grid-cols-3 gap-3 text-right flex-shrink-0">
                          {[
                            { label: "Collected", value: summary.totalCollected, color: "text-green-400" },
                            { label: "Started",   value: summary.totalStarted,   color: "text-primary" },
                            { label: "Errors",    value: summary.totalErrors,    color: summary.totalErrors > 0 ? "text-amber-400" : "text-muted-foreground" },
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

                </div>
              )}
            </div>
          </div>

          {/* ── Output log — stacked below content inside main ── */}
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
