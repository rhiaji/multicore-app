"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { RefreshCw, X, ShoppingCart, Tag, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Types ────────────────────────────────────────────────────────────────────

const RELIC_IDS = new Set([
  "common_relics",
  "uncommon_relics",
  "rare_relics",
  "epic_relics",
  "legendary_relics",
])

type ActionType = "purchase" | "create" | "cancel"

interface LogEntry {
  action: ActionType
  id: string | number
  item_number: string | number
  buyer: string | null
  seller: string | null
  price: number | string
  marketplace: string | null
  rarity: string | null
  qty?: number
  created: number
}

const RARITY_LABELS: Record<string, string> = {
  common_relics:    "Common",
  uncommon_relics:  "Uncommon",
  rare_relics:      "Rare",
  epic_relics:      "Epic",
  legendary_relics: "Legendary",
}

const RARITY_COLORS: Record<string, string> = {
  common_relics:    "text-zinc-300 border-zinc-400/30 bg-zinc-400/10",
  uncommon_relics:  "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  rare_relics:      "text-blue-400 border-blue-400/30 bg-blue-400/10",
  epic_relics:      "text-purple-400 border-purple-400/30 bg-purple-400/10",
  legendary_relics: "text-amber-400 border-amber-400/30 bg-amber-400/10",
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(ms: number): string {
  const diff = Math.floor((Date.now() - ms) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  const days = Math.floor(diff / 86400)
  if (days < 365)   return `${days}d ago`
  return `${Math.floor(days / 365)}y ago`
}

function parsePrice(price: number | string): number {
  if (typeof price === "number") return price
  return parseFloat(price.replace(/[^0-9.]/g, "")) || 0
}

function isRelic(entry: LogEntry): boolean {
  return typeof entry.id === "string" && RELIC_IDS.has(entry.id)
}

function ActionBadge({ action }: { action: ActionType }) {
  if (action === "purchase") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 uppercase tracking-wider">
        <ShoppingCart className="size-2.5" />
        Sold
      </span>
    )
  }
  if (action === "create") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary uppercase tracking-wider">
        <Tag className="size-2.5" />
        Listed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-red-400 uppercase tracking-wider">
      <XCircle className="size-2.5" />
      Cancelled
    </span>
  )
}

function ItemLabel({ entry }: { entry: LogEntry }) {
  const id = entry.id
  if (isRelic(entry)) {
    const label = RARITY_LABELS[id as string] ?? String(id)
    const color = RARITY_COLORS[id as string] ?? "text-muted-foreground border-border bg-muted/20"
    return (
      <span className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider",
        color
      )}>
        {label} Relic
      </span>
    )
  }
  return (
    <span className="text-[12px] font-mono text-foreground">
      Item #{entry.item_number}
    </span>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface UserMarketLogsProps {
  username: string
  onClose: () => void
}

type FilterTab = "all" | "purchase" | "create" | "cancel"

export function UserMarketLogs({ username, onClose }: UserMarketLogsProps) {
  const [logs, setLogs]         = useState<LogEntry[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)
  const [filter, setFilter]     = useState<FilterTab>("all")
  const [relicsOnly, setRelicsOnly] = useState(false)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`https://api.terracoregame.com/marketplace_logs/${username}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: LogEntry[] = await res.json()
      setLogs(data)
      setLastFetched(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs")
    } finally {
      setLoading(false)
    }
  }, [username])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const filtered = logs.filter((l) => {
    if (relicsOnly && !isRelic(l)) return false
    if (filter !== "all" && l.action !== filter) return false
    return true
  })

  const counts: Record<FilterTab, number> = {
    all:      logs.length,
    purchase: logs.filter((l) => l.action === "purchase").length,
    create:   logs.filter((l) => l.action === "create").length,
    cancel:   logs.filter((l) => l.action === "cancel").length,
  }

  const relicCount = logs.filter(isRelic).length

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all",      label: "All" },
    { key: "purchase", label: "Sold" },
    { key: "create",   label: "Listed" },
    { key: "cancel",   label: "Cancelled" },
  ]

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border gap-3">
        <div className="flex items-center gap-3">
          <img
            src={`https://images.hive.blog/u/${username}/avatar/small`}
            alt={username}
            className="size-7 rounded-full object-cover bg-muted flex-shrink-0"
            onError={(e) => { e.currentTarget.style.display = "none" }}
          />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-foreground leading-tight">
              {username}&apos;s Market Logs
            </p>
            {!loading && (
              <p className="text-[10px] text-muted-foreground font-mono">
                {logs.length} records &mdash; {relicCount} relic entries
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastFetched && (
            <span className="text-[10px] text-muted-foreground hidden sm:block">
              {lastFetched.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground border border-border rounded-md px-2 py-1 hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3", loading && "animate-spin")} />
          </button>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground border border-border rounded-md px-2 py-1 hover:bg-muted transition-colors"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-0 border-b border-border px-3 overflow-x-auto">
        {tabs.map(({ key, label }) => {
          const count = counts[key]
          const isActive = filter === key
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "relative flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-widest whitespace-nowrap transition-colors border-b-2 -mb-px",
                isActive
                  ? "text-primary border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground hover:border-border"
              )}
            >
              {label}
              <span className={cn(
                "text-[9px] font-bold px-1 py-0.5 rounded font-mono",
                isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
              )}>
                {count}
              </span>
            </button>
          )
        })}

        {/* Relics-only toggle */}
        <button
          onClick={() => setRelicsOnly((v) => !v)}
          className={cn(
            "ml-auto flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap rounded-md transition-colors mr-1",
            relicsOnly
              ? "bg-primary/10 text-primary border border-primary/40"
              : "text-muted-foreground border border-border hover:text-foreground"
          )}
        >
          Relics only
        </button>
      </div>

      {/* Table */}
      {error ? (
        <div className="py-12 text-center text-sm text-destructive">{error}</div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold w-32">
                  Item
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold w-24">
                  Action
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                  Owner / Seller
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                  Buyer / Recipient
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold text-right">
                  Qty
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold text-right hidden sm:table-cell">
                  Timestamp
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold text-right">
                  Price
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-16" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-3.5 w-10 ml-auto" /></TableCell>
                    <TableCell className="text-right hidden sm:table-cell"><Skeleton className="h-3.5 w-14 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-3.5 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow className="border-border">
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                    No records found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((entry, i) => {
                  const price = parsePrice(entry.price)
                  const qty   = entry.qty ?? 0
                  return (
                    <TableRow
                      key={i}
                      className={cn(
                        "border-border transition-colors",
                        entry.action === "purchase"
                          ? "hover:bg-emerald-500/5"
                          : entry.action === "cancel"
                          ? "hover:bg-red-500/5"
                          : "hover:bg-muted/30"
                      )}
                    >
                      {/* Item */}
                      <TableCell>
                        <ItemLabel entry={entry} />
                      </TableCell>

                      {/* Action */}
                      <TableCell>
                        <ActionBadge action={entry.action} />
                      </TableCell>

                      {/* Owner / Seller */}
                      <TableCell>
                        {entry.seller ? (
                          <div className="flex items-center gap-1.5">
                            <img
                              src={`https://images.hive.blog/u/${entry.seller}/avatar/small`}
                              alt={entry.seller}
                              className="size-5 rounded-full object-cover bg-muted flex-shrink-0"
                              onError={(e) => { e.currentTarget.style.display = "none" }}
                            />
                            <span className="text-[11px] font-mono text-foreground">{entry.seller}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">—</span>
                        )}
                      </TableCell>

                      {/* Buyer / Recipient */}
                      <TableCell>
                        {entry.buyer ? (
                          <div className="flex items-center gap-1.5">
                            <img
                              src={`https://images.hive.blog/u/${entry.buyer}/avatar/small`}
                              alt={entry.buyer}
                              className="size-5 rounded-full object-cover bg-muted flex-shrink-0"
                              onError={(e) => { e.currentTarget.style.display = "none" }}
                            />
                            <span className="text-[11px] font-mono text-primary">{entry.buyer}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">—</span>
                        )}
                      </TableCell>

                      {/* Qty */}
                      <TableCell className="text-right">
                        <span className="text-[11px] font-mono text-foreground">
                          {qty > 0 ? qty.toFixed(qty % 1 === 0 ? 0 : 3) : "—"}
                        </span>
                      </TableCell>

                      {/* Timestamp */}
                      <TableCell className="text-right hidden sm:table-cell">
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {relativeTime(entry.created)}
                        </span>
                      </TableCell>

                      {/* Price */}
                      <TableCell className="text-right">
                        {price > 0 ? (
                          <>
                            <span className={cn(
                              "text-[12px] font-mono font-semibold",
                              entry.action === "purchase" ? "text-emerald-400" : "text-foreground"
                            )}>
                              {price.toFixed(3)}
                            </span>
                            <span className="text-[10px] text-muted-foreground ml-1">HIVE</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Footer count */}
      {!loading && filtered.length > 0 && (
        <div className="px-4 py-2.5 border-t border-border">
          <span className="text-[10px] text-muted-foreground font-mono">
            Showing {filtered.length} of {logs.length} records
          </span>
        </div>
      )}
    </div>
  )
}
