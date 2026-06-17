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
  SendHorizonal,
  KeyRound,
  Users,
  Wallet,
  Radio,
  ClipboardPaste,
  Coins,
  Hash,
  X,
  TrendingUp,
  TriangleAlert,
  ArrowRightLeft,
  Square,
  MinusCircle,
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
import { runTransfer } from "@/lib/server-events/transfer/action"

// ── Types ─────────────────────────────────────────────────────────────────────

type StepId     = "decrypt" | "validate" | "balances" | "broadcast"
type StepStatus = "idle" | "running" | "done" | "error"

interface StepState { status: StepStatus; message: string }

type TransferStatus = "ok" | "skip" | "error"
interface TransferResult {
  username: string; status: TransferStatus; message: string; amount: number; txId?: string
}

interface LogLine {
  id: number; time: string; type: "info" | "ok" | "skip" | "error" | "system"; text: string
}

const STEP_META: { id: StepId; label: string; icon: React.ReactNode }[] = [
  { id: "decrypt",   label: "Decrypt Keys",       icon: <KeyRound  className="size-4" /> },
  { id: "validate",  label: "Validate Recipient",  icon: <Users     className="size-4" /> },
  { id: "balances",  label: "Fetch Balances",      icon: <Wallet    className="size-4" /> },
  { id: "broadcast", label: "Broadcast Transfers", icon: <Radio     className="size-4" /> },
]

const STEP_STATUS_COLOR: Record<StepStatus, string> = {
  idle:    "text-muted-foreground border-border bg-muted/30",
  running: "text-primary border-primary bg-primary/10 animate-pulse",
  done:    "text-green-400 border-green-500/40 bg-green-500/10",
  error:   "text-destructive border-destructive/40 bg-destructive/10",
}

const STEP_STATUS_ICON: Record<StepStatus, React.ReactNode> = {
  idle:    <span className="size-2 rounded-full bg-muted-foreground/40 inline-block" />,
  running: <Loader2  className="size-3.5 animate-spin" />,
  done:    <CheckCircle2 className="size-3.5" />,
  error:   <XCircle className="size-3.5" />,
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
  decrypt:   { status: "idle", message: "" },
  validate:  { status: "idle", message: "" },
  balances:  { status: "idle", message: "" },
  broadcast: { status: "idle", message: "" },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TokenTransferPage() {
  // Sidebar drawer
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Config
  const [encryptedConfig, setEncryptedConfig] = useState("")
  const [encryptionKey,   setEncryptionKey]   = useState("")
  const [recipient,       setRecipient]        = useState("")
  const [memo,            setMemo]             = useState("Multicore Token Transfer Script consolidation")
  const [token,           setToken]            = useState("HIVE")
  const [amountMode,      setAmountMode]       = useState<"max" | "custom">("max")
  const [customAmount,    setCustomAmount]     = useState("")
  const [showKey,         setShowKey]          = useState(false)

  // Runtime
  const [running,   setRunning]   = useState(false)
  const [steps,     setSteps]     = useState<Record<StepId, StepState>>(INITIAL_STEPS)
  const [transfers, setTransfers] = useState<TransferResult[]>([])
  const [logs,      setLogs]      = useState<LogLine[]>([])
  const [summary,      setSummary]      = useState<{
    successCount: number; skipCount: number; errorCount: number; totalMoved: number; symbol: string
  } | null>(null)
  const [balanceMap,   setBalanceMap]   = useState<Record<string, number>>({})
  const [showAccounts, setShowAccounts] = useState(false)

  const logIdRef           = useRef(0)
  const logContainerRef    = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort()
    setRunning(false)
  }, [])

  const pushLog = useCallback((type: LogLine["type"], text: string) => {
    setLogs((prev) => [
      ...prev,
      { id: logIdRef.current++, time: ts(), type, text },
    ])
    setTimeout(() => {
      const el = logContainerRef.current
      if (el) el.scrollTop = el.scrollHeight
    }, 50)
  }, [])

  const reset = useCallback(() => {
    setSteps(INITIAL_STEPS)
    setTransfers([])
    setLogs([])
    setSummary(null)
    setBalanceMap({})
  }, [])

  const handleRun = useCallback(async () => {
    if (running) return
    setRunning(true)
    reset()

    const symbolLabel = token.toUpperCase().trim() || "HIVE"
    const amountLabel = amountMode === "max" ? "max balance" : `${customAmount} ${symbolLabel}`
    pushLog("system", `Script started — ${symbolLabel} Transfer (${amountLabel})`)

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

      for await (const evt of runTransfer(
        {
          accounts,
          recipient,
          memo,
          symbol: symbolLabel,
          amount: amountMode === "max" ? "max" : (parseFloat(customAmount) || "max"),
        },
        controller.signal,
      )) {
        switch (evt.type) {
          case "step":
            setSteps((prev) => ({
              ...prev,
              [evt.step]: { status: evt.status, message: evt.message },
            }))
            if (evt.step === "balances" && evt.balances) {
              setBalanceMap(evt.balances)
            }
            pushLog(
              evt.status === "error" ? "error" : evt.status === "done" ? "ok" : "info",
              `[${evt.step.toUpperCase()}] ${evt.message}`
            )
            break
          case "transfer":
            setTransfers((prev) => [
              ...prev,
              {
                username: evt.username,
                status:   evt.status,
                message:  evt.message,
                amount:   evt.amount,
                txId:     evt.txId,
              },
            ])
            pushLog(
              evt.status === "ok" ? "ok" : evt.status === "skip" ? "skip" : "error",
              `@${evt.username} — ${evt.message}`
            )
            break
          case "error":
            pushLog("error", evt.message)
            break
          case "done":
            if (evt.summary) setSummary({ ...evt.summary, symbol: (evt.symbol ?? symbolLabel) || "HIVE" })
            pushLog("system", evt.success ? "Script completed successfully." : "Script finished with errors.")
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
  }, [running, encryptedConfig, encryptionKey, recipient, memo, token, amountMode, customAmount, reset, pushLog])

  const canRun =
    !!encryptedConfig &&
    !!encryptionKey   &&
    !!recipient       &&
    !!token           &&
    (amountMode === "max" || (!!customAmount && parseFloat(customAmount) > 0)) &&
    !running

  const activeStepIndex = STEP_META.findIndex(
    (s) => steps[s.id].status === "running"
  )

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
              Token Transfer
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
                <SendHorizonal className="size-4 text-primary" />
                Token Transfer
              </SheetTitle>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Decrypt accounts and sweep any token to a single recipient.
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

              {/* Recipient */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Recipient
                </label>
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
                  placeholder="hive-username"
                  disabled={running}
                  className="w-full p-2.5 text-[11px] font-mono bg-muted border border-border rounded-lg focus:outline-none focus:border-primary disabled:opacity-50 placeholder:text-muted-foreground/40"
                />
              </div>

              {/* Token Symbol */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Token Symbol
                </label>
                <div className="relative">
                  <Coins className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={token}
                    onChange={(e) => setToken(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                    placeholder="HIVE"
                    maxLength={12}
                    disabled={running}
                    className="w-full pl-8 p-2.5 text-[11px] font-mono bg-muted border border-border rounded-lg focus:outline-none focus:border-primary disabled:opacity-50 placeholder:text-muted-foreground/40 uppercase"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  e.g. <span className="text-foreground">HIVE</span>, <span className="text-foreground">HBD</span>, <span className="text-foreground">SCRAP</span>
                </p>
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Amount
                </label>
                <div className="flex rounded-lg overflow-hidden border border-border text-[10px] font-bold">
                  <button
                    onClick={() => setAmountMode("max")}
                    disabled={running}
                    className={`flex-1 py-2 transition-colors ${
                      amountMode === "max"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    MAX
                  </button>
                  <button
                    onClick={() => setAmountMode("custom")}
                    disabled={running}
                    className={`flex-1 py-2 transition-colors ${
                      amountMode === "custom"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    CUSTOM
                  </button>
                </div>
                {amountMode === "custom" && (
                  <div className="relative">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <input
                      type="number"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      placeholder="0.000"
                      min="0.001"
                      step="0.001"
                      disabled={running}
                      className="w-full pl-8 p-2.5 text-[11px] font-mono bg-muted border border-border rounded-lg focus:outline-none focus:border-primary disabled:opacity-50 placeholder:text-muted-foreground/40"
                    />
                  </div>
                )}
                {amountMode === "max" && (
                  <p className="text-[10px] text-muted-foreground">Sends the full available balance per account.</p>
                )}
              </div>

              {/* Memo */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Memo
                </label>
                <p className="p-2.5 text-[11px] font-mono bg-muted border border-border rounded-lg text-muted-foreground">
                  Multicore Token Transfer Script consolidation
                </p>
              </div>
            </div>

          </SheetContent>
        </Sheet>

        {/* ── Main panel ── */}
        <main className="flex-1 flex flex-col overflow-hidden">
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
              >
                {running ? <><Loader2 className="size-3.5 animate-spin" /> Running</> : <><Play className="size-3.5" /> Run</>}
              </button>
            </div>
          </div>

          {/* Summary bar */}
          {summary && (
            <div className="border-b border-border px-6 py-2 flex items-center gap-6 text-[10px] flex-shrink-0">
              <span className="text-green-400 font-bold">{summary.successCount} sent</span>
              <span className="text-yellow-400 font-bold">{summary.skipCount} skipped</span>
              <span className="text-red-400 font-bold">{summary.errorCount} errors</span>
              <span className="text-primary font-bold ml-auto">{summary.totalMoved.toFixed(3)} {summary.symbol} total</span>
            </div>
          )}

          {/* Content + Log stacked */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">

          {/* Main content area */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {transfers.length === 0 && !running ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <Terminal className="size-8 opacity-20" />
                <p className="text-[11px]">Configure the script and press Run to start</p>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {/* Section header */}
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Transfer Status
                  </p>
                  {transfers.length > 0 && (
                    <button
                      onClick={() => setShowAccounts(true)}
                      className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border border-border hover:border-primary/40 hover:text-primary text-muted-foreground transition-colors"
                    >
                      <Users className="size-3" />
                      Show Accounts
                      <span className="ml-0.5 text-[9px] font-normal opacity-60">({transfers.length})</span>
                    </button>
                  )}
                </div>

                {/* Stat cards */}
                <div className="grid grid-cols-3 gap-2">
                  {/* Total Transferred */}
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-primary/70">Transferred</span>
                      <ArrowRightLeft className="size-3 text-primary/50" />
                    </div>
                    <p className="text-xl font-bold text-primary leading-none">
                      {(summary?.totalMoved ?? transfers.reduce((s, t) => s + t.amount, 0)).toFixed(3)}
                    </p>
                    <p className="text-[9px] text-muted-foreground mt-1">{summary?.symbol ?? token} moved</p>
                  </div>

                  {/* Successful */}
                  <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-green-400/70">Successful</span>
                      <TrendingUp className="size-3 text-green-400/50" />
                    </div>
                    <p className="text-xl font-bold text-green-400 leading-none">
                      {summary?.successCount ?? transfers.filter((t) => t.status === "ok").length}
                    </p>
                    <p className="text-[9px] text-muted-foreground mt-1">transfers sent</p>
                  </div>

                  {/* Errors */}
                  {(() => {
                    const errCount = summary?.errorCount ?? transfers.filter((t) => t.status === "error").length
                    return (
                      <div className={`rounded-lg border p-3 ${errCount > 0 ? "border-red-500/20 bg-red-500/5" : "border-border bg-muted/20"}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[9px] font-bold uppercase tracking-wider ${errCount > 0 ? "text-red-400/70" : "text-muted-foreground"}`}>Errors</span>
                          <TriangleAlert className={`size-3 ${errCount > 0 ? "text-red-400/50" : "text-muted-foreground/30"}`} />
                        </div>
                        <p className={`text-xl font-bold leading-none ${errCount > 0 ? "text-red-400" : "text-muted-foreground"}`}>{errCount}</p>
                        <p className="text-[9px] text-muted-foreground mt-1">failed transfers</p>
                      </div>
                    )
                  })()}
                </div>

                {/* Skipped hint */}
                {(summary?.skipCount ?? transfers.filter((t) => t.status === "skip").length) > 0 && (
                  <p className="text-[10px] text-yellow-400/70">
                    {summary?.skipCount ?? transfers.filter((t) => t.status === "skip").length} account{(summary?.skipCount ?? 0) !== 1 ? "s" : ""} skipped (zero balance or self-transfer)
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Output log — bottom panel */}
          <div className="h-[240px] flex-shrink-0 border-t border-border flex flex-col">
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
        </div>

        </main>
      </div>

      {/* Accounts drawer — right side */}
      <Sheet open={showAccounts} onOpenChange={setShowAccounts}>
        <SheetContent side="right" className="w-[480px] p-0 flex flex-col font-mono">
          <SheetHeader className="px-5 py-3 border-b border-border flex-shrink-0">
            <SheetTitle className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
              <Users className="size-4 text-primary" />
              Account Transfers
              <span className="text-[10px] text-muted-foreground font-normal normal-case tracking-normal">({transfers.length})</span>
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Account</th>
                  <th className="text-left pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Amount</th>
                  <th className="text-right pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Result</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t, i) => {
                  const sym = summary?.symbol ?? token
                  return (
                    <tr key={i} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                      <td className="py-2 font-bold">@{t.username}</td>
                      <td className="py-2">
                        {t.amount > 0 ? (
                          <div>
                            <span className="font-bold text-foreground">{t.amount.toFixed(3)} {sym}</span>
                            {t.txId && (
                              <a
                                href={`https://hivehub.dev/tx/${t.txId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block text-[9px] font-mono text-primary/60 hover:text-primary mt-0.5 transition-colors"
                              >
                                TX: {t.txId.slice(0, 16)}...
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                          t.status === "ok"
                            ? "bg-green-500/10 text-green-400 border-green-500/20"
                            : t.status === "skip"
                            ? "bg-muted/60 text-muted-foreground border-border"
                            : "bg-red-500/10 text-red-400 border-red-500/20"
                        }`}>
                          {t.status === "ok"
                            ? <CheckCircle2 className="size-2.5" />
                            : t.status === "skip"
                            ? <MinusCircle className="size-2.5" />
                            : <XCircle className="size-2.5" />}
                          {t.status === "skip" ? "idle" : t.status}
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
  )
}
