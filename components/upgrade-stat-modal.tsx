"use client"

import { useState } from "react"
import { Sword, Shield, Wrench, ArrowUpCircle, X, TrendingUp } from "lucide-react"
import { upgradeStat, upgradeCost, statLevel, type UpgradeStat } from "@/lib/events/upgrade-stat/action"

interface UpgradeStatModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  username: string
  player: {
    damage: number
    defense: number
    engineering: number
  }
  liquidScrap: number
  onSuccess: () => void
}

interface StatConfig {
  key: UpgradeStat
  label: string
  icon: React.ElementType
  rawValue: number
  description: string
}

export function UpgradeStatModal({
  open,
  onOpenChange,
  username,
  player,
  liquidScrap,
  onSuccess,
}: UpgradeStatModalProps) {
  const [loading, setLoading] = useState<UpgradeStat | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const stats: StatConfig[] = [
    {
      key: "damage",
      label: "Damage",
      icon: Sword,
      rawValue: player.damage,
      description: "Increases attack power in battles.",
    },
    {
      key: "defense",
      label: "Defense",
      icon: Shield,
      rawValue: player.defense,
      description: "Reduces damage taken from enemies.",
    },
    {
      key: "engineering",
      label: "Engineering",
      icon: Wrench,
      rawValue: player.engineering,
      description: "Improves SCRAP mine rate.",
    },
  ]

  function handleUpgrade(stat: UpgradeStat, currentLevel: number) {
    setError(null)
    setLoading(stat)
    upgradeStat(
      { username, stat, currentLevel },
      (result) => {
        setLoading(null)
        if (result.success) {
          onSuccess()
          onOpenChange(false)
        } else {
          setError(result.message)
        }
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md bg-background border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ArrowUpCircle className="size-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-widest">Upgrade Stat</h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Burn SCRAP to upgrade your stats. Cost is{" "}
            <span className="text-foreground font-mono font-bold">level²</span> SCRAP per upgrade.
          </p>

          {/* Hive Engine balance */}
          <div className="text-right text-[11px] text-muted-foreground">
            Liquid SCRAP:{" "}
            <span className="font-mono font-bold text-[--color-amber]">
              {liquidScrap.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
            </span>
          </div>

          {/* Stat upgrade cards */}
          <div className="flex flex-col gap-2">
            {stats.map(({ key, label, icon: Icon, rawValue, description }) => {
              const level = statLevel(key, player)
              const cost = upgradeCost(level)
              const canAfford = liquidScrap >= cost
              const isLoading = loading === key

              return (
                <div
                  key={key}
                  className="flex items-center gap-3 bg-muted/40 border border-border rounded-lg px-4 py-3"
                >
                  <Icon className="size-4 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-foreground mb-0.5">
                      {label}
                    </p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[10px] text-muted-foreground">
                        Value{" "}
                        <span className="font-mono font-bold text-foreground">{rawValue.toLocaleString()}</span>
                      </span>
                      <div className="w-px h-3 bg-border" />
                      <span className="text-[10px] text-muted-foreground">
                        Lv <span className="font-mono font-bold text-foreground">{level}</span>
                      </span>
                      <div className="w-px h-3 bg-border" />
                      <div className="flex items-center gap-1">
                        <TrendingUp className="size-2.5 text-[--color-ready]" />
                        <span className="text-[10px] text-muted-foreground">
                          Cost{" "}
                          <span className={`font-mono font-bold ${canAfford ? "text-[--color-ready]" : "text-destructive"}`}>
                            {cost.toLocaleString()} SCRAP
                          </span>
                        </span>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>
                  </div>
                  <button
                    onClick={() => handleUpgrade(key, level)}
                    disabled={!canAfford || loading !== null}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded border transition-colors flex-shrink-0 ${
                      canAfford && loading === null
                        ? "border-primary/40 text-primary hover:bg-primary/10"
                        : "border-border text-muted-foreground opacity-50 cursor-not-allowed"
                    }`}
                  >
                    <ArrowUpCircle className={`size-3 ${isLoading ? "animate-spin" : ""}`} />
                    {isLoading ? "..." : "Upgrade"}
                  </button>
                </div>
              )
            })}
          </div>

          {error && (
            <p className="text-[11px] text-destructive border border-destructive/30 bg-destructive/10 rounded px-3 py-2">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
