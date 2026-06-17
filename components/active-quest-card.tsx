"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import type { ActiveQuest } from "@/lib/types"
import { QUEST_TYPE_CONFIG, TIER_COLORS, formatTimeRemaining, statLabel } from "@/lib/quest-utils"
import { CheckCircle2, Clock, Zap } from "lucide-react"

interface ActiveQuestCardProps {
  quest: ActiveQuest
  onClick?: () => void
}

export function ActiveQuestCard({ quest, onClick }: ActiveQuestCardProps) {
  const config = QUEST_TYPE_CONFIG[quest.quest_type]
  const typeColor = config?.color ?? "text-muted-foreground border-border bg-muted"
  const tierColor = TIER_COLORS[quest.tier] ?? "bg-muted text-muted-foreground"

  const isComplete = quest.time_remaining_ms <= 0 || Date.now() >= quest.completes_at
  const isCollected = quest.collected
  const needsClaim = isComplete && !isCollected

  const [timeLeft, setTimeLeft] = useState<number>(() => Math.max(0, quest.completes_at - Date.now()))

  useEffect(() => {
    if (isCollected || isComplete) return
    const interval = setInterval(() => {
      const remaining = Math.max(0, quest.completes_at - Date.now())
      setTimeLeft(remaining)
      if (remaining <= 0) clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [quest.completes_at, isCollected, isComplete])

  const totalDuration = quest.completes_at - quest.started_at
  const elapsed = Date.now() - quest.started_at
  const progress = Math.min(1, Math.max(0, elapsed / totalDuration))

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative rounded-lg overflow-hidden border bg-card flex-shrink-0 w-48 text-left transition-all",
        "hover:shadow-[0_0_12px_rgba(0,0,0,0.4)] hover:-translate-y-0.5 active:translate-y-0",
        isCollected
          ? "border-primary/40 bg-primary/5 cursor-pointer"
          : needsClaim
            ? "border-[--color-ready]/60 shadow-[0_0_8px_rgba(0,0,0,0.3)] cursor-pointer"
            : "border-border cursor-pointer"
      )}
    >
      {/* Quest image */}
      <div className="relative h-24 overflow-hidden">
        <img
          src={quest.image_url}
          alt={quest.name}
          className="w-full h-full object-cover transition-transform duration-300"
          crossOrigin="anonymous"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />

        {/* Tier badge */}
        <span className={cn("absolute top-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded", tierColor)}>
          T{quest.tier}
        </span>
        {/* Type badge */}
        <span className={cn("absolute top-1.5 right-1.5 text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded border tracking-wide", typeColor)}>
          {config?.label ?? quest.quest_type}
        </span>

        {/* Claim ready overlay */}
        {needsClaim && (
          <div className="absolute inset-0 bg-[--color-ready]/10 flex items-end justify-center pb-2">
            <span className="flex items-center gap-1 text-[11px] font-bold text-[--color-ready] bg-card/80 border border-[--color-ready]/50 rounded px-2 py-0.5 animate-pulse">
              <CheckCircle2 className="size-3" /> Collect!
            </span>
          </div>
        )}

        {/* Collected overlay */}
        {isCollected && (
          <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
            <div className="bg-primary/90 rounded-full p-1">
              <CheckCircle2 className="size-4 text-primary-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {!isCollected && (
        <div className="h-0.5 bg-muted w-full">
          <div
            className={cn("h-full transition-all", isComplete ? "bg-[--color-ready]" : "bg-primary")}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}
      {isCollected && <div className="h-0.5 bg-primary w-full" />}

      {/* Info */}
      <div className="p-2 flex flex-col gap-1.5">
        <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2">{quest.name}</p>

        {/* Status row */}
        <div className="flex items-center justify-between gap-1">
          {isCollected ? (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-primary">
              <CheckCircle2 className="size-3" /> Collected
            </span>
          ) : needsClaim ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-[--color-ready]">
              <CheckCircle2 className="size-3" /> Ready!
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="size-2.5" />
              {formatTimeRemaining(timeLeft)}
            </span>
          )}
          <span className="flex items-center gap-0.5 text-[10px] text-[--color-scrap] font-mono">
            <Zap className="size-2.5" />
            {quest.scrap_paid}
          </span>
        </div>

        {/* Stat */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-muted-foreground uppercase">
            {statLabel(quest.primary_stat)}
          </span>
          <span className="text-[9px] font-bold font-mono text-foreground">
            {quest.effective_primary_stat.toLocaleString()}
          </span>
          <span className="text-[9px] text-muted-foreground">·</span>
          <span className="text-[9px] font-semibold text-primary">{quest.base_rolls} rolls</span>
        </div>
      </div>
    </button>
  )
}
