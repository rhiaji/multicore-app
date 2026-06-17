"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { X, ShoppingCart, AlertCircle, CheckCircle2, Loader2, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { sellRelic } from "@/lib/events/sell-relic/action"

// ── Types ─────────────────────────────────────────────────────────────────────

type RelicType =
  | "common_relics"
  | "uncommon_relics"
  | "rare_relics"
  | "epic_relics"
  | "legendary_relics"

interface SellRelicModalProps {
  open: boolean
  onClose: () => void
  relicType: RelicType | null
  available: number
  username: string
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
  common_relics:    "text-foreground bg-zinc-600/30 border-zinc-500/40",
  uncommon_relics:  "text-[--color-ready] bg-[--color-ready]/10 border-[--color-ready]/30",
  rare_relics:      "text-blue-400 bg-blue-400/10 border-blue-400/30",
  epic_relics:      "text-purple-400 bg-purple-400/10 border-purple-400/30",
  legendary_relics: "text-[--color-amber] bg-[--color-amber]/10 border-[--color-amber]/30",
}

const RELIC_IMGS: Record<RelicType, string> = {
  common_relics:    "https://www.terracoregame.com/images/relics/common.png",
  uncommon_relics:  "https://www.terracoregame.com/images/relics/uncommon.png",
  rare_relics:      "https://www.terracoregame.com/images/relics/rare.png",
  epic_relics:      "https://www.terracoregame.com/images/relics/epic.png",
  legendary_relics: "https://www.terracoregame.com/images/relics/legendary.png",
}

// Approximate HIVE → USD (can be updated from API later)
const HIVE_USD = 0.052

// Approximate SCRAP per HIVE (rough market rate)
const HIVE_TO_SCRAP = 2360

// Window.hive_keychain is declared globally in lib/hive-auth.ts

// ── Component ─────────────────────────────────────────────────────────────────

export function SellRelicModal({
  open,
  onClose,
  relicType,
  available,
  username,
}: SellRelicModalProps) {
  const [quantity, setQuantity]   = useState("")
  const [price, setPrice]         = useState("")
  const [priceAuto, setPriceAuto] = useState(true) // tracks whether price was auto-set
  const [status, setStatus]       = useState<"idle" | "pending" | "success" | "error">("idle")
  const [statusMsg, setStatusMsg] = useState("")

  // Compute the minimum unit price so that qty × price >= 0.1 HIVE
  function autoPrice(qty: number): string {
    if (qty <= 0) return ""
    const raw = 0.1 / qty
    // Round up to 3 decimal places
    const rounded = Math.ceil(raw * 1000) / 1000
    return rounded.toFixed(3)
  }

  // Reset form when opened with a new relic
  useEffect(() => {
    if (open) {
      const avail = Math.round(available * 1000) / 1000
      const qty   = avail > 0 ? avail.toFixed(3) : ""
      setQuantity(qty)
      setPrice(avail > 0 ? autoPrice(avail) : "")
      setPriceAuto(true)
      setStatus("idle")
      setStatusMsg("")
    }
  }, [open, available])

  // Recalculate price when quantity changes, only if still in auto mode
  function handleQuantityChange(val: string) {
    setQuantity(val)
    if (priceAuto) {
      const qty = parseFloat(val)
      setPrice(qty > 0 ? autoPrice(qty) : "")
    }
  }

  function handlePriceChange(val: string) {
    setPrice(val)
    setPriceAuto(false) // user took manual control
  }

  if (!relicType) return null

  const label  = RARITY_LABELS[relicType]
  const img    = RELIC_IMGS[relicType]
  const colors = RARITY_COLORS[relicType]

  // Round available to 3dp to avoid float imprecision (e.g. 0.9509999999999998 vs 0.951)
  const availableRounded = Math.round(available * 1000) / 1000

  const qty        = parseFloat(quantity) || 0
  const unitPrice  = parseFloat(price) || 0
  const totalHive  = qty * unitPrice
  const totalUSD   = totalHive * HIVE_USD
  const totalScrap = totalHive * HIVE_TO_SCRAP

  const qtyError   = qty > availableRounded ? `Exceeds available (${availableRounded.toFixed(3)})` : qty <= 0 && quantity !== "" ? "Must be > 0" : null
  const priceError = unitPrice <= 0 && price !== "" ? "Must be > 0" : null
  const canSubmit  = qty > 0 && qty <= availableRounded && unitPrice > 0 && status !== "pending"

  function handleSetMax() {
    const avail = Math.round(available * 1000) / 1000
    setQuantity(avail.toFixed(3))
    setPrice(avail > 0 ? autoPrice(avail) : "")
    setPriceAuto(true)
  }

  function handleConfirm() {
    if (!canSubmit) return

    setStatus("pending")
    setStatusMsg("")

    // Send full raw API amount when selling max so the server can zero the balance exactly.
    const broadcastAmount = (qty === availableRounded) ? available : qty

    sellRelic(
      {
        username,
        relicType,
        amount:       broadcastAmount,
        price:        `${unitPrice.toFixed(3)} HIVE`,
        displayLabel: `List ${qty.toFixed(3)} ${label} Relics for ${unitPrice.toFixed(3)} HIVE each`,
      },
      (result) => {
        if (result.success) {
          setStatus("success")
          setStatusMsg(`Successfully listed ${qty.toFixed(3)} ${label} Relics for ${unitPrice.toFixed(3)} HIVE each.`)
        } else {
          setStatus("error")
          setStatusMsg(result.message)
        }
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md w-full p-0 bg-card border-border gap-0 overflow-hidden">
        <DialogTitle className="sr-only">List {label} Relics for Sale</DialogTitle>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <img src={img} alt={label} width={28} height={28} className="size-7 object-contain" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-foreground">List For Sale</h2>
            <p className="text-[11px] text-muted-foreground">
              {label} Relics · 5% marketplace fee
            </p>
          </div>
          <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded border", colors)}>
            {label}
          </span>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-4">

          {/* Info */}
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            List relics on the in-game marketplace. All sales are subject to a 5% fee
            (2.5% to @terracore & 2.5% to the marketplace facilitating the transaction).
          </p>

          {/* Quantity */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Quantity
            </label>
            <div className="flex items-center gap-0 rounded-lg border border-border bg-background overflow-hidden focus-within:border-primary/60 transition-colors">
              <input
                type="number"
                value={quantity}
                onChange={(e) => handleQuantityChange(e.target.value)}
                placeholder="0.000"
                min="0"
                step="any"
                className="flex-1 bg-transparent px-3 py-2.5 text-sm font-mono text-foreground outline-none placeholder:text-muted-foreground/50"
              />
              <div className="flex items-center gap-1 pr-2">
                <button
                  onClick={handleSetMax}
                  className="text-[10px] font-bold text-primary hover:text-primary/80 uppercase tracking-wider px-1.5 py-1 rounded hover:bg-primary/10 transition-colors"
                >
                  Max
                </button>
                <span className="text-[11px] font-semibold text-muted-foreground border-l border-border pl-2 py-1">
                  RELICS
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              {qtyError
                ? <p className="text-[11px] text-destructive">{qtyError}</p>
                : <span />
              }
              <p className="text-[11px] text-muted-foreground font-mono ml-auto">
                Available:{" "}
                <span className={cn("font-semibold", availableRounded > 0 ? "text-[--color-ready]" : "text-muted-foreground")}>
                  {availableRounded.toFixed(3)}
                </span>
              </p>
            </div>
          </div>

          {/* Unit Price */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Price <span className="text-muted-foreground/60 normal-case tracking-normal">(unit price)</span>
            </label>
            <div className="flex items-center gap-0 rounded-lg border border-border bg-background overflow-hidden focus-within:border-primary/60 transition-colors">
              <input
                type="number"
                value={price}
                onChange={(e) => handlePriceChange(e.target.value)}
                placeholder="0.000"
                min="0"
                step="0.001"
                className="flex-1 bg-transparent px-3 py-2.5 text-sm font-mono text-foreground outline-none placeholder:text-muted-foreground/50"
              />
              <span className="text-[11px] font-semibold text-muted-foreground border-l border-border px-3 py-2.5">
                HIVE
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              {priceError
                ? <p className="text-[11px] text-destructive">{priceError}</p>
                : priceAuto && qty > 0
                  ? <p className="text-[11px] text-primary/70">Auto-set · total ≥ 0.1 HIVE minimum</p>
                  : <span />
              }
              {totalHive > 0 && (
                <p className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">
                  ~${totalUSD.toFixed(3)} · {totalHive.toFixed(3)} HIVE
                </p>
              )}
            </div>
          </div>

          {/* Summary row */}
          {canSubmit && (
            <div className="flex items-center justify-between rounded-lg bg-muted/40 border border-border px-3 py-2">
              <span className="text-[11px] text-muted-foreground">Total value</span>
              <span className="text-sm font-bold font-mono text-foreground">
                {totalHive.toFixed(3)}{" "}
                <span className="text-[11px] text-muted-foreground font-normal">HIVE</span>
              </span>
            </div>
          )}

          {/* Status message */}
          {status === "success" && (
            <div className="flex items-start gap-2 rounded-lg bg-[--color-ready]/10 border border-[--color-ready]/30 px-3 py-2.5">
              <CheckCircle2 className="size-4 text-[--color-ready] flex-shrink-0 mt-0.5" />
              <p className="text-[12px] text-[--color-ready] leading-relaxed">{statusMsg}</p>
            </div>
          )}
          {status === "error" && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2.5">
              <AlertCircle className="size-4 text-destructive flex-shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <p className="text-[12px] text-destructive leading-relaxed">{statusMsg}</p>
                {!window?.hive_keychain && (
                  <a
                    href="https://hive-keychain.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                  >
                    Get Hive Keychain <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {status === "success" ? (
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg bg-[--color-ready]/20 border border-[--color-ready]/40 text-[--color-ready] text-sm font-bold hover:bg-[--color-ready]/30 transition-colors"
              >
                Done
              </button>
            ) : (
              <>
                <button
                  onClick={onClose}
                  disabled={status === "pending"}
                  className="flex-1 py-2.5 rounded-lg border border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!canSubmit}
                  className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {status === "pending" ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Waiting...
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="size-4" />
                      Confirm
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
