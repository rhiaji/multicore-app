"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { PlayerData, QuestSlot, ActiveQuest } from "@/lib/types"
import { questStart } from "@/lib/events/quest-start/action"
import { questCollect } from "@/lib/events/quest-collect/action"
import {
  checkQuestRequirements,
  QUEST_TYPE_CONFIG,
  TIER_COLORS,
  RELIC_RATES,
  ITEM_SLOT_ORDER,
  ITEM_SLOT_LABEL,
  formatDuration,
  formatScrap,
  formatTimeRemaining,
  statLabel,
  getEffectiveStat,
  getSecondaryStat,
} from "@/lib/quest-utils"
import {
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Shield,
  Sword,
  Wrench,
  Star,
  AlertTriangle,
  Layers,
  TrendingUp,
  Download,
  Timer,
  Play,
  Loader2,
} from "lucide-react"

const SLOT_ICONS: Record<string, React.ReactNode> = {
  weapon: <Sword className="size-3.5" />,
  armor:  <Shield className="size-3.5" />,
  ship:   <span className="text-[11px] leading-none">🚀</span>,
  avatar: <span className="text-[11px] leading-none">👤</span>,
  tool:   <Wrench className="size-3.5" />,
}

const RELIC_IMAGES: Record<string, string> = {
  legendary: "https://www.terracoregame.com/images/relics/legendary.png",
  epic:      "https://www.terracoregame.com/images/relics/epic.png",
  rare:      "https://www.terracoregame.com/images/relics/rare.png",
  uncommon:  "https://www.terracoregame.com/images/relics/uncommon.png",
  common:    "https://www.terracoregame.com/images/relics/common.png",
}

const RARITY_COLORS: Record<string, string> = {
  legendary: "text-[--color-amber]",
  epic:      "text-purple-400",
  rare:      "text-blue-400",
  uncommon:  "text-[--color-ready]",
  common:    "text-muted-foreground",
}

interface QuestDetailModalProps {
  open: boolean
  onClose: () => void
  quest: QuestSlot | ActiveQuest | null
  player: PlayerData | null
  username?: string
  activeQuests?: ActiveQuest[] | null
  /** Today's board date (e.g. "2026-06-15") — scopes active-quest matching to the current day */
  boardDate?: string | null
  onActionSuccess?: () => void
}

function isActiveQuest(q: QuestSlot | ActiveQuest): q is ActiveQuest {
  return "_id" in q
}

interface QuestRewards {
  common:    number
  uncommon:  number
  rare:      number
  epic:      number
  legendary: number
}

interface QuestLogEntry {
  action:   string
  name:     string
  rewards?: QuestRewards
  xp?:      number
  time:     string
}

export function QuestDetailModal({ open, onClose, quest, player, username, activeQuests, boardDate, onActionSuccess }: QuestDetailModalProps) {
  const [timeLeft, setTimeLeft] = useState(0)
  const [txState, setTxState]   = useState<"idle" | "pending" | "polling" | "success" | "error">("idle")
  const [txError, setTxError]   = useState<string | null>(null)
  const [rewards, setRewards]   = useState<QuestRewards | null>(null)
  const [xpGained, setXpGained] = useState<number | null>(null)
  const [hasCollected, setHasCollected] = useState(false) // Persist collecting state

  const active     = quest && isActiveQuest(quest) ? quest : null
  const isComplete  = active ? Date.now() >= active.completes_at : false
  const isCollected = active?.collected ?? false
  const needsClaim  = active && isComplete && !isCollected

  // For a QuestSlot opened from the board, find its matching active quest.
  // Same rule as quest-card.tsx: the board_date guard applies ONLY to collected
  // quests so a previous-day collected quest doesn't match today's slot.
  // Uncollected quests (in-progress / ready-to-collect) always match regardless
  // of board_date, so a quest started on a previous day can still be collected.
  const matchingActive = !active && quest && activeQuests
    ? activeQuests.find(
        (aq) =>
          aq.name       === quest.name       &&
          aq.quest_type === quest.quest_type &&
          aq.tier       === quest.tier       &&
          (!aq.collected || !boardDate || !aq.board_date || aq.board_date === boardDate)
      ) ?? null
    : null

  const effectiveActive   = active ?? matchingActive
  const effectiveComplete = effectiveActive ? Date.now() >= effectiveActive.completes_at : false
  const effectiveCollected = effectiveActive?.collected ?? false
  const effectiveNeedsClaim = effectiveActive && effectiveComplete && !effectiveCollected
  const isInProgress      = effectiveActive && !effectiveComplete && !effectiveCollected

  useEffect(() => {
    if (!effectiveActive || effectiveCollected || effectiveComplete) return
    const update = () => setTimeLeft(Math.max(0, effectiveActive.completes_at - Date.now()))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [effectiveActive, effectiveCollected, effectiveComplete])

  useEffect(() => {
    if (!open) {
      setTxState("idle")
      setTxError(null)
      setRewards(null)
      setXpGained(null)
    }
  }, [open])

  // After a quest start is confirmed, reset txState once the refreshed data
  // shows the quest is now active — so the modal re-renders as in-progress
  useEffect(() => {
    if (txState === "success" && effectiveActive && !effectiveNeedsClaim) {
      setTxState("idle")
    }
  }, [txState, effectiveActive, effectiveNeedsClaim])

  function pollForRewards(snapshotTime: string) {
    const started = Date.now()
    const MAX_WAIT = 60_000 // 60s timeout
    const interval = setInterval(async () => {
      if (Date.now() - started > MAX_WAIT) {
        clearInterval(interval)
        setTxState("error")
        setTxError("Timed out waiting for confirmation. Check your quest logs.")
        return
      }
      try {
        const res  = await fetch(`https://api.terracoregame.com/quest_logs/${username}?limit=5`)
        const logs: QuestLogEntry[] = await res.json()
        const entry = logs.find(
          (l) => l.action === "complete" && new Date(l.time) > new Date(snapshotTime)
        )
        if (entry && entry.rewards) {
          clearInterval(interval)
          setRewards(entry.rewards)
          setXpGained(entry.xp ?? null)
          setTxState("success")
          onActionSuccess?.()
        }
      } catch { /* keep polling */ }
    }, 5_000)
  }

  async function handleAction() {
    if (!username || !quest) return
    setTxState("pending")
    setTxError(null)

    if (effectiveNeedsClaim) {
      // Snapshot latest quest log time before submitting
      let snapshotTime = new Date().toISOString()
      try {
        const snap = await fetch(`https://api.terracoregame.com/quest_logs/${username}?limit=1`)
        const snapLogs: QuestLogEntry[] = await snap.json()
        if (snapLogs[0]) snapshotTime = snapLogs[0].time
      } catch { /* use current time */ }

      questCollect(
        {
          username,
          questId:   effectiveActive?._id ?? "",
          questName: quest.name,
        },
        (result) => {
          if (!result.success) {
            setTxState("error")
            setTxError(result.message)
          } else {
            setTxState("polling")
            setHasCollected(true)
            pollForRewards(snapshotTime)
          }
        },
      )
    } else if (!effectiveActive) {
      // Start the quest — burn SCRAP via Hive Engine token transfer
      const scrCost = ("scrap_cost" in quest ? quest.scrap_cost : 0)

      questStart(
        {
          username,
          questType: quest.quest_type,
          tier:      quest.tier,
          scrapCost: scrCost,
          questName: quest.name,
        },
        (result) => {
          if (result.success) {
            setTxState("success")
            onActionSuccess?.()
          } else {
            setTxState("error")
            setTxError(result.message)
          }
        },
      )
    }
  }

  // Reset collecting state when modal closes or quest changes
  // Must be declared before any early returns to satisfy Rules of Hooks
  const questKey = quest
    ? (isActiveQuest(quest) ? (quest as ActiveQuest)._id : (quest as QuestSlot).template_id)
    : null
  useEffect(() => {
    if (!open) {
      setHasCollected(false)
      setTxState("idle")
      setRewards(null)
      setXpGained(null)
    }
  }, [open, questKey])

  if (!quest) return null

  const questType  = quest.quest_type
  const tier       = quest.tier
  const config     = QUEST_TYPE_CONFIG[questType]
  const tierColor  = TIER_COLORS[tier] ?? "bg-muted text-muted-foreground"
  const typeColor  = config?.color ?? "text-muted-foreground border-border bg-muted"
  const relicRates = RELIC_RATES[tier]

  const reqs          = player ? checkQuestRequirements(player, questType, tier) : null
  const effectiveStat = player ? getEffectiveStat(player, questType) : null
  const secondaryStat = player ? getSecondaryStat(player, questType) : null

  const duration  = quest.duration_hours
  const scrapCost = isActiveQuest(quest) ? quest.scrap_paid  : quest.scrap_cost
  const baseRolls = quest.base_rolls

  const progress = effectiveActive
    ? Math.min(1, Math.max(0, (Date.now() - effectiveActive.started_at) / (effectiveActive.completes_at - effectiveActive.started_at)))
    : null

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl w-full p-0 overflow-hidden bg-card border-border gap-0 flex flex-col max-h-[90vh]">
        <DialogTitle className="sr-only">{quest.name}</DialogTitle>

        {/* ── Two-column layout ──────────────────────────────────── */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">

          {/* LEFT — hero + brief */}
          <div className="relative md:w-[42%] flex-shrink-0 flex flex-col min-h-0 overflow-y-auto">
            {/* Hero image */}
            <div className="relative h-56 md:h-64 flex-shrink-0 overflow-hidden">
              <img
                src={quest.image_url}
                alt={quest.name}
                className="absolute inset-0 w-full h-full object-cover"
                crossOrigin="anonymous"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
              />
              {/* Gradient: dark bottom + slight dark overall */}
              <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-black/30" />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-card/60 hidden md:block" />

              {/* Tier + type top-left */}
              <div className="absolute top-3 left-3 flex items-center gap-1.5">
                <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded", tierColor)}>
                  T{tier}
                </span>
                <span className={cn("text-[10px] font-semibold uppercase px-2 py-0.5 rounded border tracking-widest", typeColor)}>
                  {config?.label ?? questType}
                </span>
              </div>

              {/* Active status top-right */}
              {active && (
                <div className="absolute top-3 right-3">
                  {isCollected ? (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-primary bg-primary/20 border border-primary/40 rounded-full px-2.5 py-0.5">
                      <CheckCircle2 className="size-3" /> Collected
                    </span>
                  ) : needsClaim ? (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-[--color-ready] bg-[--color-ready]/15 border border-[--color-ready]/40 rounded-full px-2.5 py-0.5 animate-pulse">
                      <Download className="size-3" /> Claim Ready!
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground bg-muted/70 border border-border rounded-full px-2.5 py-0.5">
                      <Timer className="size-3" /> In Progress
                    </span>
                  )}
                </div>
              )}

              {/* Title anchored to bottom */}
              <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5 font-medium">
                  {active
                    ? isCollected ? "Mission Collected"
                    : needsClaim  ? "Mission Complete"
                    : "Mission In Progress"
                    : "Mission Briefing"}
                </p>
                <h2 className="text-xl font-bold text-foreground leading-tight text-balance">
                  {quest.name}
                </h2>
              </div>
            </div>

            {/* Progress bar */}
            {active && !isCollected && (
              <div className="h-0.5 bg-muted w-full flex-shrink-0">
                <div
                  className={cn("h-full transition-all duration-1000", isComplete ? "bg-[--color-ready]" : "bg-primary")}
                  style={{ width: `${(progress ?? 0) * 100}%` }}
                />
              </div>
            )}

            {/* Bottom info — flavor + stat chips + relic rates */}
            <div className="flex flex-col gap-3 p-4 flex-1 bg-card/80 border-t border-border md:border-t-0 md:border-r md:border-border">
              {/* Flavor */}
              <p className="text-[11px] text-muted-foreground leading-relaxed italic line-clamp-4">
                {quest.flavor}
              </p>

              {/* Quick stat chips */}
              <div className="flex flex-wrap gap-1.5">
                <StatChip icon={<Star className="size-3 text-[--color-amber]" />} label="Tier" value={String(tier)} />
                <StatChip
                  icon={<TrendingUp className="size-3 text-muted-foreground" />}
                  label={statLabel(config?.primaryStat ?? "")}
                  value={`${reqs?.requiredStat ?? "—"}+`}
                />
                <StatChip icon={<Clock className="size-3 text-muted-foreground" />} value={formatDuration(duration)} />
                <StatChip
                  icon={<Zap className="size-3 text-[--color-scrap]" />}
                  value={`${formatScrap(scrapCost)} SCRAP`}
                  valueClass="text-[--color-scrap] font-mono"
                />
                <StatChip icon={<Layers className="size-3 text-muted-foreground" />} label="Rolls" value={String(baseRolls)} />
                {active && (
                  <StatChip
                    icon={<Clock className="size-3 text-muted-foreground" />}
                    label={isComplete ? "Done" : "Left"}
                    value={isComplete ? "Complete" : formatTimeRemaining(timeLeft)}
                    valueClass={isComplete ? "text-[--color-ready]" : "font-mono"}
                  />
                )}
              </div>

              {/* Relic drop rates */}
              {relicRates && (
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Drop Rates / Draw
                  </p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(["legendary", "epic", "rare", "uncommon", "common"] as const).map((rarity) => (
                      <div
                        key={rarity}
                        className="flex flex-col items-center gap-1 rounded-lg border border-border bg-muted/30 px-1.5 py-2"
                      >
                        <img
                          src={RELIC_IMAGES[rarity]}
                          alt={rarity}
                          className="size-7 object-contain"
                          crossOrigin="anonymous"
                        />
                        <span className={cn("text-[9px] font-bold font-mono", RARITY_COLORS[rarity])}>
                          {(relicRates[rarity] * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action button */}
              {username && !effectiveCollected && !isInProgress && (
                <div className="mt-auto pt-1 flex flex-col gap-2">
                  {txError && (
                    <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2 text-[11px] text-destructive">
                      <XCircle className="size-3.5 flex-shrink-0 mt-0.5" />
                      <span>{txError}</span>
                    </div>
                  )}
                  <button
                    onClick={handleAction}
                    disabled={txState === "pending" || txState === "polling" || txState === "success" || (!effectiveNeedsClaim && !reqs?.canStart)}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-colors border disabled:opacity-50 disabled:cursor-not-allowed",
                      effectiveNeedsClaim
                        ? "bg-[--color-ready]/15 border-[--color-ready]/40 text-[--color-ready] hover:bg-[--color-ready]/25"
                        : "bg-primary/10 border-primary/40 text-primary hover:bg-primary/20"
                    )}
                  >
                    {txState === "pending" ? (
                      <><Loader2 className="size-4 animate-spin" />Waiting for Keychain...</>
                    ) : txState === "polling" ? (
                      <><Loader2 className="size-4 animate-spin" />Processing...</>
                    ) : txState === "success" && !effectiveNeedsClaim ? (
                      <><CheckCircle2 className="size-4" />Quest Started!</>
                    ) : effectiveNeedsClaim ? (
                      <><Download className="size-4" />Collect Quest</>
                    ) : (
                      <><Play className="size-4" />Start Quest</>
                    )}
                  </button>
                  {!effectiveNeedsClaim && reqs && !reqs.canStart && (
                    <p className="text-[10px] text-center text-destructive/70">Requirements not met</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — rewards while collecting, otherwise requirements + loadout */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* Show full rewards when quest has been collected */}
            {hasCollected && (txState === "polling" || txState === "success") ? (
              <div className="flex flex-col gap-3 p-4 h-full overflow-y-auto">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Quest Completed
                </p>

                {/* Rewards Summary */}
                <div className="border border-border rounded-lg p-4 bg-gradient-to-br from-green-500/10 to-emerald-500/10 space-y-3">
                  {/* XP Gained */}
                  {xpGained !== null && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">XP Gained</span>
                      <span className="text-sm font-bold text-green-400">{xpGained.toLocaleString()} XP</span>
                    </div>
                  )}

                  {/* Relic Drop Rates */}
                  {rewards && (
                    <div className="space-y-2">
                      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Relics Received
                      </p>
                      <div className="grid grid-cols-5 gap-1.5">
                        {(["legendary", "epic", "rare", "uncommon", "common"] as const).map((rarity) => (
                          <div key={rarity} className="flex flex-col items-center gap-1">
                            <img
                              src={RELIC_IMAGES[rarity]}
                              alt={rarity}
                              className="size-6 object-contain"
                              crossOrigin="anonymous"
                            />
                            <span className="text-[9px] font-bold">{rewards[rarity] ?? 0}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Loading state */}
                  {txState === "polling" && (
                    <div className="flex items-center justify-center gap-2 py-2">
                      <Loader2 className="size-4 animate-spin text-blue-400" />
                      <span className="text-xs text-muted-foreground">Confirming rewards...</span>
                    </div>
                  )}

                  {/* Success message */}
                  {txState === "success" && (
                    <div className="flex items-center gap-2 p-2 rounded bg-green-500/20 border border-green-500/40">
                      <CheckCircle2 className="size-4 text-green-400 flex-shrink-0" />
                      <span className="text-xs text-green-300 font-semibold">Quest collected!</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Normal view: requirements + loadout */
              <div className="flex flex-col gap-3 p-4 h-full overflow-y-auto">

              {/* Requirements */}
              {reqs && player && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Requirements
                  </p>

                  {/* Requirement rows — compact single-line */}
                  <div className="border border-border rounded-lg overflow-hidden divide-y divide-border/60">
                    {/* Level */}
                    <div className="flex items-center gap-2 px-3 py-1.5">
                      {reqs.levelMet
                        ? <CheckCircle2 className="size-3 flex-shrink-0 text-[--color-ready]" />
                        : <XCircle className="size-3 flex-shrink-0 text-destructive" />}
                      <span className="text-[11px] text-muted-foreground flex-1">{`Level ${reqs.requiredLevel}+`}</span>
                      <span className="text-[11px] font-mono font-bold text-foreground">{`Lv ${player.level}`}</span>
                    </div>
                    {/* Primary stat */}
                    <div className="flex items-center gap-2 px-3 py-1.5">
                      {reqs.statMet
                        ? <CheckCircle2 className="size-3 flex-shrink-0 text-[--color-ready]" />
                        : <XCircle className="size-3 flex-shrink-0 text-destructive" />}
                      <span className="text-[11px] text-muted-foreground flex-1">{`${statLabel(config?.primaryStat ?? "")} ${reqs.requiredStat}+`}</span>
                      <span className="text-[11px] font-mono font-bold text-foreground">{effectiveStat?.toFixed(0)}</span>
                    </div>
                    {/* Optional/required item */}
                    {reqs.requiredItemSlot && (
                      <div className="flex items-center gap-2 px-3 py-1.5">
                        {reqs.itemRequired
                          ? reqs.itemEquipped
                            ? <CheckCircle2 className="size-3 flex-shrink-0 text-[--color-ready]" />
                            : <XCircle className="size-3 flex-shrink-0 text-destructive" />
                          : <AlertTriangle className="size-3 flex-shrink-0 text-[--color-amber]" />}
                        <span className="text-[11px] text-muted-foreground flex-1">
                          {ITEM_SLOT_LABEL[reqs.requiredItemSlot]}{reqs.itemRequired ? "" : " — optional"}
                        </span>
                        <span className={cn("text-[11px] font-mono font-bold", reqs.itemEquipped ? "text-[--color-ready]" : "text-muted-foreground")}>
                          {reqs.itemEquipped ? "Equipped" : "Not equipped"}
                        </span>
                      </div>
                    )}
                    {/* Summary row */}
                    <div className={cn(
                      "flex items-center gap-2 px-3 py-1.5",
                      reqs.canStart ? "bg-[--color-ready]/10" : "bg-destructive/10"
                    )}>
                      {reqs.canStart
                        ? <CheckCircle2 className="size-3 text-[--color-ready]" />
                        : <XCircle className="size-3 text-destructive" />}
                      <span className={cn("text-[11px] font-semibold", reqs.canStart ? "text-[--color-ready]" : "text-destructive")}>
                        {reqs.canStart ? "Can start this quest" : "Requirements not met"}
                      </span>
                    </div>
                  </div>

                  {/* Effective stats inline row */}
                  <div className="flex items-center gap-3 px-3 py-1.5 bg-muted/30 border border-border rounded-lg">
                    <span className="text-[11px] text-muted-foreground flex-1">
                      {statLabel(config?.primaryStat ?? "")} (primary)
                    </span>
                    <span className="text-[11px] font-bold font-mono text-foreground">
                      {effectiveStat?.toFixed(reqs.statFromItemsOnly ? 2 : 0)}
                    </span>
                    {config?.secondaryStat && (
                      <>
                        <span className="text-border">|</span>
                        <span className="text-[11px] text-muted-foreground">
                          {statLabel(config.secondaryStat)}
                        </span>
                        <span className="text-[11px] font-bold font-mono text-muted-foreground">
                          {secondaryStat?.toFixed(2)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Loadout — compact grid */}
              {player && (
                <div className="flex flex-col gap-1.5 flex-1 min-h-0 overflow-hidden">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {active ? "Loadout at Start" : "Current Loadout"}
                  </p>
                  <div className="border border-border rounded-lg overflow-y-auto divide-y divide-border/60 flex-1">
                    {ITEM_SLOT_ORDER.map((slot) => {
                      const item       = player.items?.[slot]
                      const equipped   = item?.item_equipped ?? false
                      const isRequired = config?.requiredItemSlot === slot

                      const topStat = equipped && item
                        ? Object.entries(item.attributes).find(([, v]) => (v as number) > 0)
                        : null

                      return (
                        <div
                          key={slot}
                          className={cn(
                            "flex items-center gap-2.5 px-3 py-2",
                            isRequired && equipped  && "bg-primary/5",
                            isRequired && !equipped && "bg-destructive/5",
                          )}
                        >
                          {/* Icon */}
                          <div className={cn(
                            "size-6 rounded flex items-center justify-center flex-shrink-0 border",
                            isRequired
                              ? equipped
                                ? "bg-primary/20 text-primary border-primary/40"
                                : "bg-destructive/20 text-destructive border-destructive/30"
                              : "bg-muted text-muted-foreground border-border"
                          )}>
                            {SLOT_ICONS[slot]}
                          </div>

                          {/* Slot name */}
                          <div className="flex-1 min-w-0 flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-foreground">{ITEM_SLOT_LABEL[slot]}</span>
                            {isRequired && (
                              <span className={cn(
                                "text-[9px] font-bold uppercase tracking-wider px-1 py-px rounded",
                                equipped ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"
                              )}>
                                {equipped ? "OK" : "Required"}
                              </span>
                            )}
                            {topStat && (
                              <span className="text-[10px] text-muted-foreground font-mono ml-1">
                                {statLabel(topStat[0])} +{(topStat[1] as number).toFixed(1)}
                              </span>
                            )}
                            {!equipped && (
                              <span className="text-[10px] text-muted-foreground/40 italic">empty</span>
                            )}
                          </div>

                          {/* Equipped indicator */}
                          <div className="flex-shrink-0">
                            {equipped
                              ? <CheckCircle2 className="size-3 text-[--color-ready]" />
                              : <div className="size-3 rounded-full border border-border/60" />
                            }
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Sub-components ────────────────────────────────────��────────────────────────

function StatChip({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: React.ReactNode
  label?: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex items-center gap-1 bg-muted/50 border border-border rounded px-2 py-1">
      {icon}
      {label && <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</span>}
      <span className={cn("text-[11px] font-bold text-foreground", valueClass)}>{value}</span>
    </div>
  )
}

function ReqRow({
  met,
  label,
  value,
  optional = false,
}: {
  met: boolean
  label: string
  value: string
  optional?: boolean
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 border-b border-border last:border-b-0">
      {met ? (
        <CheckCircle2 className="size-3.5 text-[--color-ready] flex-shrink-0" />
      ) : optional ? (
        <AlertTriangle className="size-3.5 text-[--color-amber] flex-shrink-0" />
      ) : (
        <XCircle className="size-3.5 text-destructive flex-shrink-0" />
      )}
      <span className="text-[11px] text-muted-foreground flex-1 leading-tight">{label}</span>
      <span className={cn(
        "text-[11px] font-bold font-mono",
        met ? "text-foreground" : optional ? "text-[--color-amber]" : "text-destructive"
      )}>
        {value}
      </span>
    </div>
  )
}
