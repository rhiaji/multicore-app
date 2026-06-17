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
import { delegateRc } from "@/lib/events/delegate-rc/action"
import { Loader2, Zap, AlertCircle, CheckCircle2, TrendingUp, TrendingDown } from "lucide-react"

interface DelegateRcModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetUsername: string
  currentRcPercent: number
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
}: DelegateRcModalProps) {
  const [connectedUser, setConnectedUser] = useState<HiveUser | null>(() => loadHiveUser())
  const [delegationStats, setDelegationStats] = useState<{
    incoming: number
    outgoing: number
    available: number
  } | null>(null)
  // amount stored in G RC (user-facing unit)
  const [amountGrc, setAmountGrc] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [txId, setTxId] = useState<string | null>(null)

  // Derived: raw RC integer sent to Keychain
  const rawRc = amountGrc ? Math.floor(parseFloat(amountGrc) * G_RC) : 0
  // HP equivalent hint
  const hpEquiv = rawRc > 0 ? (rawRc / RC_PER_HP).toFixed(3) : null

  // Fetch delegation stats when user connects
  useEffect(() => {
    if (connectedUser && open) {
      fetchDelegationStats()
    }
  }, [connectedUser, open])

  async function fetchDelegationStats() {
    if (!connectedUser) return

    try {
      const res = await fetch(`/api/hive/delegation-stats?username=${connectedUser.username}`)
      const data = await res.json()
      if (res.ok) {
        setDelegationStats(data)
      }
    } catch (err) {
      console.log("[v0] Failed to fetch delegation stats:", err)
    }
  }

  function formatRcValue(rc: number): string {
    if (rc >= 1_000_000_000) {
      return (rc / 1_000_000_000).toFixed(3) + " G RC"
    }
    return Math.floor(rc).toLocaleString() + " RC"
  }

  function handleLogin(user: HiveUser) {
    setConnectedUser(user)
    saveHiveUser(user)
  }

  function handleLogout() {
    setConnectedUser(null)
  }

  async function handleDelegate() {
    if (!connectedUser) {
      setError("Please connect your account first.")
      return
    }

    if (!amountGrc.trim() || rawRc <= 0) {
      setError("Enter a G RC amount to delegate.")
      return
    }

    setLoading(true)
    setError(null)

    delegateRc(
      {
        from:       connectedUser.username,
        to:         targetUsername,
        maxRc:      rawRc,
        displayGrc: `${amountGrc} G RC`,
      },
      (result) => {
        setLoading(false)
        if (result.success) {
          setTxId(result.txId ?? null)
          setSuccess(true)
          setAmountGrc("")
          setTimeout(() => {
            onOpenChange(false)
            setSuccess(false)
            setTxId(null)
          }, 3000)
        } else {
          setError(result.message)
        }
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!loading) onOpenChange(v) }}>
      <DialogContent className="max-w-md w-full bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-foreground">
            <Zap className="size-4 text-amber-400" />
            Delegate RC
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Delegate Resource Credits from your main account to <span className="font-semibold text-foreground">@{targetUsername}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-2">
          {/* Current RC status */}
          <div className="border border-border rounded-lg p-3 bg-muted/20">
            <div className="flex items-center gap-2">
              {currentRcPercent < 20 && (
                <>
                  <AlertCircle className="size-4 text-destructive flex-shrink-0" />
                  <p className="text-xs text-destructive font-semibold">
                    Low RC: {currentRcPercent.toFixed(1)}%
                  </p>
                </>
              )}
              {currentRcPercent >= 20 && (
                <>
                  <Zap className="size-4 text-amber-400 flex-shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Current RC: {currentRcPercent.toFixed(1)}%
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Connected account with stats */}
          {connectedUser ? (
            <div className="space-y-3">
              {/* Account card */}
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
                    <p className="text-[10px] text-muted-foreground">
                      {connectedUser.hiveBalance.toFixed(3)} HIVE
                    </p>
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
                  {/* Total Incoming */}
                  <div className="border border-border rounded-lg p-2.5 bg-green-500/5">
                    <TrendingUp className="size-4 text-green-400 mb-1" />
                    <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Incoming</p>
                    <p className="text-xs font-bold text-green-400 mt-0.5">
                      +{formatRcValue(delegationStats.incoming)}
                    </p>
                  </div>

                  {/* Total Outgoing */}
                  <div className="border border-border rounded-lg p-2.5 bg-destructive/5">
                    <TrendingDown className="size-4 text-destructive mb-1" />
                    <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Outgoing</p>
                    <p className="text-xs font-bold text-destructive mt-0.5">
                      {formatRcValue(delegationStats.outgoing)}
                    </p>
                  </div>

                  {/* Available */}
                  <div className="border border-border rounded-lg p-2.5 bg-blue-500/5">
                    <Zap className="size-4 text-blue-400 mb-1" />
                    <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Available</p>
                    <p className="text-xs font-bold text-blue-400 mt-0.5">
                      {formatRcValue(delegationStats.available)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Connect your main account:</p>
              <HiveLoginButton
                user={connectedUser}
                onLogin={handleLogin}
                onLogout={handleLogout}
              />
            </div>
          )}

          {/* G RC amount input + HP presets */}
          {connectedUser && (
            <div className="space-y-3">
              {/* Currency label + input */}
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
                    {hpEquiv && (
                      <p className="text-[9px] text-muted-foreground">≈ {hpEquiv} HP</p>
                    )}
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

              {/* HP preset buttons */}
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

              {/* Raw RC preview — so user knows exactly what goes into Keychain */}
              {rawRc > 0 && (
                <div className="flex items-center justify-between border border-border/50 rounded-lg px-3 py-2 bg-muted/20">
                  <p className="text-[10px] text-muted-foreground">max_rc (Keychain value)</p>
                  <p className="text-[10px] font-mono font-bold text-foreground">{rawRc.toLocaleString()}</p>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground">
                Higher amounts = better RC recovery for @{targetUsername}
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertCircle className="size-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="flex gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="size-4 text-green-400 flex-shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <p className="text-xs font-semibold text-green-300">RC delegated successfully!</p>
                {txId && (
                  <a
                    href={`https://hive.blog/tx/${txId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-green-300 hover:underline"
                  >
                    View transaction →
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Delegate button */}
          {connectedUser && (
            <Button
              onClick={handleDelegate}
              disabled={loading || success || rawRc <= 0}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Delegating...
                </>
              ) : success ? (
                <>
                  <CheckCircle2 className="size-4" />
                  Delegated!
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
