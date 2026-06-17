"use client"

import Link from "next/link"
import { useState } from "react"
import { SendHorizonal, Swords, ChevronRight, Lock, ArrowLeftRight, ShoppingCart, PackagePlus } from "lucide-react"
import { HiveLoginNav } from "@/components/market/hive-login-nav"
import { ConfigureAccountsModal } from "@/components/configure-accounts-modal"

const SCRIPTS = [
  {
    href:        "/scripts/token-transfer",
    icon:        <SendHorizonal className="size-5" />,
    title:       "Token Transfer",
    description: "Decrypt accounts from encrypted config and sweep any Hive or Hive Engine token to a single recipient. Supports MAX or custom amount per account.",
    tags:        ["HIVE", "HBD", "SCRAP", "any token"],
    steps:       ["Decrypt", "Validate", "Balances", "Broadcast"],
  },
  {
    href:        "/scripts/auto-claim-battle",
    icon:        <PackagePlus className="size-5" />,
    title:       "Auto Claim & Battle",
    description: "Decrypt multi-account config, attack targets based on your damage stat, then claim SCRAP. Supports 4h cooldown, custom interval, or claim-now modes.",
    tags:        ["claim", "battle", "terracore_claim", "terracore_battle"],
    steps:       ["Decrypt", "Fetch", "Execute"],
  },
  {
    href:        "/scripts/auto-quest",
    icon:        <Swords className="size-5" />,
    title:       "Auto Quest",
    description: "Decrypt accounts and automatically collect completed quests and optionally start new available quests from the board. Streams results per account.",
    tags:        ["collect", "start"],
    steps:       ["Decrypt", "Board", "Check", "Execute"],
  },
  {
    href:        "/scripts/relic-market-sell",
    icon:        <ArrowLeftRight className="size-5" />,
    title:       "Relic Market Sell",
    description: "Decrypt seller accounts and automatically list all their relics on the market using auto-price. Skips relics already listed.",
    tags:        ["sell", "tm_create", "list", "auto-price"],
    steps:       ["Decrypt", "Fetch", "Sell"],
  },
  {
    href:        "/scripts/relic-market-buy",
    icon:        <ShoppingCart className="size-5" />,
    title:       "Relic Market Buy",
    description: "Decrypt a single buyer account and purchase relics listed by your tracked dashboard accounts. Supports rarity filters and a max unit price cap.",
    tags:        ["buy", "transfer", "tracked accounts", "filter"],
    steps:       ["Decrypt", "Fetch", "Buy"],
  },
]

export default function ScriptsDashboard() {
  const [configureOpen, setConfigureOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background text-foreground font-mono">
      {/* Header */}
      <header className="border-b border-border bg-card/80 sticky top-0 z-10 backdrop-blur-sm">
        <div className="px-6 h-12 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest"
            >
              Dashboard
            </Link>
            <span className="text-border">/</span>
            <span className="text-[11px] font-semibold text-primary uppercase tracking-widest">
              Scripts
            </span>
          </div>
          <HiveLoginNav />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        {/* Title */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-xl font-bold tracking-tight">Automation Scripts</h1>
            <p className="text-[12px] text-muted-foreground">
              Server-side scripts that run against your encrypted account config. Each script streams live output back to the browser.
            </p>
          </div>
          <button
            onClick={() => setConfigureOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all whitespace-nowrap self-start flex-shrink-0"
            title="Configure and encrypt accounts for server automation"
          >
            <Lock className="size-3.5" />
            Encrypt
          </button>
        </div>

        {/* Script cards */}
        <div className="space-y-3">
          {SCRIPTS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group block border border-border rounded-xl p-5 bg-card hover:border-primary/60 hover:bg-primary/5 transition-all"
            >
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className="mt-0.5 size-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                  {s.icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-bold tracking-tight group-hover:text-primary transition-colors">
                      {s.title}
                    </h2>
                    <ChevronRight className="size-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {s.description}
                  </p>

                  {/* Tags + Steps */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                    <div className="flex flex-wrap gap-1">
                      {s.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="hidden sm:flex items-center gap-1 ml-auto">
                      {s.steps.map((step, i) => (
                        <span key={step} className="flex items-center gap-1">
                          <span className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                            {step}
                          </span>
                          {i < s.steps.length - 1 && (
                            <span className="text-border text-[9px]">→</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <p className="text-[10px] text-muted-foreground border-t border-border pt-6">
          All scripts run on the server. Private keys are decrypted in memory only during execution and never stored or logged.
        </p>
      </main>

      {/* Configure & Encrypt Accounts Modal */}
      <ConfigureAccountsModal open={configureOpen} onOpenChange={setConfigureOpen} />
    </div>
  )
}
