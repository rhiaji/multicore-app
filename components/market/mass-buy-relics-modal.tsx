"use client"

import { useState, useEffect, useMemo } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  Loader2,
  ShoppingCart,
  AlertCircle,
  CheckCircle2,
  Users,
  Package,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { HiveUser } from "@/lib/hive-auth"
import { massBuyRelics, MASS_BUY_MAX_OPS } from "@/lib/events/mass-buy-relics/action"

// ── Types ─────────────────────────────────────────────────────────────────────

type RelicType =
  | "common_relics"
  | "uncommon_relics"
  | "rare_relics"
  | "epic_relics"
  | "legendary_relics"

export interface RelicListing {
  username: string
  type: RelicType
  amount: number
  market: {
    listed: boolean
    amount: number
    price: string
    seller: string
    created: number
  }
}

interface MassBuyRelicsModalProps {
  open: boolean
  onClose: () => void
  listings: RelicListing[]
  user: HiveUser | null
  onRequestLogin: () => void
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "terracore_tracked_accounts"

const RARITY_LABELS: Record<RelicType, string> = {
  common_relics:    "Common",
  uncommon_relics:  "Uncommon",
  rare_relics:      "Rare",
  epic_relics:      "Epic",
  legendary_relics: "Legendary",
}

const RARITY_COLORS: Record<RelicType, string> = {
  common_relics:    "text-zinc-300 border-zinc-500/40 bg-zinc-600/20",
  uncommon_relics:  "text-[--color-ready] border-[--color-ready]/40 bg-[--color-ready]/10",
  rare_relics:      "text-blue-400 border-blue-400/40 bg-blue-400/10",
  epic_relics:      "text-purple-400 border-purple-400/40 bg-purple-400/10",
  legendary_relics: "text-amber-400 border-amber-400/40 bg-amber-400/10",
}

const RELIC_IMGS: Record<RelicType, string> = {
  common_relics:    "https://www.terracoregame.com/images/relics/common.png",
  uncommon_relics:  "https://www.terracoregame.com/images/relics/uncommon.png",
  rare_relics:      "https://www.terracoregame.com/images/relics/rare.png",
  epic_relics:      "https://www.terracoregame.com/images/relics/epic.png",
  legendary_relics: "https://www.terracoregame.com/images/relics/legendary.png",
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseHiveAmt(price: string): number {
  return parseFloat(price.split(" ")[0]) || 0
}


// ── Component ─────────────────────────────────────────────────────────────────

type TxState = "idle" | "pending" | "success" | "error"

export function MassBuyRelicsModal({
  open,
  onClose,
  listings,
  user,
  onRequestLogin,
}: MassBuyRelicsModalProps) {
  const [trackedUsernames, setTrackedUsernames] = useState<string[]>([])
  const [txState, setTxState] = useState<TxState>("idle")
  const [txError, setTxError] = useState<string | null>(null)

  // Load tracked usernames from localStorage
  useEffect(() => {
    if (!open) return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const parsed: string[] = raw ? JSON.parse(raw) : []
      setTrackedUsernames(parsed)
    } catch {
      setTrackedUsernames([])
    }
    setTxState("idle")
    setTxError(null)
  }, [open])

  // Filter listings to only those whose seller is in the tracked accounts list
  // and cap at MASS_BUY_MAX_OPS to match the transaction operation limit
  const allSellerListings = useMemo(() => {
    if (trackedUsernames.length === 0) return []
    return listings.filter(
      (l) => trackedUsernames.includes(l.market.seller)
    )
  }, [listings, trackedUsernames])

  const sellerListings = useMemo(
    () => allSellerListings.slice(0, MASS_BUY_MAX_OPS),
    [allSellerListings]
  )

  const isTruncated = allSellerListings.length > MASS_BUY_MAX_OPS

  // Group by seller → show all their listings
  const bySeller = useMemo(() => {
    const map = new Map<string, RelicListing[]>()
    for (const l of sellerListings) {
      const arr = map.get(l.market.seller) ?? []
      arr.push(l)
      map.set(l.market.seller, arr)
    }
    return map
  }, [sellerListings])

  // Total cost across all listings at full quantity
  const totalCost = useMemo(() => {
    return sellerListings.reduce((sum, l) => {
      return sum + parseHiveAmt(l.market.price) * l.market.amount
    }, 0)
  }, [sellerListings])

  const hasEnough = user ? user.hiveBalance >= totalCost : false
  const canBuy = sellerListings.length > 0 && hasEnough && txState === "idle" && !!user

  function handleBuy() {
    if (!user) return

    setTxState("pending")
    setTxError(null)

    massBuyRelics(
      {
        buyer:    user.username,
        listings: sellerListings.map((l) => {
          const unitPrice       = parseHiveAmt(l.market.price)
          const totalForListing = unitPrice * l.market.amount
          return {
            seller:     l.market.seller,
            type:       l.type,
            itemNumber: 0,
            amount:     l.market.amount,
            totalHive:  totalForListing.toFixed(3),
          }
        }),
      },
      (result) => {
        if (result.success) {
          setTxState("success")
        } else {
          setTxState("error")
          setTxError(result.message)
        }
      },
    )
  }

  function handleOpenChange(v: boolean) {
    if (!v && txState !== "pending") {
      setTxState("idle")
      setTxError(null)
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg w-full bg-card border-border p-0 gap-0 overflow-hidden max-h-[85vh] flex flex-col">
        <DialogTitle className="sr-only">Mass Buy Relics</DialogTitle>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border flex-shrink-0">
          <div className="size-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <ShoppingCart className="size-4 text-primary" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Market
            </p>
            <h2 className="text-sm font-bold text-foreground">Mass Buy Relics</h2>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground border border-border rounded px-2 py-1">
              <Users className="size-3" />
              {trackedUsernames.length} tracked
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4 min-h-0">
          {/* Not logged in */}
          {!user && (
            <div className="flex flex-col items-center gap-3 py-6">
              <p className="text-sm text-muted-foreground text-center">
                Connect your Hive account to buy relics.
              </p>
              <button
                onClick={() => { onClose(); onRequestLogin() }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
              >
                <ShoppingCart className="size-3.5" />
                Connect Account
              </button>
            </div>
          )}

          {/* No tracked accounts */}
          {user && trackedUsernames.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Users className="size-8 text-muted-foreground/40" />
              <p className="text-sm font-semibold text-foreground">No tracked accounts</p>
              <p className="text-xs text-muted-foreground">
                Add accounts on the dashboard to track their market listings.
              </p>
            </div>
          )}

          {/* No listings from tracked accounts */}
          {user && trackedUsernames.length > 0 && sellerListings.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Package className="size-8 text-muted-foreground/40" />
              <p className="text-sm font-semibold text-foreground">No listings found</p>
              <p className="text-xs text-muted-foreground">
                None of your {trackedUsernames.length} tracked account{trackedUsernames.length !== 1 ? "s have" : " has"} active relic listings.
              </p>
            </div>
          )}

          {/* Listings grouped by seller */}
          {user && sellerListings.length > 0 && txState !== "success" && (
            <>
              {/* Balance */}
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Your HIVE balance</span>
                <span className={cn(
                  "font-bold font-mono",
                  hasEnough || totalCost === 0 ? "text-foreground" : "text-destructive"
                )}>
                  {user.hiveBalance.toFixed(3)} HIVE
                </span>
              </div>

              {/* Per-seller listings */}
              <div className="flex flex-col gap-3">
                {Array.from(bySeller.entries()).map(([seller, items]) => {
                  const sellerTotal = items.reduce(
                    (s, l) => s + parseHiveAmt(l.market.price) * l.market.amount, 0
                  )
                  return (
                    <div key={seller} className="border border-border rounded-lg overflow-hidden">
                      {/* Seller header */}
                      <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-border">
                        <div className="flex items-center gap-2">
                          <img
                            src={`https://images.hive.blog/u/${seller}/avatar/small`}
                            alt={seller}
                            className="size-5 rounded-full object-cover"
                            crossOrigin="anonymous"
                            onError={(e) => { e.currentTarget.style.display = "none" }}
                          />
                          <span className="text-xs font-bold text-foreground font-mono">@{seller}</span>
                        </div>
                        <span className="text-xs font-bold font-mono text-foreground">
                          {sellerTotal.toFixed(3)} HIVE
                        </span>
                      </div>

                      {/* Relic rows */}
                      <div className="flex flex-col divide-y divide-border">
                        {items.map((l, i) => {
                          const unitPrice = parseHiveAmt(l.market.price)
                          const lineTotal = unitPrice * l.market.amount
                          return (
                            <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                              <img
                                src={RELIC_IMGS[l.type]}
                                alt={RARITY_LABELS[l.type]}
                                className="size-8 rounded object-contain flex-shrink-0"
                                crossOrigin="anonymous"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className={cn(
                                    "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border",
                                    RARITY_COLORS[l.type]
                                  )}>
                                    {RARITY_LABELS[l.type]}
                                  </span>
                                </div>
                                <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                                  {l.market.amount.toFixed(3)} relics × {unitPrice.toFixed(3)} HIVE
                                </p>
                              </div>
                              <span className="text-xs font-bold font-mono text-foreground flex-shrink-0">
                                {lineTotal.toFixed(3)} HIVE
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Truncation notice */}
              {isTruncated && (
                <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
                  <AlertCircle className="size-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-400">
                    Showing first {MASS_BUY_MAX_OPS} of {allSellerListings.length} listings. Each transaction is capped at {MASS_BUY_MAX_OPS} operations.
                  </p>
                </div>
              )}

              {/* Total cost summary */}
              <div className="flex items-center justify-between bg-muted/20 border border-border rounded-lg px-4 py-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Total Cost
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {sellerListings.length} listing{sellerListings.length !== 1 ? "s" : ""} from {bySeller.size} seller{bySeller.size !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className={cn(
                    "text-base font-bold font-mono",
                    hasEnough ? "text-foreground" : "text-destructive"
                  )}>
                    {totalCost.toFixed(3)} HIVE
                  </p>
                  {!hasEnough && (
                    <p className="text-[10px] text-destructive">Insufficient balance</p>
                  )}
                </div>
              </div>

              {/* Fee note */}
              <p className="text-[10px] text-muted-foreground">
                A 5% marketplace fee applies (2.5% to @terracore, 2.5% to the marketplace facilitator). All purchases broadcast in a single transaction.
              </p>

              {/* Error */}
              {txState === "error" && txError && (
                <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5">
                  <AlertCircle className="size-3.5 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">{txError}</p>
                </div>
              )}
            </>
          )}

          {/* Success state */}
          {txState === "success" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="size-12 rounded-full bg-[--color-ready]/20 border border-[--color-ready]/30 flex items-center justify-center">
                <CheckCircle2 className="size-6 text-[--color-ready]" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-foreground">Purchases Submitted</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {sellerListings.length} transaction{sellerListings.length !== 1 ? "s have" : " has"} been broadcast to the Hive blockchain.
                </p>
              </div>
              <button
                onClick={() => handleOpenChange(false)}
                className="px-6 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>

        {/* Footer — confirm button */}
        {user && sellerListings.length > 0 && txState !== "success" && (
          <div className="px-5 py-4 border-t border-border flex-shrink-0">
            <button
              onClick={handleBuy}
              disabled={!canBuy}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-colors",
                canBuy
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {txState === "pending" ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Waiting for Keychain...
                </>
              ) : (
                <>
                  <ShoppingCart className="size-4" />
                  Buy All for {totalCost.toFixed(3)} HIVE
                </>
              )}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
