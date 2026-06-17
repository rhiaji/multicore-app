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
import { RefreshCw, ArrowDownUp } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Types ────────────────────────────────────────────────────────────────────

type RelicType =
  | "common_relics"
  | "uncommon_relics"
  | "rare_relics"
  | "epic_relics"
  | "legendary_relics"

interface LogEntry {
  action: string
  id: string
  item_number: string
  buyer: string
  seller: string
  price: number
  marketplace: string
  rarity: null
  qty: number
  created: number
}

interface ApiResponse {
  totalPages: number
  data: Array<{
    action: string
    id: string | number
    item_number: string | number
    buyer: string
    seller: string
    price: number | string
    marketplace: string
    rarity: string | null
    qty: number
    created: number
  }>
}

// ── Constants ────────────────────────────────────────────────────────────────

const RELIC_IDS = new Set<string>([
  "common_relics",
  "uncommon_relics",
  "rare_relics",
  "epic_relics",
  "legendary_relics",
])

const RARITY_LABELS: Record<RelicType, string> = {
  common_relics:    "Common",
  uncommon_relics:  "Uncommon",
  rare_relics:      "Rare",
  epic_relics:      "Epic",
  legendary_relics: "Legendary",
}

const RARITY_COLORS: Record<RelicType, string> = {
  common_relics:    "text-zinc-400 border-zinc-400/30 bg-zinc-400/10",
  uncommon_relics:  "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  rare_relics:      "text-blue-400 border-blue-400/30 bg-blue-400/10",
  epic_relics:      "text-purple-400 border-purple-400/30 bg-purple-400/10",
  legendary_relics: "text-amber-400 border-amber-400/30 bg-amber-400/10",
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(ms: number): string {
  const diff = Math.floor((Date.now() - ms) / 1000)
  if (diff < 60)  return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function fmtNum(n: number): string {
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(4).replace(/\.?0+$/, "")
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RelicsMarketLogs() {
  const [logs, setLogs]           = useState<LogEntry[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)
  const [page, setPage]           = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [filterType, setFilterType] = useState<RelicType | "all">("all")

  const fetchLogs = useCallback(async (p: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `https://api.terracoregame.com/marketplace_logs?action=purchase&limit=200&offset=${p}`
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: ApiResponse = await res.json()

      // Filter to relics only: id must be a string ending in _relics
      const relicOnly = json.data.filter(
        (entry) => typeof entry.id === "string" && RELIC_IDS.has(entry.id)
      ) as LogEntry[]

      setLogs(relicOnly)
      setTotalPages(json.totalPages)
      setLastFetched(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLogs(page) }, [fetchLogs, page])

  const filtered = filterType === "all"
    ? logs
    : logs.filter((l) => l.id === filterType)

  const typeCounts = (Object.keys(RARITY_LABELS) as RelicType[]).reduce<Record<string, number>>(
    (acc, t) => { acc[t] = logs.filter((l) => l.id === t).length; return acc },
    {}
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      {/* Logs header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ArrowDownUp className="size-3.5 text-primary" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-foreground">
            Market Logs
          </span>
          {!loading && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {filtered.length} relic trades
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastFetched && (
            <span className="text-[10px] text-muted-foreground hidden sm:block">
              {lastFetched.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => fetchLogs(page)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1 hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Relic type filter tabs */}
      <div className="flex items-center gap-0 border-b border-border px-4 overflow-x-auto">
        {([["all", "All"] as const, ...Object.entries(RARITY_LABELS) as [RelicType, string][]]).map(([val, label]) => {
          const count = val === "all" ? logs.length : (typeCounts[val] ?? 0)
          const isActive = filterType === val
          return (
            <button
              key={val}
              onClick={() => setFilterType(val as RelicType | "all")}
              disabled={val !== "all" && count === 0}
              className={cn(
                "relative flex items-center gap-1.5 px-4 py-3 text-[11px] font-semibold uppercase tracking-widest whitespace-nowrap transition-colors border-b-2 -mb-px disabled:opacity-30",
                isActive
                  ? "text-primary border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground hover:border-border"
              )}
            >
              {label}
              {count > 0 && (
                <span className={cn(
                  "text-[9px] font-bold px-1 py-0.5 rounded font-mono",
                  isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Table */}
      {error ? (
        <div className="py-16 text-center text-sm text-destructive">{error}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                Type
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                Buyer
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                Seller
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold text-right">
                Qty
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold text-right">
                Unit Price
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold text-right">
                Total
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold text-right hidden sm:table-cell">
                When
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i} className="border-border">
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-16" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-12 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-14 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-16 ml-auto" /></TableCell>
                  <TableCell className="text-right hidden sm:table-cell"><Skeleton className="h-3.5 w-14 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={7} className="text-center py-16 text-muted-foreground text-sm">
                  No relic purchases found on this page.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((log, i) => {
                const type = log.id as RelicType
                const colorCls = RARITY_COLORS[type] ?? "text-muted-foreground border-border bg-muted/20"
                const total = log.price * log.qty
                return (
                  <TableRow
                    key={i}
                    className="border-border hover:bg-muted/30 transition-colors"
                  >
                    {/* Type badge */}
                    <TableCell>
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider",
                        colorCls
                      )}>
                        {RARITY_LABELS[type]}
                      </span>
                    </TableCell>

                    {/* Buyer */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <img
                          src={`https://images.hive.blog/u/${log.buyer}/avatar/small`}
                          alt={log.buyer}
                          className="size-5 rounded-full object-cover bg-muted flex-shrink-0"
                          onError={(e) => { e.currentTarget.style.display = "none" }}
                        />
                        <span className="text-[12px] font-mono text-foreground">{log.buyer}</span>
                      </div>
                    </TableCell>

                    {/* Seller */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <img
                          src={`https://images.hive.blog/u/${log.seller}/avatar/small`}
                          alt={log.seller}
                          className="size-5 rounded-full object-cover bg-muted flex-shrink-0"
                          onError={(e) => { e.currentTarget.style.display = "none" }}
                        />
                        <span className="text-[12px] font-mono text-muted-foreground">{log.seller}</span>
                      </div>
                    </TableCell>

                    {/* Qty */}
                    <TableCell className="text-right">
                      <span className="text-[12px] font-mono text-foreground">
                        {fmtNum(log.qty)}
                      </span>
                    </TableCell>

                    {/* Unit price */}
                    <TableCell className="text-right">
                      <span className="text-[12px] font-mono text-foreground font-semibold">
                        {log.price.toFixed(3)}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-1">HIVE</span>
                    </TableCell>

                    {/* Total */}
                    <TableCell className="text-right">
                      <span className="text-[12px] font-mono text-primary font-semibold">
                        {total.toFixed(3)}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-1">HIVE</span>
                    </TableCell>

                    {/* When */}
                    <TableCell className="text-right hidden sm:table-cell">
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {relativeTime(log.created)}
                      </span>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
          >
            Previous
          </button>
          <span className="text-[11px] text-muted-foreground font-mono">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
