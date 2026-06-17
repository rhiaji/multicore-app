"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { DelegateRcModal } from "@/components/delegate-rc-modal"
import { Zap, RefreshCw, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface RcEntry {
  username: string
  rcPercent: number
  rcCurrent: number
  rcMax: number
  loading: boolean
  error: string | null
}

interface RcOverviewPanelProps {
  open: boolean
  onClose: () => void
  usernames: string[]
  inline?: boolean  // when true, renders content directly without a Dialog wrapper
}

interface RcData { rcPercent: number; rcCurrent: number; rcMax: number }

/** Fetch RC for multiple accounts in a single rc_api.find_rc_accounts request */
async function fetchRcBatch(usernames: string[]): Promise<Map<string, RcData>> {
  const res = await fetch("https://api.hive.blog/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "rc_api.find_rc_accounts",
      params: { accounts: usernames },
    }),
  })
  const json = await res.json()
  const rcAccounts: any[] = json?.result?.rc_accounts ?? []
  const map = new Map<string, RcData>()
  for (const rca of rcAccounts) {
    const rcCurrent = Number(rca.rc_manabar.current_mana)
    const rcMax     = Number(rca.max_rc)
    const rcPercent = rcMax > 0 ? Math.min(100, (rcCurrent / rcMax) * 100) : 0
    map.set(rca.account, { rcPercent, rcCurrent, rcMax })
  }
  return map
}

function formatRcValue(rc: number): string {
  if (rc >= 1_000_000_000) return (rc / 1_000_000_000).toFixed(2) + " G"
  if (rc >= 1_000_000)     return (rc / 1_000_000).toFixed(2) + " M"
  return Math.floor(rc).toLocaleString()
}

function rcColor(pct: number): string {
  if (pct >= 50) return "text-green-400"
  if (pct >= 20) return "text-amber-400"
  return "text-destructive"
}

function rcBarColor(pct: number): string {
  if (pct >= 50) return "bg-green-500"
  if (pct >= 20) return "bg-amber-500"
  return "bg-destructive"
}

export function RcOverviewPanel({ open, onClose, usernames, inline = false }: RcOverviewPanelProps) {
  const [entries, setEntries]       = useState<RcEntry[]>([])
  const [delegateTarget, setDelegateTarget] = useState<{ username: string; rcPercent: number } | null>(null)

  // Build skeleton entries and fetch RC for each account.
  // When inline=true, `open` is always true so we trigger on mount via the `inline` flag.
  useEffect(() => {
    if ((!open && !inline) || usernames.length === 0) return

    const skeletons: RcEntry[] = usernames.map((u) => ({
      username: u,
      rcPercent: 0,
      rcCurrent: 0,
      rcMax: 0,
      loading: true,
      error: null,
    }))
    setEntries(skeletons)

    // One request for all accounts
    fetchRcBatch(usernames)
      .then((map) => {
        setEntries((prev) =>
          prev.map((e) => {
            const data = map.get(e.username)
            return data ? { ...e, ...data, loading: false } : { ...e, loading: false, error: "Not found" }
          })
        )
      })
      .catch((err) => {
        setEntries((prev) =>
          prev.map((e) => ({ ...e, loading: false, error: err?.message ?? "Failed to fetch RC" }))
        )
      })
  }, [open, usernames])

  function refreshEntry(username: string) {
    setEntries((prev) =>
      prev.map((e) => e.username === username ? { ...e, loading: true, error: null } : e)
    )
    fetchRcBatch([username])
      .then((map) => {
        const data = map.get(username)
        setEntries((prev) =>
          prev.map((e) =>
            e.username === username
              ? data ? { ...e, ...data, loading: false } : { ...e, loading: false, error: "Not found" }
              : e
          )
        )
      })
      .catch((err) => {
        setEntries((prev) =>
          prev.map((e) =>
            e.username === username ? { ...e, loading: false, error: err?.message ?? "Failed" } : e
          )
        )
      })
  }

  const content = (
    <div className="flex flex-col divide-y divide-border max-h-[60vh] overflow-y-auto">
      {entries.length === 0 && (
        <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
          No accounts tracked yet.
        </div>
      )}

      {entries.map((entry) => (
        <div key={entry.username} className="flex flex-col gap-2 px-5 py-4">
          {/* Row: avatar + name + RC% + actions */}
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <img
              src={`https://images.hive.blog/u/${entry.username}/avatar/small`}
              alt={entry.username}
              className="size-8 rounded-full object-cover flex-shrink-0 border border-border"
              onError={(e) => { e.currentTarget.style.display = "none" }}
            />

            {/* Name + raw RC */}
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">@{entry.username}</p>
              {entry.loading ? (
                <p className="text-[10px] text-muted-foreground">Loading...</p>
              ) : entry.error ? (
                <p className="text-[10px] text-destructive">{entry.error}</p>
              ) : (
                <p className="text-[10px] text-muted-foreground font-mono">
                  {formatRcValue(entry.rcCurrent)} / {formatRcValue(entry.rcMax)} RC
                </p>
              )}
            </div>

            {/* RC% badge */}
            {entry.loading ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground flex-shrink-0" />
            ) : !entry.error && (
              <span className={cn("text-sm font-bold tabular-nums flex-shrink-0", rcColor(entry.rcPercent))}>
                {entry.rcPercent.toFixed(1)}%
              </span>
            )}

            {/* Refresh button */}
            <button
              onClick={() => refreshEntry(entry.username)}
              disabled={entry.loading}
              className="flex-shrink-0 inline-flex items-center justify-center size-6 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className={cn("size-3", entry.loading && "animate-spin")} />
            </button>

            {/* Delegate RC button */}
            <button
              onClick={() => setDelegateTarget({ username: entry.username, rcPercent: entry.rcPercent })}
              disabled={entry.loading}
              className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded-md border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-40"
            >
              <Zap className="size-3" />
              Delegate
            </button>
          </div>

          {/* RC bar */}
          {!entry.loading && !entry.error && (
            <div className="w-full h-1.5 rounded-full bg-muted/50 overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-500", rcBarColor(entry.rcPercent))}
                style={{ width: `${Math.max(1, entry.rcPercent)}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <>
      {inline ? content : (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
          <DialogContent className="max-w-lg w-full p-0 bg-card border-border gap-0 overflow-hidden">
            <DialogTitle className="sr-only">RC Overview</DialogTitle>
            {/* Header */}
            <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
              <Zap className="size-4 text-amber-400" />
              <h2 className="text-sm font-bold tracking-wide uppercase text-foreground">RC Overview</h2>
              <span className="text-[10px] text-muted-foreground ml-1">
                {usernames.length} account{usernames.length !== 1 ? "s" : ""}
              </span>
            </div>
            {content}
          </DialogContent>
        </Dialog>
      )}

      {/* Delegate RC modal triggered from within this panel */}
      {delegateTarget && (
        <DelegateRcModal
          open={delegateTarget !== null}
          onOpenChange={(v) => { if (!v) setDelegateTarget(null) }}
          targetUsername={delegateTarget.username}
          currentRcPercent={delegateTarget.rcPercent}
          allUsernames={usernames}
        />
      )}
    </>
  )
}
