"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Loader2, ShoppingCart, AlertCircle, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { HiveUser } from "@/lib/hive-auth"
import { buyRelic } from "@/lib/events/buy-relic/action"

// ── Types ─────────────────────────────────────────────────────────────────────

type RelicType =
  | "common_relics"
  | "uncommon_relics"
  | "rare_relics"
  | "epic_relics"
  | "legendary_relics"

export interface BuyRelicTarget {
  seller: string
  type: RelicType
  amount: number           // quantity available
  price: string            // e.g. "0.100 HIVE"
  itemNumber: number       // listing item_number
}

interface BuyRelicModalProps {
  open: boolean
  onClose: () => void
  target: BuyRelicTarget | null
  user: HiveUser | null
  onRequestLogin: () => void
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RARITY_LABELS: Record<RelicType, string> = {
  common_relics:    "Common",
  uncommon_relics:  "Uncommon",
  rare_relics:      "Rare",
  epic_relics:      "Epic",
  legendary_relics: "Legendary",
}

const RARITY_COLORS: Record<RelicType, string> = {
  common_relics:    "text-foreground border-zinc-500/40 bg-zinc-600/20",
  uncommon_relics:  "text-[--color-ready] border-[--color-ready]/40 bg-[--color-ready]/10",
  rare_relics:      "text-blue-400 border-blue-400/40 bg-blue-400/10",
  epic_relics:      "text-purple-400 border-purple-400/40 bg-purple-400/10",
  legendary_relics: "text-[--color-amber] border-[--color-amber]/40 bg-[--color-amber]/10",
}

const RELIC_IMGS: Record<RelicType, string> = {
  common_relics:    "https://www.terracoregame.com/images/relics/common.png",
  uncommon_relics:  "https://www.terracoregame.com/images/relics/uncommon.png",
  rare_relics:      "https://www.terracoregame.com/images/relics/rare.png",
  epic_relics:      "https://www.terracoregame.com/images/relics/epic.png",
  legendary_relics: "https://www.terracoregame.com/images/relics/legendary.png",
}


function parseHiveAmt(price: string): number {
  return parseFloat(price.split(" ")[0]) || 0
}

// ── Component ─────────────────────────────────────────────────────────────────

type TxState = "idle" | "pending" | "success" | "error"

export function BuyRelicModal({
  open,
  onClose,
  target,
  user,
  onRequestLogin,
}: BuyRelicModalProps) {
  const [qty, setQty] = useState("")
  const [txState, setTxState] = useState<TxState>("idle")
  const [txError, setTxError] = useState<string | null>(null)

  // Reset when opening a new target
  function handleOpenChange(v: boolean) {
    if (!v && txState !== "pending") {
      setQty("")
      setTxState("idle")
      setTxError(null)
      onClose()
    }
  }

  if (!target) return null

  const unitPrice   = parseHiveAmt(target.price)
  const parsedQty   = parseFloat(qty) || 0
  // Use a small epsilon to guard against floating-point precision drift
  const exceedsAmt  = parsedQty > target.amount + 0.0001
  const effectiveQty = exceedsAmt ? parsedQty : Math.min(parsedQty, target.amount)
  const totalCost   = effectiveQty * unitPrice
  const hasEnough   = user ? user.hiveBalance >= totalCost : false
  const canBuy      = parsedQty > 0 && !exceedsAmt && hasEnough && txState === "idle"

  function handleBuy() {
    if (!user || !target) return
    setTxState("pending")
    setTxError(null)

    buyRelic(
      {
        buyer:      user.username,
        seller:     target.seller,
        type:       target.type,
        itemNumber: String(target.itemNumber),
        amount:     effectiveQty,
        totalHive:  totalCost.toFixed(3),
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md w-full bg-card border-border p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">
          Buy {target ? RARITY_LABELS[target.type] : ""} Relics
        </DialogTitle>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <img
            src={RELIC_IMGS[target.type]}
            alt={RARITY_LABELS[target.type]}
            className="size-9 object-contain"
            crossOrigin="anonymous"
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Buy Relics
            </p>
            <h2 className="text-sm font-bold text-foreground">
              {RARITY_LABELS[target.type]} Relics
            </h2>
          </div>
          <span className={cn(
            "ml-auto text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border",
            RARITY_COLORS[target.type]
          )}>
            {RARITY_LABELS[target.type]}
          </span>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {/* Listing info */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-muted/30 border border-border rounded-lg px-3 py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                Seller
              </p>
              <p className="text-xs font-bold text-foreground font-mono truncate">
                {target.seller}
              </p>
            </div>
            <div className="bg-muted/30 border border-border rounded-lg px-3 py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                Unit Price
              </p>
              <p className="text-xs font-bold text-foreground font-mono">
                {unitPrice.toFixed(3)} HIVE
              </p>
            </div>
            <div className="bg-muted/30 border border-border rounded-lg px-3 py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                Available
              </p>
              <p className="text-xs font-bold text-foreground font-mono">
                {target.amount.toFixed(3)}
              </p>
            </div>
          </div>

          {/* Not logged in */}
          {!user && (
            <div className="flex flex-col gap-2 items-center py-2">
              <p className="text-xs text-muted-foreground text-center">
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

          {/* Logged in — quantity input */}
          {user && txState !== "success" && (
            <>
              {/* Balance */}
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Your HIVE balance</span>
                <span className={cn(
                  "font-bold font-mono",
                  hasEnough || parsedQty === 0 ? "text-foreground" : "text-destructive"
                )}>
                  {user.hiveBalance.toFixed(3)} HIVE
                </span>
              </div>

              {/* Quantity input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Quantity
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min={0}
                      max={target.amount}
                      step={0.001}
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      placeholder={`Max ${target.amount.toFixed(3)}`}
                      disabled={txState === "pending"}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 font-mono disabled:opacity-50"
                    />
                  </div>
                  <button
                    onClick={() => setQty(target.amount.toFixed(3))}
                    disabled={txState === "pending"}
                    className="px-3 py-2 rounded-lg border border-border text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
                  >
                    Max
                  </button>
                </div>
                {exceedsAmt && (
                  <p className="text-[10px] text-destructive">
                    Quantity exceeds available amount.
                  </p>
                )}
              </div>

              {/* Cost summary */}
              {parsedQty > 0 && (
                <div className="bg-muted/20 border border-border rounded-lg px-4 py-3 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Total Cost</span>
                  <span className={cn(
                    "text-sm font-bold font-mono",
                    hasEnough ? "text-foreground" : "text-destructive"
                  )}>
                    {totalCost.toFixed(3)} HIVE
                    {!hasEnough && (
                      <span className="ml-2 text-[10px] text-destructive font-normal">
                        Insufficient balance
                      </span>
                    )}
                  </span>
                </div>
              )}

              {/* Error */}
              {txState === "error" && txError && (
                <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5">
                  <AlertCircle className="size-3.5 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">{txError}</p>
                </div>
              )}

              {/* Fee note */}
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                A 5% marketplace fee applies (2.5% to @terracore, 2.5% to the marketplace facilitator).
              </p>

              {/* Confirm button */}
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
                    {parsedQty > 0
                      ? `Buy for ${totalCost.toFixed(3)} HIVE`
                      : "Enter a quantity"}
                  </>
                )}
              </button>
            </>
          )}

          {/* Success */}
          {txState === "success" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="size-12 rounded-full bg-[--color-ready]/20 border border-[--color-ready]/30 flex items-center justify-center">
                <CheckCircle2 className="size-6 text-[--color-ready]" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-foreground">Purchase Submitted</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Your transaction has been broadcast to the Hive blockchain.
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
      </DialogContent>
    </Dialog>
  )
}
