"use client"

import { useState } from "react"
import { Flame, TrendingUp, X } from "lucide-react"
import { contributeFavor } from "@/lib/events/contribute-favor/action"

// Piecewise-linear crit lookup table: [totalFavor, critPercent]
const CRIT_TABLE: [number, number][] = [
  [0,          0],
  [8.47,       0.212],
  [10,         0.250],
  [25,         0.625],
  [50,         1.250],
  [100,        2.500],
  [250,        5.625],
  [500,        7.438],
  [1_000,      8.125],
  [2_000,      8.516],
  [5_000,      9.688],
  [10_000,     10.103],
  [25_000,     10.469],
  [50_000,     11.079],
  [100_000,    12.009],
  [250_000,    12.124],
  [500_000,    12.315],
  [1_000_000,  12.696],
  [2_500_000,  13.840],
  [5_000_000,  14.027],
]

function critPctForFavor(favor: number): number {
  if (favor <= 0) return 0
  const last = CRIT_TABLE[CRIT_TABLE.length - 1]
  if (favor >= last[0]) return last[1]
  for (let i = 1; i < CRIT_TABLE.length; i++) {
    const [f0, c0] = CRIT_TABLE[i - 1]
    const [f1, c1] = CRIT_TABLE[i]
    if (favor <= f1) {
      const t = (favor - f0) / (f1 - f0)
      return c0 + t * (c1 - c0)
    }
  }
  return 0
}

interface ContributeFavorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  username: string
  currentFavor: number
  liquidScrap: number
  onSuccess: () => void
}

export function ContributeFavorModal({
  open,
  onOpenChange,
  username,
  currentFavor,
  liquidScrap,
  onSuccess,
}: ContributeFavorModalProps) {
  const [rawAmount, setRawAmount] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const amount = parseFloat(rawAmount) || 0
  const newTotalFavor = currentFavor + amount
  const currentCritPct = critPctForFavor(currentFavor)
  const newCritPct = critPctForFavor(newTotalFavor)
  const critGainPct = newCritPct - currentCritPct
  const isValid = amount > 0 && amount <= liquidScrap

  function handleMax() {
    setRawAmount(liquidScrap.toFixed(3))
  }

  function handleConfirm() {
    if (!isValid || submitting) return
    setError(null)
    setSubmitting(true)
    contributeFavor({ username, amount }, (result) => {
      setSubmitting(false)
      if (result.success) {
        setRawAmount("")
        onOpenChange(false)
        onSuccess()
      } else {
        setError(result.message)
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="relative w-full max-w-md mx-4 bg-background border border-border rounded-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Flame className="size-4 text-[--color-ready]" />
            <h2 className="text-sm font-bold uppercase tracking-widest">Gain Favor</h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-4">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Burn SCRAP to gain Favor, increase your{" "}
            <span className="text-foreground font-bold">Critical Hit</span> skill and unlock new planets.
          </p>

          {/* Amount input */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-stretch border border-border rounded overflow-hidden bg-muted/30 focus-within:border-[--color-ready]/60 transition-colors">
              <input
                type="number"
                min="0"
                step="0.001"
                placeholder="Amount"
                value={rawAmount}
                onChange={(e) => { setRawAmount(e.target.value); setError(null) }}
                className="flex-1 bg-transparent px-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground outline-none"
              />
              <button
                onClick={handleMax}
                className="px-3 text-[10px] font-bold uppercase tracking-widest text-[--color-ready] border-l border-border hover:bg-[--color-ready]/10 transition-colors"
              >
                SCRAP
              </button>
            </div>
            <p className="text-[10px] text-right text-muted-foreground">
              Hive Engine Balance:{" "}
              <button
                onClick={handleMax}
                className="text-[--color-ready] font-mono font-bold hover:underline"
              >
                {liquidScrap.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} SCRAP
              </button>
            </p>
          </div>

          {/* Stat preview */}
          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <TrendingUp className="size-3 text-[--color-ready] flex-shrink-0" />
              <span>
                Crit Hit:{" "}
                <span className="text-[--color-ready] font-mono font-bold">
                  +{critGainPct.toFixed(3)}%
                </span>
                {", Total: "}
                <span className="text-foreground font-mono font-bold">
                  {newCritPct.toFixed(3)}%
                </span>
              </span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-[10px] text-destructive">{error}</p>
          )}

          {/* Confirm */}
          <button
            onClick={handleConfirm}
            disabled={!isValid || submitting}
            className={`w-full py-2.5 text-[11px] font-bold uppercase tracking-widest rounded border transition-colors ${
              isValid && !submitting
                ? "border-[--color-ready]/40 text-[--color-ready] hover:bg-[--color-ready]/10"
                : "border-border text-muted-foreground opacity-50 cursor-not-allowed"
            }`}
          >
            {submitting ? "Burning..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  )
}
