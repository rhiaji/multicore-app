"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { QuestLog } from "@/lib/types"
import { QUEST_TYPE_CONFIG, TIER_COLORS } from "@/lib/quest-utils"
import { ArrowLeft, Zap, Clock, Star, ChevronRight, CheckCircle2, Layers } from "lucide-react"

const RELIC_REWARDS: {
  key: keyof NonNullable<QuestLog["rewards"]>
  label: string
  color: string
  bg: string
  border: string
  img: string
}[] = [
  { key: "common",    label: "Common",    color: "text-foreground",       bg: "bg-muted/40",          border: "border-border",               img: "https://www.terracoregame.com/images/relics/common.png" },
  { key: "uncommon",  label: "Uncommon",  color: "text-[--color-ready]",  bg: "bg-[--color-ready]/8", border: "border-[--color-ready]/25",    img: "https://www.terracoregame.com/images/relics/uncommon.png" },
  { key: "rare",      label: "Rare",      color: "text-blue-400",         bg: "bg-blue-400/8",        border: "border-blue-400/25",           img: "https://www.terracoregame.com/images/relics/rare.png" },
  { key: "epic",      label: "Epic",      color: "text-purple-400",       bg: "bg-purple-400/8",      border: "border-purple-400/25",         img: "https://www.terracoregame.com/images/relics/epic.png" },
  { key: "legendary", label: "Legendary", color: "text-[--color-amber]",  bg: "bg-[--color-amber]/8", border: "border-[--color-amber]/25",    img: "https://www.terracoregame.com/images/relics/legendary.png" },
]

function formatDate(timeStr: string) {
  const d = new Date(timeStr)
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function formatTime(timeStr: string) {
  const d = new Date(timeStr)
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}

function totalRelics(rewards: NonNullable<QuestLog["rewards"]>) {
  return (rewards.common ?? 0) + (rewards.uncommon ?? 0) + (rewards.rare ?? 0) + (rewards.epic ?? 0) + (rewards.legendary ?? 0)
}

interface QuestHistoryModalProps {
  open: boolean
  onClose: () => void
  questLogs: QuestLog[]
  username: string
}

export function QuestHistoryModal({ open, onClose, questLogs, username }: QuestHistoryModalProps) {
  const [selectedLog, setSelectedLog] = useState<QuestLog | null>(null)

  const completedLogs = questLogs
    .filter((l) => l.action === "complete")
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

  function handleClose() {
    setSelectedLog(null)
    onClose()
  }

  const isDetail = selectedLog !== null

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent
        className={cn(
          "w-full p-0 overflow-hidden bg-card border-border gap-0 flex flex-col max-h-[90vh]",
          isDetail ? "max-w-5xl" : "max-w-lg"
        )}
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">
          {selectedLog ? selectedLog.name : `Quest History — ${username}`}
        </DialogTitle>

        {selectedLog ? (
          <QuestLogDetail log={selectedLog} onBack={() => setSelectedLog(null)} />
        ) : (
          /* ── List view ── */
          <div className="flex flex-col h-[560px]">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-foreground">Quest History</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{username} · {completedLogs.length} completed</p>
              </div>
            </div>

            {completedLogs.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                No completed quests yet
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="flex flex-col divide-y divide-border">
                  {completedLogs.map((log, i) => {
                    const config = QUEST_TYPE_CONFIG[log.quest_type]
                    const tierColor = TIER_COLORS[log.tier] ?? "bg-muted text-muted-foreground"
                    const hasRewards = log.rewards && totalRelics(log.rewards) > 0
                    const topRarity = log.rewards
                      ? (["legendary", "epic", "rare", "uncommon", "common"] as const).find(
                          (k) => (log.rewards![k] ?? 0) > 0
                        )
                      : null
                    const topConfig = topRarity ? RELIC_REWARDS.find((r) => r.key === topRarity) : null

                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedLog(log)}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left w-full"
                      >
                        <div className="flex-shrink-0 flex flex-col items-center gap-1">
                          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", tierColor)}>
                            T{log.tier}
                          </span>
                          <span className={cn("text-[8px] font-semibold uppercase px-1 py-0.5 rounded border tracking-wide", config?.color ?? "text-muted-foreground border-border bg-muted")}>
                            {config?.label ?? log.quest_type}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{log.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Clock className="size-2.5" />
                              {formatDate(log.time)} {formatTime(log.time)}
                            </span>
                            {log.scrap_paid && (
                              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground font-mono">
                                <Zap className="size-2.5" />
                                {log.scrap_paid}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex-shrink-0 flex flex-col items-end gap-1">
                          {hasRewards && topConfig ? (
                            <>
                              <span className={cn("text-[10px] font-bold", topConfig.color)}>
                                +{log.rewards![topRarity!]} {topConfig.label}
                              </span>
                              <span className="text-[9px] text-muted-foreground">
                                {totalRelics(log.rewards!)} total
                              </span>
                            </>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">No relics</span>
                          )}
                        </div>
                        <ChevronRight className="size-3.5 text-muted-foreground flex-shrink-0" />
                      </button>
                    )
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Detail view — matches quest-detail-modal layout ────────────────────────────

function QuestLogDetail({ log, onBack }: { log: QuestLog; onBack: () => void }) {
  const config    = QUEST_TYPE_CONFIG[log.quest_type]
  const tierColor = TIER_COLORS[log.tier] ?? "bg-muted text-muted-foreground"
  const typeColor = config?.color ?? "text-muted-foreground border-border bg-muted"
  const hasRewards = log.rewards && totalRelics(log.rewards) > 0
  const total = log.rewards ? totalRelics(log.rewards) : 0

  return (
    <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">

      {/* LEFT — hero + brief */}
      <div className="relative md:w-[42%] flex-shrink-0 flex flex-col min-h-0 overflow-y-auto">

        {/* Hero image */}
        <div className="relative h-56 md:h-64 flex-shrink-0 overflow-hidden">
          {log.image_url ? (
            <img
              src={log.image_url}
              alt={log.name}
              className="absolute inset-0 w-full h-full object-cover"
              crossOrigin="anonymous"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
            />
          ) : (
            <div className="absolute inset-0 bg-muted" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-black/30" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-card/60 hidden md:block" />

          {/* Tier + type top-left */}
          <div className="absolute top-3 left-3 flex items-center gap-1.5">
            <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded", tierColor)}>
              T{log.tier}
            </span>
            <span className={cn("text-[10px] font-semibold uppercase px-2 py-0.5 rounded border tracking-widest", typeColor)}>
              {config?.label ?? log.quest_type}
            </span>
          </div>

          {/* Collected badge top-right */}
          <div className="absolute top-3 right-3">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-[--color-ready] bg-[--color-ready]/15 border border-[--color-ready]/40 rounded-full px-2.5 py-0.5">
              <CheckCircle2 className="size-3" /> Collected
            </span>
          </div>

          {/* Title anchored to bottom */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5 font-medium">
              Mission Collected
            </p>
            <h2 className="text-xl font-bold text-foreground leading-tight text-balance">
              {log.name}
            </h2>
          </div>
        </div>

        {/* Bottom info — meta + stat chips */}
        <div className="flex flex-col gap-3 p-4 flex-1 bg-card/80 border-t border-border md:border-t-0 md:border-r md:border-border">

          {/* Back link */}
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors self-start"
          >
            <ArrowLeft className="size-3.5" />
            Back to History
          </button>

          {/* Completed date */}
          <p className="text-[11px] text-muted-foreground">
            Completed {formatDate(log.time)} at {formatTime(log.time)}
          </p>

          {/* Stat chips */}
          <div className="flex flex-wrap gap-1.5">
            <StatChip icon={<Star className="size-3 text-[--color-amber]" />} label="Tier" value={String(log.tier)} />
            {log.scrap_paid !== undefined && (
              <StatChip
                icon={<Zap className="size-3 text-[--color-scrap]" />}
                value={`${log.scrap_paid} SCRAP`}
                valueClass="text-[--color-scrap] font-mono"
              />
            )}
            {log.draw_count !== undefined && (
              <StatChip icon={<Layers className="size-3 text-muted-foreground" />} label="Draws" value={String(log.draw_count)} />
            )}
          </div>

          {/* Effective roll */}
          {log.effective_roll !== undefined && (
            <div className="bg-muted/30 border border-border rounded-lg px-3 py-2">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">Effective Roll</p>
              <p className="text-sm font-bold font-mono text-foreground">{log.effective_roll}</p>
            </div>
          )}

          {/* XP */}
          {log.xp !== undefined && (
            <div className="bg-muted/30 border border-border rounded-lg px-3 py-2">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">XP Gained</p>
              <p className="text-sm font-bold font-mono text-foreground flex items-center gap-1">
                <Star className="size-3 text-[--color-amber]" />+{log.xp}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — relic rewards */}
      <div className="flex-1 flex flex-col overflow-y-auto min-h-0">
        <div className="flex flex-col gap-4 p-4 h-full">

          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Relic Rewards
          </p>

          {hasRewards ? (
            <>
              <div className="grid grid-cols-5 gap-2">
                {RELIC_REWARDS.map(({ key, label, color, bg, border, img }) => {
                  const amount = log.rewards?.[key] ?? 0
                  return (
                    <div
                      key={key}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3",
                        bg, border,
                        amount === 0 && "opacity-35"
                      )}
                    >
                      <img
                        src={img}
                        alt={label}
                        width={40}
                        height={40}
                        className="size-10 object-contain"
                        crossOrigin="anonymous"
                      />
                      <span className={cn("text-[9px] font-semibold uppercase tracking-wider", color)}>
                        {label}
                      </span>
                      <span className={cn("text-sm font-bold font-mono leading-none", amount > 0 ? color : "text-muted-foreground")}>
                        {amount > 0 ? `+${amount}` : "—"}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Total */}
              <div className="flex items-center justify-between bg-muted/30 border border-border rounded-lg px-4 py-3 mt-auto">
                <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-widest">Total Relics</span>
                <span className="text-sm font-bold font-mono text-foreground">{total}</span>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-muted-foreground text-center border border-dashed border-border rounded-lg py-8 px-6 w-full">
                No relics rewarded for this quest
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Shared sub-components ──────────────────────────────────────────────────────

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
