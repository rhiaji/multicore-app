"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Sword,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Swords,
  Zap,
  Shield,
  Wind,
  Coins,
} from "lucide-react"
import { battleMultiple, type BattleResult, type BattleTarget } from "@/lib/events/battle/action"
import { cn } from "@/lib/utils"

interface BattleModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  attacker: string
  attackerDamage: number
  attacksLeft: number
  maxAttacks: number
  onDone?: () => void
}

type TargetStatus = "idle" | "pending" | "ok" | "error"

interface TargetRow extends BattleTarget {
  status: TargetStatus
  message?: string
}

export function BattleModal({
  open,
  onOpenChange,
  attacker,
  attackerDamage,
  attacksLeft,
  maxAttacks,
  onDone,
}: BattleModalProps) {
  const [targets, setTargets]       = useState<TargetRow[]>([])
  const [loading, setLoading]       = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [running, setRunning]       = useState(false)
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [done, setDone]             = useState(false)

  const canAttack = attacksLeft > 0
  const maxSelect = Math.min(attacksLeft, 5)

  // ── Fetch targets ──────────────────────────────────────────────────────────
  const fetchTargets = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    setTargets([])
    setSelected(new Set())
    setDone(false)
    try {
      const res = await fetch(
        `https://api.terracoregame.com/battle?limit=100&offset=1&maxDefense=${Math.floor(attackerDamage)}`,
      )
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const json = await res.json()
      const data: BattleTarget[] = Array.isArray(json) ? json : (json.players ?? [])
      setTargets(
        data
          .filter((t) => t.username !== attacker)
          .map((t) => ({ ...t, status: "idle" })),
      )
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to fetch targets")
    } finally {
      setLoading(false)
    }
  }, [attackerDamage, attacker])

  useEffect(() => {
    if (open) fetchTargets()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Selection helpers ──────────────────────────────────────────────────────
  function toggleSelect(username: string) {
    if (running) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(username)) {
        next.delete(username)
      } else {
        if (next.size < maxSelect) next.add(username)
      }
      return next
    })
  }

  function selectAll() {
    if (running) return
    const top = targets.filter((t) => t.status === "idle").slice(0, maxSelect)
    setSelected(new Set(top.map((t) => t.username)))
  }

  // ── Run battles ────────────────────────────────────────────────────────────
  function handleAttack() {
    if (!canAttack || running || selected.size === 0) return
    setRunning(true)
    setDone(false)

    setTargets((prev) =>
      prev.map((t) =>
        selected.has(t.username) ? { ...t, status: "pending" } : t,
      ),
    )

    const queue = Array.from(selected)

    battleMultiple(
      attacker,
      queue,
      (result: BattleResult) => {
        setTargets((prev) =>
          prev.map((t) =>
            t.username === result.target
              ? { ...t, status: result.success ? "ok" : "error", message: result.success ? undefined : result.message }
              : t,
          ),
        )
      },
      (_results: BattleResult[]) => {
        setRunning(false)
        setDone(true)
        onDone?.()
      },
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const selectedTargets = targets.filter((t) => selected.has(t.username))
  const idleTargets     = targets.filter((t) => t.status === "idle" && !selected.has(t.username))
  const attackedTargets = targets.filter((t) => t.status === "ok" || t.status === "error")

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!running) onOpenChange(v) }}>
      <SheetContent side="right" className="w-[400px] sm:w-[440px] p-0 flex flex-col font-mono">
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
          <SheetTitle className="flex items-center gap-2 text-sm font-bold">
            <Swords className="size-4 text-primary" />
            @{attacker}&apos;s Battle
          </SheetTitle>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1.5 text-[10px]">
              <Zap className="size-3 text-primary" />
              <span className="text-muted-foreground">Attacks left:</span>
              <span className={cn("font-bold font-mono", canAttack ? "text-primary" : "text-destructive")}>
                {attacksLeft} / {maxAttacks}
              </span>
            </div>
            <div className="w-px h-3 bg-border" />
            <div className="flex items-center gap-1.5 text-[10px]">
              <Shield className="size-3 text-muted-foreground" />
              <span className="text-muted-foreground">Max defense:</span>
              <span className="font-bold font-mono text-foreground">{Math.floor(attackerDamage)}</span>
            </div>
          </div>
        </SheetHeader>

        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-5 py-2.5 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              {!done && !running && (
                <button
                  onClick={selectAll}
                  disabled={!canAttack || targets.filter(t => t.status === "idle").length === 0}
                  className="text-[10px] font-semibold text-primary hover:text-primary/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Select top {maxSelect}
                </button>
              )}
              {selected.size > 0 && !running && (
                <>
                  <div className="w-px h-3 bg-border" />
                  <span className="text-[10px] text-muted-foreground">{selected.size} selected</span>
                  <button
                    onClick={() => setSelected(new Set())}
                    className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
            <button
              onClick={fetchTargets}
              disabled={loading || running}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary disabled:opacity-40 transition-colors"
            >
              <RefreshCw className={cn("size-3", loading && "animate-spin")} />
              Refresh
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {loading && (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                <span className="text-[11px]">Fetching battle targets...</span>
              </div>
            )}

            {fetchError && !loading && (
              <div className="flex items-center gap-2 mx-5 my-4 bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3">
                <AlertCircle className="size-3.5 text-destructive flex-shrink-0" />
                <p className="text-[11px] text-destructive">{fetchError}</p>
              </div>
            )}

            {!canAttack && !loading && (
              <div className="flex items-center gap-2 mx-5 my-4 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3">
                <AlertCircle className="size-3.5 text-amber-400 flex-shrink-0" />
                <p className="text-[11px] text-amber-400">No attacks remaining. Wait for regeneration.</p>
              </div>
            )}

            {!loading && !fetchError && targets.length > 0 && (
              <div className="flex flex-col divide-y divide-border">
                {attackedTargets.map((t) => (
                  <TargetRowItem key={t.username} target={t} selected={false} onToggle={() => {}} disabled />
                ))}
                {selectedTargets.map((t) => (
                  <TargetRowItem
                    key={t.username}
                    target={t}
                    selected={true}
                    onToggle={() => toggleSelect(t.username)}
                    disabled={running || !canAttack}
                  />
                ))}
                {idleTargets.map((t) => (
                  <TargetRowItem
                    key={t.username}
                    target={t}
                    selected={false}
                    onToggle={() => toggleSelect(t.username)}
                    disabled={running || !canAttack || (selected.size >= maxSelect && !selected.has(t.username))}
                  />
                ))}
              </div>
            )}

            {!loading && !fetchError && targets.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                <Swords className="size-5 opacity-30" />
                <span className="text-[11px]">No targets found within your damage range.</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-5 py-3 flex items-center justify-between flex-shrink-0">
            {done ? (
              <span className="text-[10px] font-semibold text-primary">
                Done! {attackedTargets.filter(t => t.status === "ok").length} ok, {attackedTargets.filter(t => t.status === "error").length} failed.
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground">
                {canAttack ? `Select up to ${maxSelect} target(s) to attack` : "No attacks remaining"}
              </span>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenChange(false)}
                disabled={running}
                className="px-3 py-1.5 text-[10px] font-semibold border border-border rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              >
                Close
              </button>
              {!done && (
                <button
                  onClick={handleAttack}
                  disabled={!canAttack || running || selected.size === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {running ? (
                    <><Loader2 className="size-3 animate-spin" /> Attacking...</>
                  ) : (
                    <><Sword className="size-3" /> Attack {selected.size > 0 ? `(${selected.size})` : ""}</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ── Sub-component: single target row ─────────────────────────────────────────

function TargetRowItem({
  target,
  selected,
  onToggle,
  disabled,
}: {
  target: TargetRow
  selected: boolean
  onToggle: () => void
  disabled: boolean
}) {
  const isPending  = target.status === "pending"
  const isOk       = target.status === "ok"
  const isError    = target.status === "error"
  const isAttacked = isOk || isError

  const dodge = target.stats?.dodge ?? target.dodge ?? 0
  const stash = target.stash ?? target.scrap ?? 0

  return (
    <button
      onClick={onToggle}
      disabled={disabled || isAttacked}
      className={cn(
        "flex items-center gap-3 px-5 py-2.5 text-left w-full transition-colors",
        isAttacked ? "opacity-60 cursor-default" : "",
        selected && !isAttacked ? "bg-destructive/5" : "hover:bg-muted/30",
        disabled && !isAttacked && !selected ? "opacity-50 cursor-not-allowed" : "",
      )}
    >
      {/* Status icon / checkbox */}
      <div className="flex-shrink-0 size-4 flex items-center justify-center">
        {isPending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        {isOk      && <CheckCircle2 className="size-3.5 text-green-400" />}
        {isError   && <XCircle className="size-3.5 text-destructive" />}
        {!isAttacked && !isPending && (
          <div className={cn(
            "size-3.5 rounded-sm border transition-colors",
            selected ? "bg-destructive/70 border-destructive" : "border-muted-foreground/40",
          )} />
        )}
      </div>

      {/* Avatar */}
      <img
        src={`https://images.hive.blog/u/${target.username}/avatar/small`}
        alt={target.username}
        className="size-6 rounded-full flex-shrink-0 bg-muted"
        crossOrigin="anonymous"
        onError={(e) => { e.currentTarget.style.display = "none" }}
      />

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-foreground truncate">@{target.username}</p>
        {isError && target.message && (
          <p className="text-[9px] text-destructive truncate">{target.message}</p>
        )}
      </div>

      {/* Stats: dodge + stash only */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground" title="Dodge">
          <Wind className="size-2.5" />
          <span className="font-mono">{Number(dodge).toFixed(3)}%</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] font-bold font-mono text-primary" title="Stash">
          <Coins className="size-2.5" />
          <span>{typeof stash === "number" ? stash.toFixed(1) : stash}</span>
        </div>
      </div>
    </button>
  )
}
