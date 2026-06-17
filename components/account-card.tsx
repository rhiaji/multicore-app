"use client"

import { useState, useEffect } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { ContributeFavorModal } from "@/components/contribute-favor-modal"
import { UpgradeStatModal } from "@/components/upgrade-stat-modal"
import { StakeScrapModal } from "@/components/stake-scrap-modal"
import { QuestCard } from "@/components/quest-card"
import { QuestDetailModal } from "@/components/quest-detail-modal"
import { QuestHistoryModal } from "@/components/quest-history-modal"
import { SellRelicModal } from "@/components/sell-relic-modal"
import { SellAllRelicsModal } from "@/components/sell-all-relics-modal"
import { SendHiveModal } from "@/components/send-hive-modal"
import { DelegateRcModal } from "@/components/delegate-rc-modal"
import { UserMarketLogs } from "@/components/market/user-market-logs"
import type { AccountData, QuestSlot, ActiveQuest, UserRelic } from "@/lib/types"
import { claimScrap } from "@/lib/events/claim-scrap/action"
import { BattleModal } from "@/components/battle-modal"
import {
  Shield,
  Sword,
  Wrench,
  Star,
  Coins,
  Clover,
  Wind,
  Crosshair,
  Flame,
  ArrowUpCircle,
  Layers,
  AlertCircle,
  Trash2,
  RefreshCw,
  User,
  Zap,
  Droplets,
  Cpu,
  Send,
  ShoppingCart,
  PackagePlus,
  Timer,
  ChevronLeft,
  ChevronRight,
  Swords,
} from "lucide-react"

/** Returns a formatted countdown string (mm:ss or hh:mm:ss) from a timestamp ms until ready. */
function useCountdown(lastMs: number, intervalMs: number) {
  const getMs = () => {
    const elapsed = Date.now() - lastMs
    const remaining = intervalMs - elapsed
    return remaining > 0 ? remaining : 0
  }
  const [remaining, setRemaining] = useState(getMs)
  useEffect(() => {
    const tick = () => setRemaining(getMs())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [lastMs, intervalMs])

  if (remaining <= 0) return null
  const totalSecs = Math.floor(remaining / 1000)
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`
  return `${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`
}

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000

function StashScrapCard({
  player,
  username,
  stakedScrap,
  onRefresh,
}: {
  player: import("@/lib/types").PlayerData
  username: string
  stakedScrap: number
  onRefresh: () => void
}) {
  const claimCountdown = useCountdown(player.lastclaim ?? 0, FOUR_HOURS_MS)
  const maxClaims = 5
  const claimsLeft = player.claims ?? 0
  const canClaim = claimsLeft > 0

  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [battleOpen, setBattleOpen] = useState(false)

  const attacksLeft  = player.attacks  ?? 0
  const maxAttacks   = player.maxAttacks ?? 0
  const attackerDmg  = player.stats?.damage ?? player.damage ?? 0

  function handleClaim() {
    if (!canClaim || claiming) return
    setClaimError(null)
    setClaiming(true)
    claimScrap(
      { username, amount: player.scrap },
      (result) => {
        setClaiming(false)
        if (result.success) {
          onRefresh()
        } else {
          setClaimError(result.message)
        }
      },
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-3 bg-muted/40 border border-border rounded-lg px-3 py-2">
        <PackagePlus className="size-3.5 text-primary flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
            Unclaimed SCRAP
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-primary font-mono">
              {player.scrap.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
            </span>
            {stakedScrap > 0 && (
              <span className="text-xs text-muted-foreground font-mono">
                / {stakedScrap.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">
              Claims <span className={`font-bold font-mono ${claimsLeft === 0 ? "text-destructive" : "text-foreground"}`}>{claimsLeft} / {maxClaims}</span>
            </span>
            {claimCountdown && (
              <div className="flex items-center gap-1">
                <Timer className="size-2.5 text-muted-foreground" />
                <span className="text-[10px] font-mono text-muted-foreground">{claimCountdown}</span>
              </div>
            )}
            {!claimCountdown && claimsLeft > 0 && (
              <span className="text-[10px] font-bold text-[--color-ready]">Ready</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleClaim}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded border transition-colors flex-shrink-0 ${
              canClaim && !claiming
                ? "border-[--color-ready]/40 text-[--color-ready] hover:bg-[--color-ready]/10"
                : "border-border text-muted-foreground opacity-50 cursor-not-allowed"
            }`}
            disabled={!canClaim || claiming}
            title={canClaim ? "Claim SCRAP" : claimCountdown ? `Next claim in ${claimCountdown}` : "No claims left"}
          >
            <PackagePlus className={`size-3 ${claiming ? "animate-spin" : ""}`} />
            {claiming ? "Claiming..." : "Claim"}
          </button>

          {/* Battle button */}
          <button
            onClick={() => setBattleOpen(true)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded border transition-colors flex-shrink-0 ${
              attacksLeft > 0
                ? "border-destructive/40 text-destructive hover:bg-destructive/10"
                : "border-border text-muted-foreground opacity-50"
            }`}
            title={attacksLeft > 0 ? `${attacksLeft} attacks remaining` : "No attacks remaining"}
          >
            <Sword className="size-3" />
            Battle {attacksLeft > 0 && <span className="font-mono">({attacksLeft})</span>}
          </button>
        </div>
      </div>
      {claimError && (
        <p className="text-[10px] text-destructive px-1">{claimError}</p>
      )}

      <BattleModal
        open={battleOpen}
        onOpenChange={setBattleOpen}
        attacker={username}
        attackerDamage={attackerDmg}
        attacksLeft={attacksLeft}
        maxAttacks={maxAttacks}
        onDone={onRefresh}
      />
    </div>
  )
}


const RELIC_TIERS: {
  type: UserRelic["type"]
  label: string
  color: string
  bg: string
  border: string
  img: string
}[] = [
  { type: "common_relics",    label: "Common",    color: "text-foreground",          bg: "bg-muted/30",          border: "border-border",               img: "https://www.terracoregame.com/images/relics/common.png" },
  { type: "uncommon_relics",  label: "Uncommon",  color: "text-[--color-ready]",     bg: "bg-[--color-ready]/5", border: "border-[--color-ready]/20",    img: "https://www.terracoregame.com/images/relics/uncommon.png" },
  { type: "rare_relics",      label: "Rare",      color: "text-blue-400",            bg: "bg-blue-400/5",        border: "border-blue-400/20",           img: "https://www.terracoregame.com/images/relics/rare.png" },
  { type: "epic_relics",      label: "Epic",      color: "text-purple-400",          bg: "bg-purple-400/5",      border: "border-purple-400/20",         img: "https://www.terracoregame.com/images/relics/epic.png" },
  { type: "legendary_relics", label: "Legendary", color: "text-[--color-amber]",     bg: "bg-[--color-amber]/5", border: "border-[--color-amber]/20",    img: "https://www.terracoregame.com/images/relics/legendary.png" },
]

interface AccountCardProps {
  account: AccountData
  onRemove: (username: string) => void
  onRefresh: (username: string) => void
  hideHeader?: boolean
}

function StatBadge({ icon: Icon, label, value, className }: {
  icon: React.ElementType
  label: string
  value: string | number
  className?: string
}) {
  return (
    <div className={`flex items-center gap-1.5 bg-muted/60 rounded px-2 py-1 ${className ?? ""}`}>
      <Icon className="size-3 text-muted-foreground" />
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-xs font-semibold text-foreground ml-auto">{value}</span>
    </div>
  )
}

export function AccountCard({ account, onRemove, onRefresh, hideHeader }: AccountCardProps) {
  const { username, player, quests, activeQuests, questLogs, userRelics, scrapBalance, hiveData, loading, error } = account

  const [selectedQuest, setSelectedQuest] = useState<QuestSlot | ActiveQuest | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [sellRelic, setSellRelic]       = useState<{ type: UserRelic["type"]; available: number } | null>(null)
  const [sellAllOpen, setSellAllOpen]   = useState(false)
  const [marketLogsOpen, setMarketLogsOpen] = useState(false)
  const [sendHiveOpen, setSendHiveOpen] = useState(false)
  const [delegateRcOpen, setDelegateRcOpen] = useState(false)
  const [contributeFavorOpen, setContributeFavorOpen] = useState(false)
  const [upgradeStatOpen, setUpgradeStatOpen] = useState(false)
  const [stakeOpen, setStakeOpen] = useState(false)
  const [questPage, setQuestPage] = useState(0)
  const QUESTS_PER_PAGE = 4

  // Auto-refresh every 10 seconds with countdown
  const AUTO_REFRESH_S = 10
  const [refreshCountdown, setRefreshCountdown] = useState(AUTO_REFRESH_S)
  useEffect(() => {
    setRefreshCountdown(AUTO_REFRESH_S)
    const tick = setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) {
          onRefresh(username)
          return AUTO_REFRESH_S
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [username]) // eslint-disable-line react-hooks/exhaustive-deps

  // Only truly in-flight or ready-to-claim quests (not already collected)
  const ongoingQuests = activeQuests?.filter((q) => !q.collected) ?? null
  const completedCount = ongoingQuests?.filter((q) => Date.now() >= q.completes_at).length ?? 0
  const completedLogs = Array.isArray(questLogs) ? questLogs.filter((l) => l.action === "complete") : []

  return (
    <div className="border border-border bg-card rounded-xl overflow-hidden">
      {/* Header — hidden when the dashboard switcher bar already acts as the header */}
      {!hideHeader && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
              <User className="size-3.5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground tracking-wide">{username}</p>
              {player && (
                <p className="text-[10px] text-muted-foreground">
                  Level {player.level} · {player.experience?.toLocaleString(undefined, { maximumFractionDigits: 0 })} XP
                </p>
              )}
            </div>
            {player && (
              <Badge className="ml-2 text-[10px] bg-primary/20 text-primary border-primary/40 font-bold">
                Lv {player.level}
              </Badge>
            )}
            {completedCount > 0 && (
              <Badge className="text-[10px] bg-[--color-ready]/20 text-[--color-ready] border-[--color-ready]/40 font-bold animate-pulse">
                {completedCount} to claim
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMarketLogsOpen((v) => !v)}
              className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-widest rounded border transition-colors ${marketLogsOpen ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              title="Market Logs"
            >
              <Coins className="size-3" />
              Market Logs
            </button>
            <button
              onClick={() => { onRefresh(username); setRefreshCountdown(AUTO_REFRESH_S) }}
              disabled={loading}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
              <span className="font-mono tabular-nums">{refreshCountdown}s</span>
            </button>
            <button
              onClick={() => onRemove(username)}
              className="inline-flex items-center justify-center size-7 rounded hover:bg-destructive/20 transition-colors text-muted-foreground hover:text-destructive"
              title="Remove account"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Slim info bar shown when header is hidden */}
      {hideHeader && (
        <div className="border-b border-border bg-muted/20">
          {/* Top row: avatar + username + level + actions */}
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-2.5">
              {/* Avatar */}
              <div className="size-7 rounded-full bg-primary/20 border border-primary/30 flex-shrink-0 overflow-hidden">
                <img
                  src={`https://images.hive.blog/u/${username}/avatar/small`}
                  alt={username}
                  className="size-full object-cover"
                  onError={(e) => {
                    const t = e.currentTarget
                    t.style.display = "none"
                    t.parentElement!.innerHTML = `<span class="size-full flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" class="size-3.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>`
                  }}
                />
              </div>
              {/* Username */}
              <span className="text-xs font-bold text-foreground tracking-wide">{username}</span>
              {/* Level info */}
              {player && (
                <span className="text-[11px] text-muted-foreground">
                  Level {player.level} · {player.experience?.toLocaleString(undefined, { maximumFractionDigits: 0 })} XP
                </span>
              )}
              {player && (
                <Badge className="text-[10px] bg-primary/20 text-primary border-primary/40 font-bold">
                  Lv {player.level}
                </Badge>
              )}
              {completedCount > 0 && (
                <Badge className="text-[10px] bg-[--color-ready]/20 text-[--color-ready] border-[--color-ready]/40 font-bold animate-pulse">
                  {completedCount} to claim
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMarketLogsOpen((v) => !v)}
                className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-widest rounded border transition-colors ${marketLogsOpen ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                title="Market Logs"
              >
                <Coins className="size-3" />
                Market Logs
              </button>
              <button
                onClick={() => { onRefresh(username); setRefreshCountdown(AUTO_REFRESH_S) }}
                disabled={loading}
                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
                <span className="font-mono tabular-nums">{refreshCountdown}s</span>
              </button>
            </div>
          </div>

          {/* Hive stats row */}
          {hiveData && (
            <div className="flex flex-col gap-1.5 px-4 pb-2">
              <div className="flex items-center gap-x-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">HIVE</span>
                  <span className="text-[11px] font-semibold font-mono text-foreground">{hiveData.hiveBalance.toFixed(3)}</span>
                </div>
                <span className="text-border hidden sm:inline">|</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">HBD</span>
                  <span className="text-[11px] font-semibold font-mono text-foreground">{hiveData.hbdBalance.toFixed(3)}</span>
                </div>
                <span className="text-border hidden sm:inline">|</span>
                <div className="flex items-center gap-1.5">
                  <Droplets className="size-3 text-blue-400 flex-shrink-0" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">HP</span>
                  <span className="text-[11px] font-semibold font-mono text-foreground">{hiveData.hpBalance.toFixed(2)}</span>
                </div>
                <span className="text-border hidden sm:inline">|</span>
                <div className="flex items-center gap-1.5">
                  <Cpu className="size-3 text-muted-foreground flex-shrink-0" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">RC</span>
                  <span className={`text-[11px] font-semibold font-mono ${hiveData.rcPercent < 20 ? "text-destructive" : hiveData.rcPercent < 50 ? "text-[--color-amber]" : "text-[--color-ready]"}`}>
                    {hiveData.rcPercent.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Delegate RC button — always available */}
                <button
                  onClick={() => setDelegateRcOpen(true)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded border transition-colors ${
                    hiveData.rcPercent < 50
                      ? "border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  title="Delegate RC from main account"
                >
                  <Zap className="size-3" />
                  Delegate RC
                </button>
                {/* Send HIVE button */}
                <button
                  onClick={() => setSendHiveOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Send HIVE"
                >
                  <Send className="size-3" />
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="p-4 flex flex-col gap-4">
        {error && (
          <div className="flex items-center gap-2 text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
            <AlertCircle className="size-4 flex-shrink-0" />
            <span className="text-xs">{error}</span>
          </div>
        )}

        {/* Player Stats */}
        {loading && !player ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 rounded" />
            ))}
          </div>
        ) : player ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <StatBadge icon={Sword} label="DMG" value={player.damage.toLocaleString()} />
              <StatBadge icon={Shield} label="DEF" value={player.defense.toLocaleString()} />
              <StatBadge icon={Wrench} label="ENG" value={player.engineering} />
              <StatBadge icon={Clover} label="LUCK" value={`${player.stats.luck.toFixed(2)}%`} />
              <StatBadge icon={Wind} label="DODGE" value={`${player.stats.dodge.toFixed(2)}%`} />
              <StatBadge icon={Crosshair} label="CRIT" value={`${player.stats.crit.toFixed(2)}%`} />
            </div>

            {/* Unclaimed SCRAP card */}
            <StashScrapCard player={player} username={username} stakedScrap={scrapBalance ? parseFloat(scrapBalance.stake) : 0} onRefresh={() => onRefresh(username)} />

            {/* Favor card */}
            <div className="flex items-start gap-3 bg-muted/40 border border-border rounded-lg px-3 py-2">
              <Star className="size-3.5 text-[--color-ready] flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                  Favor
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-bold text-[--color-ready] font-mono">
                    {player.favor.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-muted-foreground">Burned SCRAP for favor</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setContributeFavorOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded border border-[--color-ready]/40 text-[--color-ready] hover:bg-[--color-ready]/10 transition-colors"
                >
                  <Flame className="size-3" />
                  Gain Favor
                </button>
                <button
                  onClick={() => setUpgradeStatOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <ArrowUpCircle className="size-3" />
                  Upgrade
                </button>
              </div>
            </div>

            {/* Contribute Favor modal */}
            <ContributeFavorModal
              open={contributeFavorOpen}
              onOpenChange={setContributeFavorOpen}
              username={username}
              currentFavor={player.favor}
              liquidScrap={scrapBalance ? parseFloat(scrapBalance.balance) : 0}
              onSuccess={() => onRefresh(username)}
            />

            {/* Upgrade Stat modal */}
            <UpgradeStatModal
              open={upgradeStatOpen}
              onOpenChange={setUpgradeStatOpen}
              username={username}
              player={{ damage: player.damage, defense: player.defense, engineering: player.engineering }}
              liquidScrap={scrapBalance ? parseFloat(scrapBalance.balance) : 0}
              onSuccess={() => onRefresh(username)}
            />

            {/* Wallet detail row */}
            {scrapBalance && (
              <div className="flex items-center gap-3 bg-muted/40 border border-border rounded-lg px-3 py-2">
                <Coins className="size-3.5 text-[--color-amber] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                    Hive-Engine SCRAP
                  </p>
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">Liquid</span>
                      <span className="text-xs font-bold text-[--color-amber] font-mono">
                        {parseFloat(scrapBalance.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </span>
                    </div>
                    <div className="w-px h-3 bg-border" />
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">Staked</span>
                      <span className="text-xs font-bold text-foreground font-mono">
                        {parseFloat(scrapBalance.stake).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </span>
                    </div>
                    {parseFloat(scrapBalance.pendingUnstake) > 0 && (
                      <>
                        <div className="w-px h-3 bg-border" />
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground">Unstaking</span>
                          <span className="text-xs font-bold text-destructive font-mono">
                            {parseFloat(scrapBalance.pendingUnstake).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <button
                    onClick={() => setStakeOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded border border-[--color-ready]/40 text-[--color-ready] hover:bg-[--color-ready]/10 transition-colors"
                  >
                    <Layers className="size-3" />
                    Stake
                  </button>
                </div>
              </div>
            )}

            {/* Stake SCRAP modal */}
            {scrapBalance && (
              <StakeScrapModal
                open={stakeOpen}
                onOpenChange={setStakeOpen}
                username={username}
                liquidScrap={parseFloat(scrapBalance.balance)}
                currentStaked={parseFloat(scrapBalance.stake)}
                onSuccess={() => onRefresh(username)}
              />
            )}
          </>
        ) : null}

        {/* Relics Inventory */}
        {(userRelics !== null || loading) && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Relics
              </p>
              <div className="flex items-center gap-2">
                {userRelics && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {userRelics.filter((r) => r.amount > 0).length} types
                  </span>
                )}
                {userRelics && userRelics.some((r) => r.amount > 0) && (
                  <button
                    onClick={() => setSellAllOpen(true)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <ShoppingCart className="size-2.5" />
                    Sell All
                  </button>
                )}
              </div>
            </div>
            {loading && !userRelics ? (
              <div className="flex gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-14 flex-1 rounded-lg bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : userRelics && userRelics.length > 0 ? (
              <div className="grid grid-cols-5 gap-2">
                {RELIC_TIERS.map(({ type, label, color, bg, border, img }) => {
                  const relic = userRelics.find((r) => r.type === type)
                  const amount = relic?.amount ?? 0
                  return (
                    <div
                      key={type}
                      className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 ${bg} ${border} ${amount === 0 ? "opacity-40" : ""}`}
                    >
                      <img
                        src={img}
                        alt={label}
                        width={36}
                        height={36}
                        className="size-9 object-contain"
                        crossOrigin="anonymous"
                      />
                      <span className={`text-[9px] font-semibold uppercase tracking-wider ${color}`}>
                        {label}
                      </span>
                      <span className={`text-sm font-bold font-mono leading-none ${amount > 0 ? color : "text-muted-foreground"}`}>
                        {amount > 0 ? amount.toFixed(2) : "—"}
                      </span>
                      {relic?.market.listed && relic.market.amount > 0 && (
                        <span className="text-[9px] text-muted-foreground font-mono">
                          {relic.market.amount.toFixed(1)} listed
                        </span>
                      )}
                      {amount > 0 && (
                        <button
                          onClick={() => setSellRelic({ type, available: amount })}
                          className={`mt-0.5 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border transition-colors hover:opacity-80 ${border} ${color} bg-transparent`}
                        >
                          Sell
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        )}

        {/* Combined Quest Board — daily quests cross-referenced with active quests */}
        {(() => {
          // Build merged slot list: board slots + any active quests not represented in the board
          const boardSlots = quests?.slots ?? []
          const orphanedActive: QuestSlot[] = (activeQuests ?? [])
            // Only uncollected quests can be orphans. We intentionally do NOT
            // filter by board_date here: a quest started on a previous day's
            // board that is still in-progress or ready-to-collect must remain
            // visible so it can be collected. Filtering by today's board_date
            // would permanently hide those ready quests (the "Ready" never shows).
            .filter((aq) => !aq.collected)
            // Must not already be represented by a board slot (by name+type+tier)
            .filter((aq) => !boardSlots.some(
              (s) => s.name === aq.name && s.quest_type === aq.quest_type && s.tier === aq.tier
            ))
            .map((aq) => ({
              template_id:    aq._id,
              quest_type:     aq.quest_type,
              tier:           aq.tier,
              name:           aq.name,
              flavor:         aq.flavor,
              image_url:      aq.image_url,
              duration_hours: aq.duration_hours ?? 1,
              base_rolls:     aq.base_rolls,
              scrap_cost:     aq.scrap_paid,
            }))
          // Orphaned active quests go first so they are immediately visible
          const allSlots = [...orphanedActive, ...boardSlots]

          return (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Daily Quests
                  </p>
                  {ongoingQuests && ongoingQuests.length > 0 && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {ongoingQuests.length} active
                      {completedCount > 0 && (
                        <span className="text-[--color-ready] ml-1 font-semibold">· {completedCount} ready</span>
                      )}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {quests && (
                    <p className="text-[10px] text-muted-foreground">
                      ×{quests.multiplier.toFixed(2)} oracle · ${quests.scrap_usd.toFixed(8)}
                    </p>
                  )}
                  {completedLogs.length > 0 && (
                    <button
                      onClick={() => setHistoryOpen(true)}
                      className="text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors border border-primary/30 hover:border-primary/60 rounded px-2 py-0.5"
                    >
                      History ({completedLogs.length})
                    </button>
                  )}
                </div>
              </div>

              {loading && !quests ? (
                <div className="flex gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-40 flex-1 rounded-lg" />
                  ))}
                </div>
              ) : allSlots.length > 0 ? (
                (() => {
                  const totalPages = Math.ceil(allSlots.length / QUESTS_PER_PAGE)
                  const pageSlots = allSlots.slice(questPage * QUESTS_PER_PAGE, (questPage + 1) * QUESTS_PER_PAGE)
                  return (
                    <div className="relative">
                      {/* Cards container */}
                      <div className="flex gap-2 mx-8">
                        {pageSlots.map((quest) => (
                          <div key={quest.template_id} className="flex-1 min-w-0">
                            <QuestCard
                              quest={quest}
                              player={player}
                              activeQuests={activeQuests}
                              boardDate={quests?.date ?? null}
                              onClick={() => setSelectedQuest(quest)}
                            />
                          </div>
                        ))}
                        {Array.from({ length: QUESTS_PER_PAGE - pageSlots.length }).map((_, i) => (
                          <div key={`empty-${i}`} className="flex-1 min-w-0" />
                        ))}
                      </div>

                      {/* Prev circle button */}
                      <button
                        onClick={() => setQuestPage((p) => Math.max(0, p - 1))}
                        disabled={questPage === 0}
                        className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center justify-center size-7 rounded-full border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                        aria-label="Previous quests"
                      >
                        <ChevronLeft className="size-4" />
                      </button>

                      {/* Next circle button */}
                      <button
                        onClick={() => setQuestPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={questPage >= totalPages - 1}
                        className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center size-7 rounded-full border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                        aria-label="Next quests"
                      >
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                  )
                })()
              ) : !loading && !error ? (
                <div className="text-xs text-muted-foreground text-center py-4 border border-dashed border-border rounded-lg">
                  No quests available
                </div>
              ) : null}
            </div>
          )
        })()}
      </div>

      {/* Market logs panel */}
      {marketLogsOpen && (
        <div className="border-t border-border">
          <UserMarketLogs
            username={username}
            onClose={() => setMarketLogsOpen(false)}
          />
        </div>
      )}

      {/* Quest detail modal */}
      <QuestDetailModal
        open={selectedQuest !== null}
        onClose={() => setSelectedQuest(null)}
        quest={selectedQuest}
        player={player}
        username={username}
        activeQuests={activeQuests}
        boardDate={quests?.date ?? null}
        onActionSuccess={() => onRefresh(username)}
      />

      {/* Quest history modal */}
      {questLogs && (
        <QuestHistoryModal
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          questLogs={questLogs}
          username={username}
        />
      )}

      {/* Sell relic modal */}
      <SellRelicModal
        open={sellRelic !== null}
        onClose={() => setSellRelic(null)}
        relicType={sellRelic?.type ?? null}
        available={sellRelic?.available ?? 0}
        username={username}
      />

      {/* Sell All Relics modal */}
      {userRelics && (
        <SellAllRelicsModal
          open={sellAllOpen}
          onClose={() => setSellAllOpen(false)}
          userRelics={userRelics}
          username={username}
        />
      )}

      {/* Send HIVE modal */}
      {hiveData && (
        <SendHiveModal
          open={sendHiveOpen}
          onOpenChange={setSendHiveOpen}
          username={username}
          availableHive={hiveData.hiveBalance}
        />
      )}

      {/* Delegate RC modal */}
      {hiveData && (
        <DelegateRcModal
          open={delegateRcOpen}
          onOpenChange={setDelegateRcOpen}
          targetUsername={username}
          currentRcPercent={hiveData.rcPercent}
        />
      )}


    </div>
  )
}
