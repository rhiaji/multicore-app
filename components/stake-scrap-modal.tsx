"use client"

import { useState } from "react"
import { X, TrendingUp, Layers } from "lucide-react"
import { stakeScrap } from "@/lib/events/stake-scrap/action"

// ---------------------------------------------------------------------------
// Piecewise-linear lookup tables for Dodge and Luck based on total staked SCRAP
// ---------------------------------------------------------------------------

const DODGE_TABLE: [number, number][] = [
  [0,           0],
  [249.467,     5.618],
  [250,         5.625],
  [500,         7.438],
  [1_000,       9.000],
  [2_000,       10.266],
  [5_000,       11.438],
  [10_000,      12.087],
  [25_000,      12.453],
  [50_000,      13.063],
  [100_000,     14.284],
  [250_000,     15.092],
  [500_000,     15.283],
  [1_000_000,   15.664],
  [2_500_000,   16.809],
  [5_000_000,   17.027],
]

const LUCK_TABLE: [number, number][] = [
  [0,           0],
  [249.467,     3.280],
  [250,         3.281],
  [500,         4.063],
  [1_000,       5.078],
  [2_000,       5.469],
  [5_000,       6.641],
  [10_000,      7.100],
  [25_000,      7.466],
  [50_000,      8.002],
  [100_000,     8.041],
  [250_000,     8.155],
  [500_000,     8.346],
  [1_000_000,   8.727],
  [2_500_000,   9.872],
  [5_000_000,   10.028],
]

function interpolate(table: [number, number][], value: number): number {
  if (value <= 0) return 0
  const last = table[table.length - 1]
  if (value >= last[0]) return last[1]
  for (let i = 1; i < table.length; i++) {
    const [x0, y0] = table[i - 1]
    const [x1, y1] = table[i]
    if (value <= x1) {
      const t = (value - x0) / (x1 - x0)
      return y0 + t * (y1 - y0)
    }
  }
  return 0
}

// ---------------------------------------------------------------------------

interface StakeScrapModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  username: string
  liquidScrap: number
  currentStaked: number   // current staked balance for preview baseline
  onSuccess: () => void
}

export function StakeScrapModal({
  open,
  onOpenChange,
  username,
  liquidScrap,
  currentStaked,
  onSuccess,
}: StakeScrapModalProps) {
  const [rawAmount, setRawAmount] = useState("")
  const [staking, setStaking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const amount = parseFloat(rawAmount) || 0
  const newStaked = currentStaked + amount

  const currentDodge = interpolate(DODGE_TABLE, currentStaked)
  const newDodge     = interpolate(DODGE_TABLE, newStaked)
  const dodgeGain    = newDodge - currentDodge

  const currentLuck  = interpolate(LUCK_TABLE, currentStaked)
  const newLuck      = interpolate(LUCK_TABLE, newStaked)
  const luckGain     = newLuck - currentLuck

  const isValid = amount > 0 && amount <= liquidScrap

  function handleMax() {
    setRawAmount(liquidScrap.toFixed(3))
  }

  function handleConfirm() {
    if (!isValid || staking) return
    setError(null)
    setStaking(true)
    stakeScrap({ username, amount }, (result) => {
      setStaking(false)
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
            <Layers className="size-4 text-[--color-ready]" />
            <h2 className="text-sm font-bold uppercase tracking-widest">Stake</h2>
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
            Stake SCRAP to increase your Stash size and your Dodge skill. The unstaking process
            takes 4 weeks with 25% of the tokens unlocked every week.
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
                onChange={(e) => setRawAmount(e.target.value)}
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

          {/* Stat previews */}
          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <TrendingUp className="size-3 text-[--color-ready] flex-shrink-0" />
              <span>
                Dodge:{" "}
                <span className="text-[--color-ready] font-mono font-bold">
                  +{dodgeGain.toFixed(3)}%
                </span>
                {", Total: "}
                <span className="text-foreground font-mono font-bold">
                  {newDodge.toFixed(3)}%
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <TrendingUp className="size-3 text-[--color-ready] flex-shrink-0" />
              <span>
                Luck:{" "}
                <span className="text-[--color-ready] font-mono font-bold">
                  +{luckGain.toFixed(3)}%
                </span>
                {", Total: "}
                <span className="text-foreground font-mono font-bold">
                  {newLuck.toFixed(3)}%
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
            disabled={!isValid || staking}
            className={`w-full py-2.5 text-[11px] font-bold uppercase tracking-widest rounded border transition-colors ${
              isValid && !staking
                ? "border-[--color-ready]/40 text-[--color-ready] hover:bg-[--color-ready]/10"
                : "border-border text-muted-foreground opacity-50 cursor-not-allowed"
            }`}
          >
            {staking ? "Staking..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  )
}
