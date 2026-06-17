"use client"

import { useState, useEffect, useMemo } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ArrowDownUp,
  TrendingDown,
  Package,
  Tag,
  ShoppingCart,
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { HiveLoginButton } from "@/components/market/hive-login-button"
import { BuyRelicModal, type BuyRelicTarget } from "@/components/market/buy-relic-modal"
import { MassBuyRelicsModal } from "@/components/market/mass-buy-relics-modal"
import type { HiveUser } from "@/lib/hive-auth"
import { loadHiveUser, saveHiveUser, clearHiveUser } from "@/lib/hive-auth"
import { RelicsMarketLogs } from "@/components/market/relics-market-logs"

// ── Types ──────────────────────────────────────────────────────────────────────

type RelicType =
  | "common_relics"
  | "uncommon_relics"
  | "rare_relics"
  | "epic_relics"
  | "legendary_relics"

interface RelicListing {
  username: string
  version?: number
  type: RelicType
  amount: number
  market: {
    listed: boolean
    amount: number
    price: string
    seller: string
    created: number
    expires?: number
    sold?: number
  }
}

type SortField = "price" | "quantity" | "seller" | "listed"
type SortDir = "asc" | "desc"
type FilterTab = "all" | RelicType

// ── Constants ─────────────────────────────────────────────────────────────────

const RARITY_ORDER: RelicType[] = [
  "common_relics",
  "uncommon_relics",
  "rare_relics",
  "epic_relics",
  "legendary_relics",
]

const RARITY_LABELS: Record<RelicType, string> = {
  common_relics: "Common",
  uncommon_relics: "Uncommon",
  rare_relics: "Rare",
  epic_relics: "Epic",
  legendary_relics: "Legendary",
}

const RARITY_COLORS: Record<RelicType, string> = {
  common_relics:    "bg-zinc-600/30 text-zinc-300 border-zinc-500/40",
  uncommon_relics:  "bg-green-900/30 text-green-400 border-green-500/40",
  rare_relics:      "bg-blue-900/30 text-blue-400 border-blue-500/40",
  epic_relics:      "bg-purple-900/30 text-purple-400 border-purple-500/40",
  legendary_relics: "bg-amber-900/30 text-amber-400 border-amber-500/40",
}

const RELIC_ICONS: Record<RelicType, string> = {
  common_relics:    "https://www.terracoregame.com/images/relics/common.png",
  uncommon_relics:  "https://www.terracoregame.com/images/relics/uncommon.png",
  rare_relics:      "https://www.terracoregame.com/images/relics/rare.png",
  epic_relics:      "https://www.terracoregame.com/images/relics/epic.png",
  legendary_relics: "https://www.terracoregame.com/images/relics/legendary.png",
}

const FILTER_TABS: { label: string; value: FilterTab }[] = [
  { label: "All", value: "all" },
  { label: "Common", value: "common_relics" },
  { label: "Uncommon", value: "uncommon_relics" },
  { label: "Rare", value: "rare_relics" },
  { label: "Epic", value: "epic_relics" },
  { label: "Legendary", value: "legendary_relics" },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseHive(price: string): number {
  return parseFloat(price.split(" ")[0]) || 0
}

function fmtQty(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(2)}k`
  if (n >= 1) return n.toFixed(3)
  return n.toFixed(6)
}

function fmtHive(n: number): string {
  return n.toFixed(3)
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  return "< 1h ago"
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SortIcon({
  field,
  active,
  dir,
}: {
  field: string
  active: string
  dir: SortDir
}) {
  if (active !== field) return <ArrowUpDown className="size-3 ml-1 opacity-40" />
  return dir === "asc"
    ? <ArrowUp className="size-3 ml-1 text-primary" />
    : <ArrowDown className="size-3 ml-1 text-primary" />
}

function RelicIcon({ type }: { type: RelicType }) {
  const [errored, setErrored] = useState(false)
  const label = RARITY_LABELS[type]
  if (errored) {
    return (
      <div className="size-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-[10px] font-bold">
        {label[0]}
      </div>
    )
  }
  return (
    <img
      src={RELIC_ICONS[type]}
      alt={label}
      width={40}
      height={40}
      className="size-10 rounded-lg object-cover"
      onError={() => setErrored(true)}
      crossOrigin="anonymous"
    />
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-3 flex-1 min-w-0">
      <div className="size-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
        <Icon className="size-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="text-sm font-bold text-foreground font-mono truncate">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground font-mono">{sub}</p>}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function RelicsMarket() {
  const [listings, setListings] = useState<RelicListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterTab>("all")
  const [sortField, setSortField] = useState<SortField>("price")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [lastFetched, setLastFetched] = useState<Date | null>(null)
  const [hiveUser, setHiveUser] = useState<HiveUser | null>(null)
  const [buyTarget, setBuyTarget] = useState<BuyRelicTarget | null>(null)
  const [loginOpen, setLoginOpen] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [massBuyOpen, setMassBuyOpen] = useState(false)

  // Rehydrate from localStorage on first render (client-side only)
  useEffect(() => {
    const saved = loadHiveUser()
    if (saved) setHiveUser(saved)
  }, [])

  function handleLogin(user: HiveUser) {
    saveHiveUser(user)
    setHiveUser(user)
  }

  function handleLogout() {
    clearHiveUser()
    setHiveUser(null)
  }

  async function fetchListings() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("https://api.terracoregame.com/marketplace/listings/relics", {
        cache: "no-store",
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data: RelicListing[] = await res.json()
      setListings(data)
      setLastFetched(new Date())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchListings()
  }, [])

  // ── Derived data ────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return listings.filter(
      (l) => filter === "all" || l.type === filter
    )
  }, [listings, filter])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av = 0, bv = 0
      if (sortField === "price") {
        av = parseHive(a.market.price)
        bv = parseHive(b.market.price)
      } else if (sortField === "quantity") {
        av = a.market.amount
        bv = b.market.amount
      } else if (sortField === "seller") {
        return sortDir === "asc"
          ? a.market.seller.localeCompare(b.market.seller)
          : b.market.seller.localeCompare(a.market.seller)
      } else if (sortField === "listed") {
        av = a.market.created
        bv = b.market.created
      }
      return sortDir === "asc" ? av - bv : bv - av
    })
  }, [filtered, sortField, sortDir])

  // Per-rarity cheapest unit price
  const cheapestByRarity = useMemo(() => {
    const map: Partial<Record<RelicType, number>> = {}
    for (const l of listings) {
      const p = parseHive(l.market.price)
      if (map[l.type] === undefined || p < map[l.type]!) {
        map[l.type] = p
      }
    }
    return map
  }, [listings])

  // Summary stats
  const stats = useMemo(() => {
    const total = listings.length
    const cheapest = listings.length
      ? Math.min(...listings.map((l) => parseHive(l.market.price)))
      : 0
    const byType = RARITY_ORDER.reduce<Record<string, number>>((acc, t) => {
      acc[t] = listings.filter((l) => l.type === t).length
      return acc
    }, {})
    return { total, cheapest, byType }
  }, [listings])

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top Nav */}
      <header className="border-b border-border bg-card/80 sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 h-12 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/dashboard"
              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest whitespace-nowrap"
            >
              Dashboard
            </Link>
            <span className="text-border">/</span>
            <span className="text-[11px] font-semibold text-primary uppercase tracking-widest whitespace-nowrap">
              Market
            </span>
            <span className="text-border hidden sm:inline">/</span>
            <span className="text-[11px] text-muted-foreground uppercase tracking-widest hidden sm:inline">
              Relics
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setMassBuyOpen(true)}
              disabled={listings.length === 0}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold border rounded-md px-2.5 py-1 transition-colors bg-primary/10 border-primary/40 text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ShoppingCart className="size-3" />
              <span className="hidden sm:inline">Mass Buy</span>
              <span className="sm:hidden">Buy</span>
            </button>
            <button
              onClick={() => setShowLogs((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 text-[11px] font-semibold border rounded-md px-2.5 py-1 transition-colors",
                showLogs
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "text-muted-foreground border-border hover:text-foreground hover:bg-muted"
              )}
            >
              <ArrowDownUp className="size-3" />
              <span className="hidden sm:inline">Market Logs</span>
              <span className="sm:hidden">Logs</span>
            </button>
            <HiveLoginButton
              user={hiveUser}
              onLogin={handleLogin}
              onLogout={handleLogout}
              forceOpen={loginOpen}
              onForceOpenHandled={() => setLoginOpen(false)}
            />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Page title */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Market</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Relic listings — sorted by lowest unit price by default
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {lastFetched && (
              <span className="text-[10px] text-muted-foreground hidden sm:block">
                Updated {lastFetched.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={fetchListings}
              disabled={loading || showLogs}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1 hover:bg-muted transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("size-3", loading && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            icon={Tag}
            label="Total Listings"
            value={stats.total.toString()}
            sub={`${Object.entries(stats.byType).filter(([,v]) => v > 0).map(([k, v]) => `${v} ${RARITY_LABELS[k as RelicType]}`).join(" · ")}`}
          />
          <StatCard
            icon={TrendingDown}
            label="Cheapest Listing"
            value={`${fmtHive(stats.cheapest)} HIVE`}
          />
          <StatCard
            icon={Package}
            label="Rarity Types"
            value={Object.values(stats.byType).filter(Boolean).length.toString()}
            sub="types with active listings"
          />
        </div>

        {/* Logs view */}
        {showLogs && <RelicsMarketLogs />}

        {/* Filter tabs + table card */}
        <div className={cn("border border-border rounded-xl overflow-hidden bg-card", showLogs && "hidden")}>
          {/* Tabs */}
          <div className="flex items-center gap-0 border-b border-border px-4 overflow-x-auto">
            {FILTER_TABS.map((tab) => {
              const count =
                tab.value === "all"
                  ? listings.length
                  : listings.filter((l) => l.type === tab.value).length
              const isActive = filter === tab.value
              return (
                <button
                  key={tab.value}
                  onClick={() => setFilter(tab.value)}
                  disabled={tab.value !== "all" && count === 0}
                  className={cn(
                    "relative flex items-center gap-1.5 px-4 py-3 text-[11px] font-semibold uppercase tracking-widest whitespace-nowrap transition-colors border-b-2 -mb-px disabled:opacity-30",
                    isActive
                      ? "text-primary border-primary"
                      : "text-muted-foreground border-transparent hover:text-foreground hover:border-border"
                  )}
                >
                  {tab.label}
                  {count > 0 && (
                    <span
                      className={cn(
                        "text-[9px] font-bold px-1 py-0.5 rounded font-mono",
                        isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Table */}
          {error ? (
            <div className="py-16 text-center text-sm text-destructive">
              Failed to load listings: {error}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold w-[240px] sm:w-[340px]">
                    Item
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold hidden sm:table-cell">
                    Rarity
                  </TableHead>
                  <TableHead
                    className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold cursor-pointer select-none hidden md:table-cell"
                    onClick={() => toggleSort("seller")}
                  >
                    <span className="inline-flex items-center">
                      Seller
                      <SortIcon field="seller" active={sortField} dir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead
                    className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold cursor-pointer select-none hidden md:table-cell"
                    onClick={() => toggleSort("quantity")}
                  >
                    <span className="inline-flex items-center">
                      Quantity
                      <SortIcon field="quantity" active={sortField} dir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead
                    className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold cursor-pointer select-none text-right"
                    onClick={() => toggleSort("price")}
                  >
                    <span className="inline-flex items-center justify-end w-full">
                      Unit Price
                      <SortIcon field="price" active={sortField} dir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead
                    className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold cursor-pointer select-none hidden sm:table-cell"
                    onClick={() => toggleSort("listed")}
                  >
                    <span className="inline-flex items-center">
                      Listed
                      <SortIcon field="listed" active={sortField} dir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold w-16 sm:w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Skeleton className="size-10 rounded-lg" />
                          <div className="flex flex-col gap-1">
                            <Skeleton className="h-3.5 w-28" />
                            <Skeleton className="h-2.5 w-44" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><Skeleton className="h-5 w-16 hidden sm:block" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-3.5 w-20" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-3.5 w-12" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                      <TableCell className="hidden sm:table-cell"><Skeleton className="h-3.5 w-14" /></TableCell>
                      <TableCell><Skeleton className="h-7 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : sorted.length === 0 ? (
                  <TableRow className="border-border">
                    <TableCell colSpan={7} className="text-center py-16 text-muted-foreground text-sm">
                      No listings found for this rarity.
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.map((listing, idx) => {
                    const hivePrice = parseHive(listing.market.price)
                    const isCheapest = cheapestByRarity[listing.type] === hivePrice
                    return (
                      <TableRow
                        key={`${listing.username}-${listing.type}-${idx}`}
                        className="border-border hover:bg-muted/30 transition-colors"
                      >
                        {/* Item */}
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <RelicIcon type={listing.type} />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-foreground">
                                {RARITY_LABELS[listing.type]} Relics
                              </p>
                              <p className="text-[11px] text-muted-foreground hidden sm:block">
                                Combine 100 relics to craft a{" "}
                                {RARITY_LABELS[listing.type].toLowerCase()} crate
                              </p>
                              {/* Mobile: show seller inline under name */}
                              <p className="text-[10px] text-muted-foreground font-mono sm:hidden">
                                {listing.market.seller}
                              </p>
                            </div>
                          </div>
                        </TableCell>

                        {/* Rarity — hidden on mobile */}
                        <TableCell className="hidden sm:table-cell">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-bold uppercase tracking-wider",
                              RARITY_COLORS[listing.type]
                            )}
                          >
                            {RARITY_LABELS[listing.type]}
                          </Badge>
                        </TableCell>

                        {/* Seller — hidden on mobile */}
                        <TableCell className="hidden md:table-cell">
                          <a
                            href={`https://terracoregame.com/player/${listing.market.seller}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[12px] text-foreground font-mono hover:text-primary transition-colors"
                          >
                            {listing.market.seller}
                          </a>
                        </TableCell>

                        {/* Quantity — hidden on mobile */}
                        <TableCell className="hidden md:table-cell">
                          <span className="text-[12px] font-mono text-foreground">
                            {fmtQty(listing.market.amount)}
                          </span>
                        </TableCell>

                        {/* Unit Price */}
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <div className="flex items-center gap-1.5">
                              {isCheapest && (
                                <span className="text-[9px] font-bold uppercase bg-[--color-ready]/20 text-[--color-ready] border border-[--color-ready]/30 rounded px-1 py-0.5">
                                  Lowest
                                </span>
                              )}
                              <span className="text-sm font-bold text-foreground font-mono">
                                {fmtHive(hivePrice)}
                              </span>
                              <span className="text-[11px] text-muted-foreground">HIVE</span>
                            </div>
                          </div>
                        </TableCell>

                        {/* Listed */}
                        <TableCell className="hidden sm:table-cell">
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {relativeTime(listing.market.created)}
                          </span>
                        </TableCell>

                        {/* Buy */}
                        <TableCell>
                          <button
                            onClick={() => setBuyTarget({
                              seller:     listing.market.seller,
                              type:       listing.type,
                              amount:     listing.market.amount,
                              price:      listing.market.price,
                              itemNumber: 0,
                            })}
                            className={cn(
                              "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors border",
                              hiveUser
                                ? "bg-primary/10 border-primary/40 text-primary hover:bg-primary/20 hover:border-primary/60"
                                : "bg-muted/30 border-border text-muted-foreground hover:text-primary hover:border-primary/40"
                            )}
                          >
                            <ShoppingCart className="size-3" />
                            Buy
                          </button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </main>

      {/* Buy modal */}
      <BuyRelicModal
        open={buyTarget !== null}
        onClose={() => setBuyTarget(null)}
        target={buyTarget}
        user={hiveUser}
        onRequestLogin={() => setLoginOpen(true)}
      />

      {/* Mass Buy modal */}
      <MassBuyRelicsModal
        open={massBuyOpen}
        onClose={() => setMassBuyOpen(false)}
        listings={listings}
        user={hiveUser}
        onRequestLogin={() => { setMassBuyOpen(false); setLoginOpen(true) }}
      />
    </div>
  )
}
