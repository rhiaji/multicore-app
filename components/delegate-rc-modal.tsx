"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { HiveLoginButton } from "@/components/market/hive-login-button"
import { saveHiveUser, loadHiveUser } from "@/lib/hive-auth"
import type { HiveUser } from "@/lib/hive-auth"
import { delegateRc, massDelegateRc, MAX_DELEGATEES_PER_TX } from "@/lib/events/delegate-rc/action"
import { Loader2, Zap, AlertCircle, CheckCircle2, TrendingUp, TrendingDown, Users, User } from "lucide-react"
import { cn } from "@/lib/utils"

interface DelegateRcModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetUsername: string
  currentRcPercent: number
  /** All tracked usernames — used for mass delegation */
  allUsernames?: string[]
}

// Conversion constants
// 5 HP ≈ 8,112,000,000 raw RC  →  1 HP ≈ 1,622,400,000 raw RC
// 1 G RC = 1,000,000,000 raw RC
const RC_PER_HP = 1_622_400_000
const G_RC      = 1_000_000_000

// HP preset options shown in the UI
const HP_PRESETS = [5, 10, 50, 100]

function hpToGrc(hp: number): number {
  return (hp * RC_PER_HP) / G_RC   // e.g. 5 HP → 8.112 G RC
}

export function DelegateRcModal({
  open,
  onOpenChange,
  targetUsername,
  currentRcPercent,
  allUsernames = [],
}: DelegateRcModalProps) {
  const [tab, setTab] = useState<"single" | "mass">("single")
  const [connectedUser, setConnectedUser] = useState<HiveUser | null>(() => loadHiveUser())
  const [delegationStats, setDelegationStats] = useState<{
    incoming: number
    outgoing: number
    available: number
  } | null>(null)

  // Shared amount state (G RC)
  const [amountGrc, setAmountGrc] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [txId, setTxId] = useState<string | null>(null)
  const [batchInfo, setBatchInfo] = useState<{ completed: number; total: number; txIds: string[] } | null>(null)

  // Mass delegation: selected accounts
  const otherUsernames = allUsernames.filter((u) => u !== connectedUser?.username)
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set())
  const allSelected = otherUsernames.length > 0 && selectedAccounts.size === otherUsernames.length
  const someSelected = selectedAccounts.size > 0 && !allSelected
  const batchCount = Math.ceil(selectedAccounts.size / MAX_DELEGATEES_PER_TX)

  // Derived
  const rawRc = amountGrc ? Math.floor(parseFloat(amountGrc) * G_RC) : 0
  const hpEquiv = rawRc > 0 ? (rawRc / RC_PER_HP).toFixed(3) : null

  useEffect(() => {
    if (connectedUser && open) fetchDelegationStats()
  }, [connectedUser, open])

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setSuccess(false)
      setTxId(null)
      setBatchInfo(null)
      setError(null)
    }
  }, [open])

  async function fetchDelegationStats() {
    if (!connectedUser) return
    try {
      const res = await fetch(`/api/hive/delegation-stats?username=${connectedUser.username}`)
      const data = await res.json()
      if (res.ok) setDelegationStats(data)
    } catch { /* silent */ }
  }

  function formatRcValue(rc: number): string {
    if (rc >= 1_000_000_000) return (rc / 1_000_000_000).toFixed(3) + " G RC"
    return Math.floor(rc).toLocaleString() + " RC"
  }

  function handleLogin(user: HiveUser) {
    setConnectedUser(user)
    saveHiveUser(user)
  }

  function handleLogout() {
    setConnectedUser(null)
    setDelegationStats(null)
  }

  function toggleAccount(username: string) {
    setSelectedAccounts((prev) => {
      const next = new Set(prev)
      if (next.has(username)) next.delete(username)
      else next.add(username)
      return next
    })
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedAccounts(new Set())
    } else {
      setSelectedAccounts(new Set(otherUsernames))
    }
  }

  function handleSingleDelegate() {
    if (!connectedUser) { setError("Please connect your account first."); return }
    if (!amountGrc.trim() || rawRc <= 0) { setError("Enter a G RC amount to delegate."); return }

    setLoading(true)
    setError(null)

    delegateRc(
      { from: connectedUser.username, to: targetUsername, maxRc: rawRc, displayGrc: `${amountGrc} G RC` },
      (result) => {
        setLoading(false)
        if (result.success) {
          setTxId(result.txId ?? null)
          setSuccess(true)
          setAmountGrc("")
          setTimeout(() => { onOpenChange(false) }, 3000)
        } else {
          setError(result.message)
        }
      },
    )
  }

  function handleMassDelegate() {
    if (!connectedUser) { setError("Please connect your account first."); return }
    if (selectedAccounts.size === 0) { setError("Select at least one account."); return }
    if (!amountGrc.trim() || rawRc <= 0) { setError("Enter a G RC amount to delegate."); return }

    setLoading(true)
    setError(null)
    setBatchInfo(null)

    massDelegateRc(
      {
        from:       connectedUser.username,
        delegatees: Array.from(selectedAccounts),
        maxRc:      rawRc,
        displayGrc: `${amountGrc} G RC`,
      },
      (result) => {
        setLoading(false)
        if (result.success) {
          setBatchInfo({ completed: result.batches, total: result.batches, txIds: result.txIds })
          setSuccess(true)
          setAmountGrc("")
          setSelectedAccounts(new Set())
          setTimeout(() => { onOpenChange(false) }, 4000)
        } else {
          setBatchInfo(
            result.completedBatches > 0
              ? { completed: result.completedBatches, total: batchCount, txIds: [] }
              : null
          )
          setError(result.message)
        }
      },
    )
  }

  const amountBlock = (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <div className="flex flex-col gap-1">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Currency</p>
          <div className="flex items-center justify-center border border-border rounded-lg px-3 py-2 bg-muted/30 text-xs font-semibold text-foreground min-w-[56px]">
            G RC
          </div>
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Amount</p>
            {hpEquiv && <p className="text-[9px] text-muted-foreground">≈ {hpEquiv} HP</p>}
          </div>
          <Input
            type="number"
            step="0.001"
            min="0"
            placeholder="0.000"
            value={amountGrc}
            onChange={(e) => setAmountGrc(e.target.value)}
            disabled={loading || success}
            className="text-sm font-mono"
          />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {HP_PRESETS.map((hp) => (
          <Button
            key={hp}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAmountGrc(hpToGrc(hp).toFixed(3))}
            disabled={loading || success}
            className="text-[10px] font-bold"
          >
            {hp} HP
          </Button>
        ))}
      </div>
      {rawRc > 0 && (
        <div className="flex items-center justify-between border border-border/50 rounded-lg px-3 py-2 bg-muted/20">
          <p className="text-[10px] text-muted-foreground">max_rc (Keychain value)</p>
          <p className="text-[10px] font-mono font-bold text-foreground">{rawRc.toLocaleString()}</p>
        </div>
      )}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!loading) onOpenChange(v) }}>
      <DialogContent className="max-w-md w-full bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-foreground">
            <Zap className="size-4 text-amber-400" />
            Delegate RC
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Delegate Resource Credits from your connected account
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-1">

          {/* Tab switcher */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => { setTab("single"); setError(null) }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold uppercase tracking-widest transition-colors",
                tab === "single"
                  ? "bg-amber-500/15 text-amber-400 border-r border-border"
                  : "text-muted-foreground hover:text-foreground border-r border-border",
              )}
            >
              <User className="size-3" />
              Single
            </button>
            <button
              onClick={() => { setTab("mass"); setError(null) }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold uppercase tracking-widest transition-colors",
                tab === "mass"
                  ? "bg-amber-500/15 text-amber-400"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Users className="size-3" />
              Mass
              {otherUsernames.length > 0 && (
                <span className="text-[9px] font-mono text-muted-foreground/60 ml-0.5">
                  {otherUsernames.length}
                </span>
              )}
            </button>
          </div>

          {/* Target info — single tab */}
          {tab === "single" && (
            <div className="border border-border rounded-lg p-3 bg-muted/20 flex items-center gap-2">
              {currentRcPercent < 20
                ? <AlertCircle className="size-4 text-destructive flex-shrink-0" />
                : <Zap className="size-4 text-amber-400 flex-shrink-0" />}
              <p className={cn("text-xs", currentRcPercent < 20 ? "text-destructive font-semibold" : "text-muted-foreground")}>
                {currentRcPercent < 20 ? "Low RC:" : "Current RC:"} {currentRcPercent.toFixed(1)}% — @{targetUsername}
              </p>
            </div>
          )}

          {/* Connected account */}
          {connectedUser ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between border border-border rounded-lg p-3 bg-card">
                <div className="flex items-center gap-2">
                  <img
                    src={`https://images.hive.blog/u/${connectedUser.username}/avatar/small`}
                    alt={connectedUser.username}
                    className="size-5 rounded-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = "none" }}
                  />
                  <div className="flex flex-col gap-0.5">
                    <p className="text-xs font-semibold text-foreground">@{connectedUser.username}</p>
                    <p className="text-[10px] text-muted-foreground">{connectedUser.hiveBalance.toFixed(3)} HIVE</p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-[10px] font-semibold text-muted-foreground hover:text-destructive transition-colors"
                >
                  Change
                </button>
              </div>

              {/* Delegation stats */}
              {delegationStats && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="border border-border rounded-lg p-2.5 bg-green-500/5">
                    <TrendingUp className="size-4 text-green-400 mb-1" />
                    <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Incoming</p>
                    <p className="text-xs font-bold text-green-400 mt-0.5">+{formatRcValue(delegationStats.incoming)}</p>
                  </div>
                  <div className="border border-border rounded-lg p-2.5 bg-destructive/5">
                    <TrendingDown className="size-4 text-destructive mb-1" />
                    <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Outgoing</p>
                    <p className="text-xs font-bold text-destructive mt-0.5">{formatRcValue(delegationStats.outgoing)}</p>
                  </div>
                  <div className="border border-border rounded-lg p-2.5 bg-blue-500/5">
                    <Zap className="size-4 text-blue-400 mb-1" />
                    <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Available</p>
                    <p className="text-xs font-bold text-blue-400 mt-0.5">{formatRcValue(delegationStats.available)}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Connect your main account:</p>
              <HiveLoginButton user={connectedUser} onLogin={handleLogin} onLogout={handleLogout} />
            </div>
          )}

          {/* Single tab content */}
          {tab === "single" && connectedUser && (
            <>
              {amountBlock}
              <p className="text-[10px] text-muted-foreground">
                Higher amounts = better RC recovery for @{targetUsername}
              </p>
            </>
          )}

          {/* Mass tab content */}
          {tab === "mass" && connectedUser && (
            <div className="space-y-3">
              {/* Account checklist */}
              <div className="border border-border rounded-lg overflow-hidden">
                {/* Select all header */}
                <label className="flex items-center gap-3 px-3 py-2.5 bg-muted/30 border-b border-border cursor-pointer hover:bg-muted/50 transition-colors select-none">
                  <div className={cn(
                    "size-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                    allSelected
                      ? "bg-amber-500 border-amber-500"
                      : someSelected
                        ? "bg-amber-500/40 border-amber-500/60"
                        : "border-border bg-transparent",
                  )}>
                    {(allSelected || someSelected) && (
                      <svg viewBox="0 0 10 10" className="size-2.5 text-white fill-current">
                        {allSelected
                          ? <path d="M1.5 5 L4 7.5 L8.5 2.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                          : <path d="M2 5h6" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                        }
                      </svg>
                    )}
                  </div>
                  <span
                    className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                    onClick={toggleSelectAll}
                  >
                    Select all ({otherUsernames.length})
                  </span>
                  {selectedAccounts.size > 0 && (
                    <span className="ml-auto text-[10px] font-mono text-amber-400">
                      {selectedAccounts.size} selected
                    </span>
                  )}
                </label>

                {/* Account rows */}
                <div className="max-h-40 overflow-y-auto divide-y divide-border">
                  {otherUsernames.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground text-center py-4">
                      No other tracked accounts.
                    </p>
                  ) : (
                    otherUsernames.map((username) => {
                      const checked = selectedAccounts.has(username)
                      return (
                        <label
                          key={username}
                          className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors select-none"
                        >
                          <div
                            className={cn(
                              "size-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                              checked ? "bg-amber-500 border-amber-500" : "border-border bg-transparent",
                            )}
                            onClick={() => toggleAccount(username)}
                          >
                            {checked && (
                              <svg viewBox="0 0 10 10" className="size-2.5 text-white fill-current">
                                <path d="M1.5 5 L4 7.5 L8.5 2.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                          <img
                            src={`https://images.hive.blog/u/${username}/avatar/small`}
                            alt={username}
                            className="size-5 rounded-full object-cover flex-shrink-0"
                            onError={(e) => { e.currentTarget.style.display = "none" }}
                          />
                          <span
                            className="text-xs text-foreground font-medium flex-1 truncate"
                            onClick={() => toggleAccount(username)}
                          >
                            @{username}
                          </span>
                        </label>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Batch info pill */}
              {selectedAccounts.size > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/20">
                  <Zap className="size-3 text-amber-400 flex-shrink-0" />
                  <p className="text-[10px] text-amber-300">
                    {selectedAccounts.size} account{selectedAccounts.size !== 1 ? "s" : ""} —{" "}
                    {batchCount} Keychain tx{batchCount !== 1 ? "s" : ""} of up to {MAX_DELEGATEES_PER_TX} ops each
                  </p>
                </div>
              )}

              {amountBlock}
            </div>
          )}

          {/* Feedback: error */}
          {error && (
            <div className="flex gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertCircle className="size-4 text-destructive flex-shrink-0 mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <p className="text-xs text-destructive">{error}</p>
                {batchInfo && (
                  <p className="text-[10px] text-muted-foreground">
                    {batchInfo.completed} of {batchInfo.total} batch{batchInfo.total !== 1 ? "es" : ""} completed before failure.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Feedback: success */}
          {success && (
            <div className="flex gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="size-4 text-green-400 flex-shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                {batchInfo ? (
                  <p className="text-xs font-semibold text-green-300">
                    RC delegated to all accounts ({batchInfo.completed} tx{batchInfo.completed !== 1 ? "s" : ""})!
                  </p>
                ) : (
                  <p className="text-xs font-semibold text-green-300">RC delegated successfully!</p>
                )}
                {txId && (
                  <a href={`https://hive.blog/tx/${txId}`} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-green-300 hover:underline">View transaction →</a>
                )}
                {batchInfo && batchInfo.txIds.length > 0 && (
                  <a href={`https://hive.blog/tx/${batchInfo.txIds[0]}`} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-green-300 hover:underline">View first transaction →</a>
                )}
              </div>
            </div>
          )}

          {/* Action button */}
          {connectedUser && (
            <Button
              onClick={tab === "single" ? handleSingleDelegate : handleMassDelegate}
              disabled={
                loading || success || rawRc <= 0 ||
                (tab === "mass" && selectedAccounts.size === 0)
              }
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {tab === "mass" ? "Delegating..." : "Delegating..."}
                </>
              ) : success ? (
                <>
                  <CheckCircle2 className="size-4" />
                  Delegated!
                </>
              ) : tab === "mass" ? (
                <>
                  <Users className="size-4" />
                  Delegate to {selectedAccounts.size > 0 ? `${selectedAccounts.size} Accounts` : "Selected"}
                </>
              ) : (
                <>
                  <Zap className="size-4" />
                  Delegate RC
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
