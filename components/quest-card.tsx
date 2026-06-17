"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import type { QuestSlot, PlayerData } from "@/lib/types"
import {
  QUEST_TYPE_CONFIG,
  TIER_COLORS,
  checkQuestRequirements,
  formatDuration,
  formatScrap,
  formatTimeRemaining,
  statLabel,
} from "@/lib/quest-utils"
import { Clock, Zap, CheckCircle2, XCircle, AlertTriangle, Loader2, Download } from "lucide-react"
import type { ActiveQuest } from "@/lib/types"

interface QuestCardProps {
  quest: QuestSlot
  player?: PlayerData | null
  activeQuests?: ActiveQuest[] | null
  /** The board's date string (e.g. "2026-06-15") — used to scope matching to today's quests only */
  boardDate?: string | null
  onClick?: () => void
}

export function QuestCard({ quest, player, activeQuests, boardDate, onClick }: QuestCardProps) {
  const config = QUEST_TYPE_CONFIG[quest.quest_type]
  const typeColor = config?.color ?? "text-muted-foreground border-border bg-muted"
  const tierColor = TIER_COLORS[quest.tier] ?? "bg-muted text-muted-foreground"

  // Cross-reference: find the active quest that belongs to THIS board slot.
  // Rules:
  //  1. name + quest_type + tier must match the slot.
  //  2. The board_date guard applies ONLY to already-collected quests: a quest
  //     collected on a previous day that shares the same name/type/tier must NOT
  //     colour today's fresh slot. Uncollected quests (in-progress or
  //     ready-to-collect) always match regardless of board_date — otherwise a
  //     quest started on a previous day's board could never be shown or
  //     collected once it finishes (the "Ready" never appears).
  //  3. If boardDate is unavailable we fall back to loose matching (no guard).
  const matchingActive = activeQuests?.find(
    (aq) =>
      aq.name       === quest.name       &&
      aq.quest_type === quest.quest_type &&
      aq.tier       === quest.tier       &&
      // Date guard only for collected quests
      (
        !aq.collected     ||   // uncollected → always match
        !boardDate        ||   // board date unknown — skip guard
        !aq.board_date    ||   // active quest has no date — skip guard
        aq.board_date === boardDate
      )
  ) ?? null

  const isReadyToClaim = matchingActive !== null && !matchingActive.collected && Date.now() >= matchingActive.completes_at
  const isInProgress   = matchingActive !== null && !matchingActive.collected && Date.now() <  matchingActive.completes_at
  // Only mark collected when the match passed the board_date guard above
  const isCollected    = matchingActive !== null && matchingActive.collected === true

  // Live countdown for in-progress quests
  const [timeLeft, setTimeLeft] = useState<number>(() =>
    matchingActive ? Math.max(0, matchingActive.completes_at - Date.now()) : 0
  )
  useEffect(() => {
    if (!isInProgress || !matchingActive) return
    const interval = setInterval(() => {
      const remaining = Math.max(0, matchingActive.completes_at - Date.now())
      setTimeLeft(remaining)
      if (remaining <= 0) clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [isInProgress, matchingActive])

  // Progress bar for active quests
  const progress = matchingActive
    ? Math.min(1, Math.max(0, (Date.now() - matchingActive.started_at) / (matchingActive.completes_at - matchingActive.started_at)))
    : 0

  // Only run requirement check when the quest is not already active
  const reqs = !matchingActive && player
    ? checkQuestRequirements(player, quest.quest_type, quest.tier)
    : null

  const statusIcon = reqs
    ? reqs.canStart
      ? <CheckCircle2 className="size-3 text-[--color-ready]" />
      : !reqs.itemRequired && reqs.levelMet && reqs.statMet
        ? <AlertTriangle className="size-3 text-[--color-amber]" />
        : <XCircle className="size-3 text-destructive" />
    : null

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative rounded-lg overflow-hidden border bg-card flex-shrink-0 w-44 text-left transition-all",
        "hover:border-primary/60 hover:shadow-[0_0_12px_rgba(0,0,0,0.4)] hover:-translate-y-0.5 active:translate-y-0",
        isReadyToClaim
          ? "border-[--color-ready]/60"
          : isInProgress
            ? "border-primary/40"
            : isCollected
              ? "border-border opacity-60"
              : reqs?.canStart
                ? "border-[--color-ready]/40"
                : reqs && !reqs.levelMet
                  ? "border-destructive/30 opacity-70"
                  : "border-border",
        onClick ? "cursor-pointer" : "cursor-default"
      )}
    >
      {/* Quest image */}
      <div className="relative h-24 overflow-hidden">
        <img
          src={quest.image_url}
          alt={quest.name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          crossOrigin="anonymous"
          onError={(e) => {
            const target = e.target as HTMLImageElement
            target.style.display = "none"
          }}
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
        {/* Collect overlay */}
        {isReadyToClaim && (
          <div className="absolute inset-0 bg-[--color-ready]/10 flex items-end justify-center pb-2">
            <span className="flex items-center gap-1 text-[11px] font-bold text-[--color-ready] bg-card/80 border border-[--color-ready]/50 rounded px-2 py-0.5 animate-pulse">
              <CheckCircle2 className="size-3" /> Collect!
            </span>
          </div>
        )}
        {/* Req status overlay */}
        {reqs && !reqs.canStart && (
          <div className="absolute inset-0 bg-card/30" />
        )}
      </div>

      {/* Progress bar for active quests */}
      {matchingActive && !isCollected && (
        <div className="h-0.5 bg-muted w-full">
          <div
            className={cn("h-full transition-all duration-1000", isReadyToClaim ? "bg-[--color-ready]" : "bg-primary")}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}
      {isCollected && <div className="h-0.5 bg-primary/40 w-full" />}

      {/* Quest info */}
      <div className="p-2 flex flex-col gap-1.5">
        <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2">
          {quest.name}
        </p>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-0.5">
            <Clock className="size-2.5" />
            {formatDuration(quest.duration_hours)}
          </span>
          <span className="flex items-center gap-0.5 text-[--color-scrap]">
            <Zap className="size-2.5" />
            {formatScrap(quest.scrap_cost)}
          </span>
        </div>

        {/* Status row — shows active quest state OR requirement check */}
        {isReadyToClaim ? (
          <div className="flex items-center gap-1 rounded px-1.5 py-1 bg-[--color-ready]/15 animate-pulse">
            <Download className="size-3 text-[--color-ready]" />
            <span className="text-[9px] font-bold text-[--color-ready]">Ready to Collect</span>
          </div>
        ) : isInProgress ? (
          <div className="flex items-center justify-between gap-1 rounded px-1.5 py-1 bg-primary/10">
            <div className="flex items-center gap-1">
              <Loader2 className="size-3 text-primary animate-spin" />
              <span className="text-[9px] font-semibold text-primary">In Progress</span>
            </div>
            <span className="text-[9px] font-mono text-primary/70">{formatTimeRemaining(timeLeft)}</span>
          </div>
        ) : isCollected ? (
          <div className="flex items-center gap-1 rounded px-1.5 py-1 bg-muted/60">
            <CheckCircle2 className="size-3 text-muted-foreground" />
            <span className="text-[9px] font-semibold text-muted-foreground">Collected</span>
          </div>
        ) : reqs ? (
          <div className={cn(
            "flex items-center gap-1 rounded px-1.5 py-1",
            reqs.canStart
              ? "bg-[--color-ready]/10"
              : !reqs.levelMet
                ? "bg-destructive/10"
                : "bg-muted/60"
          )}>
            {statusIcon}
            <span className={cn(
              "text-[9px] font-semibold truncate",
              reqs.canStart
                ? "text-[--color-ready]"
                : !reqs.levelMet
                  ? "text-destructive"
                  : !reqs.statMet
                    ? "text-destructive"
                    : "text-[--color-amber]"
            )}>
              {reqs.canStart
                ? "Can start"
                : !reqs.levelMet
                  ? `Lv ${reqs.requiredLevel}+ needed`
                  : !reqs.statMet
                    ? `${statLabel(config?.primaryStat ?? "")} ${reqs.requiredStat}+ needed`
                    : !reqs.itemEquipped && reqs.itemRequired
                      ? `${reqs.requiredItemSlot} required`
                      : "Item missing (opt)"}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between text-[9px] text-muted-foreground">
            <span>{quest.base_rolls} base rolls</span>
          </div>
        )}
      </div>
    </button>
  )
}
