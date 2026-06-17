"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { ShoppingCart, AlertCircle, CheckCircle2, Loader2, ExternalLink, Package } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UserRelic } from "@/lib/types"
import { sellAllRelics } from "@/lib/events/sell-all-relics/action"

// ── Types ─────────────────────────────────────────────────────────────────────

type RelicType = UserRelic["type"]

interface SellAllEntry {
  type: RelicType
  label: string
  img: string
  color: string
  border: string
  available: number   // rounded to 3dp for display/validation
  rawAmount: number   // full precision from the API, used in the broadcast payload
  quantity: string
  price: string
}

interface SellAllRelicsModalProps {
  open: boolean
  onClose: () => void
  userRelics: UserRelic[]
  username: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RARITY_META: {
  type: RelicType
  label: string
  img: string
  color: string
  border: string
}[] = [
  { type: "common_relics",    label: "Common",    img: "https://www.terracoregame.com/images/relics/common.png",    color: "text-foreground",         border: "border-border" },
  { type: "uncommon_relics",  label: "Uncommon",  img: "https://www.terracoregame.com/images/relics/uncommon.png",  color: "text-[--color-ready]",    border: "border-[--color-ready]/30" },
  { type: "rare_relics",      label: "Rare",      img: "https://www.terracoregame.com/images/relics/rare.png",      color: "text-blue-400",           border: "border-blue-400/30" },
  { type: "epic_relics",      label: "Epic",      img: "https://www.terracoregame.com/images/relics/epic.png",      color: "text-purple-400",         border: "border-purple-400/30" },
  { type: "legendary_relics", label: "Legendary", img: "https://www.terracoregame.com/images/relics/legendary.png", color: "text-[--color-amber]",    border: "border-[--color-amber]/30" },
]

// Window.hive_keychain is declared globally in lib/hive-auth.ts

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Same rule as the single-sell modal: unit price so that qty × price >= 0.1 HIVE */
function autoPrice(qty: number): string {
  if (qty <= 0) return ""
  const raw     = 0.1 / qty
  const rounded = Math.ceil(raw * 1000) / 1000
  return rounded.toFixed(3)
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SellAllRelicsModal({
  open,
  onClose,
  userRelics,
  username,
}: SellAllRelicsModalProps) {
  const [entries, setEntries]     = useState<SellAllEntry[]>([])
  const [status, setStatus]       = useState<"idle" | "pending" | "success" | "error">("idle")
  const [statusMsg, setStatusMsg] = useState("")

  // Build entry list with quantity = max and price pre-calculated
  useEffect(() => {
    if (!open) return
    const built: SellAllEntry[] = RARITY_META
      .map((meta) => {
        const relic     = userRelics.find((r) => r.type === meta.type)
        const rawAmount = relic?.amount ?? 0
        // Round to 3dp for display/validation — avoids false "exceeds" errors from float imprecision
        const available = Math.round(rawAmount * 1000) / 1000
        const qty       = available > 0 ? available.toFixed(3) : ""
        return {
          ...meta,
          available,
          rawAmount,
          quantity: qty,
          price:    available > 0 ? autoPrice(available) : "",
        }
      })
      .filter((e) => e.available > 0)
    setEntries(built)
    setStatus("idle")
    setStatusMsg("")
  }, [open, userRelics])

  function updateEntry(type: RelicType, field: "quantity" | "price", value: string) {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.type !== type) return e
        // When quantity changes, recalculate the price automatically
        if (field === "quantity") {
          const qty = parseFloat(value)
          return { ...e, quantity: value, price: autoPrice(qty) }
        }
        return { ...e, [field]: value }
      })
    )
  }

  function setMax(type: RelicType) {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.type !== type) return e
        // e.available is already rounded to 3dp from the useEffect
        return { ...e, quantity: e.available.toFixed(3), price: autoPrice(e.available) }
      })
    )
  }

  // Only entries that have valid qty and price
  const validEntries = entries.filter((e) => {
    const qty   = parseFloat(e.quantity)
    const price = parseFloat(e.price)
    return qty > 0 && qty <= e.available && price > 0
  })

  const canSubmit = validEntries.length > 0 && status !== "pending"

  function handleConfirm() {
    if (!canSubmit) return

    setStatus("pending")
    setStatusMsg("")

    sellAllRelics(
      {
        username,
        entries: validEntries.map((e) => ({
          type:   e.type,
          // Full raw API amount when selling max so the server zeros balance exactly.
          amount: parseFloat(e.quantity) === e.available ? e.rawAmount : parseFloat(e.quantity),
          price:  `${parseFloat(e.price).toFixed(3)} HIVE`,
        })),
      },
      (result) => {
        if (result.success) {
          setStatus("success")
          setStatusMsg(
            `Successfully listed ${validEntries.length} relic type${validEntries.length > 1 ? "s" : ""} on the marketplace.`
          )
        } else {
          setStatus("error")
          setStatusMsg(result.message)
        }
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg w-full p-0 bg-card border-border gap-0 overflow-hidden max-h-[90vh] flex flex-col">
        <DialogTitle className="sr-only">Sell All Relics</DialogTitle>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border flex-shrink-0">
          <Package className="size-5 text-primary" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-foreground">Sell All Relics</h2>
            <p className="text-[11px] text-muted-foreground">
              Set a price for each relic type · 5% marketplace fee applies
            </p>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-3">

          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No relics available to sell.</p>
          ) : (
            entries.map((entry) => {
              const qty       = parseFloat(entry.quantity) || 0
              const price     = parseFloat(entry.price) || 0
              const qtyError  = qty > entry.available ? `Max ${entry.available.toFixed(3)}` : qty <= 0 && entry.quantity !== "" ? "Must be > 0" : null
              const priceError = price <= 0 && entry.price !== "" ? "Must be > 0" : null
              const rowValid   = qty > 0 && qty <= entry.available && price > 0

              return (
                <div
                  key={entry.type}
                  className={cn(
                    "rounded-xl border p-3 flex flex-col gap-2 transition-colors",
                    rowValid ? "border-primary/30 bg-primary/5" : "border-border bg-card"
                  )}
                >
                  {/* Relic header */}
                  <div className="flex items-center gap-2">
                    <img src={entry.img} alt={entry.label} width={24} height={24} className="size-6 object-contain" />
                    <span className={cn("text-[11px] font-bold uppercase tracking-wider", entry.color)}>
                      {entry.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono ml-auto">
                      {entry.available.toFixed(3)} available
                    </span>
                  </div>

                  {/* Qty + Price row */}
                  <div className="grid grid-cols-2 gap-2">
                    {/* Quantity */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                        Quantity
                      </label>
                      <div className={cn(
                        "flex items-center rounded-lg border bg-background overflow-hidden transition-colors focus-within:border-primary/60",
                        qtyError ? "border-destructive/60" : "border-border"
                      )}>
                        <input
                          type="number"
                          value={entry.quantity}
                          onChange={(e) => updateEntry(entry.type, "quantity", e.target.value)}
                          placeholder="0.000"
                          min="0"
                          step="any"
                          className="flex-1 bg-transparent px-2.5 py-2 text-xs font-mono text-foreground outline-none placeholder:text-muted-foreground/50 w-0"
                        />
                        <button
                          onClick={() => setMax(entry.type)}
                          className="text-[9px] font-bold text-primary px-1.5 hover:text-primary/80 transition-colors"
                        >
                          MAX
                        </button>
                      </div>
                      {qtyError && <p className="text-[10px] text-destructive">{qtyError}</p>}
                    </div>

                    {/* Price */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                        Unit Price (HIVE)
                      </label>
                      <div className={cn(
                        "flex items-center rounded-lg border bg-background overflow-hidden transition-colors focus-within:border-primary/60",
                        priceError ? "border-destructive/60" : "border-border"
                      )}>
                        <input
                          type="number"
                          value={entry.price}
                          onChange={(e) => updateEntry(entry.type, "price", e.target.value)}
                          placeholder="0.000"
                          min="0"
                          step="any"
                          className="flex-1 bg-transparent px-2.5 py-2 text-xs font-mono text-foreground outline-none placeholder:text-muted-foreground/50"
                        />
                        <span className="text-[10px] text-muted-foreground pr-2 flex-shrink-0">HIVE</span>
                      </div>
                      {priceError
                        ? <p className="text-[10px] text-destructive">{priceError}</p>
                        : qty > 0 && price > 0
                          ? <p className="text-[10px] text-primary/70">auto-set · total ≥ 0.1 HIVE</p>
                          : null
                      }
                    </div>
                  </div>

                  {/* Total line */}
                  {rowValid && (
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">Total</span>
                      <span className="font-mono font-bold text-foreground">
                        {(qty * price).toFixed(3)} HIVE
                      </span>
                    </div>
                  )}
                </div>
              )
            })
          )}

          {/* Summary */}
          {validEntries.length > 0 && (
            <div className="rounded-lg bg-muted/40 border border-border px-3 py-2 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                {validEntries.length} type{validEntries.length > 1 ? "s" : ""} · grand total
              </span>
              <span className="text-sm font-bold font-mono text-foreground">
                {validEntries.reduce((sum, e) => sum + (parseFloat(e.quantity) || 0) * (parseFloat(e.price) || 0), 0).toFixed(3)}{" "}
                <span className="text-[11px] text-muted-foreground font-normal">HIVE</span>
              </span>
            </div>
          )}

          {/* Status */}
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
                {typeof window !== "undefined" && !window.hive_keychain && (
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
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-border flex gap-2 flex-shrink-0">
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
                    Confirm ({validEntries.length})
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
