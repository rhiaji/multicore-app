"use client"

import Link from "next/link"
import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import {
  GitFork,
  Copy,
  CheckCheck,
  ArrowRight,
  ChevronRight,
  ExternalLink,
  Shield,
  Zap,
  BookOpen,
  Settings,
  Lock,
  BarChart2,
  Menu,
  X,
} from "lucide-react"

// ─── github icon ────────────────────────────────────────────────────────────

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

// ─── nav data ────────────────────────────────────────────────────────────────

const NAV = [
  {
    group: "Overview",
    items: [
      { label: "Introduction", href: "#introduction" },
      { label: "How it works", href: "#how-it-works" },
      { label: "Security", href: "#security" },
    ],
  },
  {
    group: "Getting Started",
    items: [
      { label: "Prerequisites", href: "#prerequisites" },
      { label: "Installation", href: "#installation" },
      { label: "Configuration", href: "#configuration" },
    ],
  },
  {
    group: "Features",
    items: [
      { label: "Dashboard", href: "#feature-dashboard" },
      { label: "Auto Claim", href: "#feature-auto-claim" },
      { label: "Auto Quest", href: "#feature-auto-quest" },
      { label: "Token Transfer", href: "#feature-token-transfer" },
      { label: "Relic Market", href: "#feature-relic-market" },
    ],
  },
  {
    group: "Self-Hosting",
    items: [
      { label: "Environment", href: "#env" },
      { label: "Deployment", href: "#deployment" },
      { label: "Automations", href: "#automations" },
      { label: "Required env vars", href: "#automations-env" },
      { label: "Claim & Battle", href: "#automations-claim" },
      { label: "Auto Quest", href: "#automations-quest" },
      { label: "Token Transfer", href: "#automations-transfer" },
      { label: "Relic Market", href: "#automations-relic" },
      { label: "Terracore (combined)", href: "#automations-terracore" },
    ],
  },
  {
    group: "Project",
    items: [
      { label: "Author", href: "#author" },
    ],
  },
]

const TOC = [
  { label: "Introduction", href: "#introduction" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Security model", href: "#security" },
  { label: "Prerequisites", href: "#prerequisites" },
  { label: "Installation", href: "#installation" },
  { label: "Configuration", href: "#configuration" },
  { label: "Dashboard", href: "#feature-dashboard" },
  { label: "Auto Claim & Battle", href: "#feature-auto-claim" },
  { label: "Auto Quest", href: "#feature-auto-quest" },
  { label: "Token Transfer", href: "#feature-token-transfer" },
  { label: "Relic Market", href: "#feature-relic-market" },
  { label: "Deployment", href: "#deployment" },
  { label: "Automations", href: "#automations" },
  { label: "Required env vars", href: "#automations-env" },
  { label: "Claim & Battle", href: "#automations-claim" },
  { label: "Auto Quest", href: "#automations-quest" },
  { label: "Token Transfer", href: "#automations-transfer" },
  { label: "Relic Market", href: "#automations-relic" },
  { label: "Terracore (combined)", href: "#automations-terracore" },
  { label: "Author", href: "#author" },
]

// ─── script features ──────────────────────────────────────────────────────────

const SCRIPT_FEATURES = [
  { icon: BarChart2, label: "Dashboard", desc: "Live stats for all accounts — SCRAP balance, attacks, mine rate, RC, quests." },
  { icon: Zap, label: "Auto Claim", desc: "Attack targets and auto-claim SCRAP stash across every account in one run." },
  { icon: BookOpen, label: "Auto Quest", desc: "Start and collect quests automatically based on availability and cooldowns." },
  { icon: ArrowRight, label: "Token Transfer", desc: "Sweep HIVE, HBD, or any Hive Engine token from multiple accounts to one recipient." },
  { icon: Settings, label: "Relic Market", desc: "Buy and sell relics — floor pricing, batch buy, and fixed price modes." },
]

// ─── copy button ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => { })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      aria-label="Copy to clipboard"
      className="flex-shrink-0 p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <CheckCheck className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
    </button>
  )
}

// ─── code block ──────────────────────────────────────────────────────────────

function CodeBlock({ children, lang = "bash" }: { children: string; lang?: string }) {
  return (
    <div className="my-5 rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{lang}</span>
        <CopyButton text={children} />
      </div>
      <pre className="px-4 py-4 overflow-x-auto">
        <code className="font-mono text-xs text-foreground/85 whitespace-pre leading-relaxed">{children}</code>
      </pre>
    </div>
  )
}

// ─── callout ─────────────────────────────────────────────────────────────────

function Callout({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="my-5 flex gap-3 rounded-xl border border-primary/20 bg-primary/6 px-4 py-3.5">
      <Icon className="size-4 text-primary flex-shrink-0 mt-0.5" />
      <p className="text-sm text-foreground/75 leading-relaxed">{children}</p>
    </div>
  )
}

// ─── section headings ─────────────────────��──────────────────────────────────

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="scroll-mt-24 mt-14 mb-4 text-xl font-bold tracking-tight text-foreground border-b border-border pb-3"
    >
      {children}
    </h2>
  )
}

function H3({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="scroll-mt-24 mt-7 mb-2.5 text-sm font-semibold tracking-tight text-foreground">
      {children}
    </h3>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground leading-relaxed my-3">{children}</p>
}

// ─── sidebar nav ────────────────────────────────────────────────────────────

function SidebarNav({
  activeHash,
  onNavigate,
}: {
  activeHash: string
  onNavigate?: () => void
}) {
  return (
    <nav className="px-3 pt-4 pb-8 flex flex-col gap-7" aria-label="Documentation navigation">
      {NAV.map((section) => (
        <div key={section.group}>
          <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
            {section.group}
          </p>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const isActive = activeHash === item.href
              return (
                <li key={item.href}>
                  <a
                    href={item.href}
                    onClick={onNavigate}
                    className={`group flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {isActive && <span className="w-0.5 h-3 rounded-full bg-primary flex-shrink-0" aria-hidden="true" />}
                    {item.label}
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function DocsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeHash, setActiveHash] = useState("")
  const contentRef = useRef<HTMLElement>(null)

  // track active section via IntersectionObserver
  useEffect(() => {
    const ids = TOC.map((t) => t.href.slice(1))
    const observers: IntersectionObserver[] = []
    const visible = new Set<string>()

    ids.forEach((id) => {
      const el = document.getElementById(id)
      if (!el) return
      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) visible.add(id)
            else visible.delete(id)
          })
          // pick the first visible
          const first = ids.find((i) => visible.has(i))
          if (first) setActiveHash(`#${first}`)
        },
        { rootMargin: "-20% 0px -70% 0px" }
      )
      obs.observe(el)
      observers.push(obs)
    })
    return () => observers.forEach((o) => o.disconnect())
  }, [])

  // lock body scroll when mobile sidebar open
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [sidebarOpen])

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">

      {/* ── top nav ── */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* left: hamburger + logo */}
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label="Toggle sidebar"
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>

            <div className="flex items-center gap-2.5">
              <div className="size-7 rounded-lg overflow-hidden border border-border/60">
                <Image src="/logo.png" alt="Multicore logo" width={28} height={28} className="size-7 object-cover" />
              </div>
              <span className="text-sm font-bold tracking-wider text-foreground">Multicore</span>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
              <ChevronRight className="size-3 flex-shrink-0" />
              <span className="font-mono">docs</span>
            </div>
          </div>

          {/* right: CTA */}
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-primary/40 bg-primary/8 text-primary text-xs font-semibold hover:bg-primary/15 hover:border-primary/60 transition-all uppercase tracking-wider"
          >
            App
            <ArrowRight className="size-3" />
          </Link>
        </div>
      </header>

      {/* ── body ── */}
      <div className="max-w-screen-2xl mx-auto w-full flex flex-1 relative">

        {/* ── left sidebar — mobile drawer + desktop sticky ── */}
        <aside
          className={`
            fixed inset-y-0 left-0 z-20 w-64 border-r border-border bg-background
            overflow-y-auto transition-transform duration-200 ease-out
            lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0 lg:flex lg:flex-col lg:w-56 lg:shrink-0
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          `}
          aria-label="Sidebar"
        >
          {/* mobile header inside drawer */}
          <div className="lg:hidden flex items-center gap-2.5 px-4 h-14 border-b border-border">
            <div className="size-6 rounded-md overflow-hidden border border-border/60">
              <Image src="/logo.png" alt="Multicore logo" width={24} height={24} className="size-6 object-cover" />
            </div>
            <span className="text-sm font-bold tracking-wide text-foreground">Multicore</span>
          </div>

          <SidebarNav
            activeHash={activeHash}
            onNavigate={() => setSidebarOpen(false)}
          />
        </aside>

        {/* mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-[19] bg-background/70 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* ── main content ── */}
        <main
          ref={contentRef}
          className="flex-1 min-w-0 w-full px-5 sm:px-8 md:px-12 py-10 lg:py-12 overflow-x-hidden"
        >
          <div className="max-w-2xl mx-auto lg:mx-0 xl:max-w-3xl">

            {/* ── hero header ── */}
            <div className="mb-10 pb-10 border-b border-border">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">
                  rhiaji / multicore-app
                </span>
                <a
                  href="https://github.com/rhiaji/multicore-app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground/50 hover:text-primary transition-colors"
                  aria-label="View on GitHub"
                >
                  <ExternalLink className="size-3" />
                </a>
              </div>

              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4 text-balance">
                Multicore Documentation
              </h1>

              <p className="text-base text-muted-foreground leading-relaxed max-w-xl text-pretty">
                Open-source multi-account dashboard and automation toolkit for the{" "}
                <a
                  href="https://terracoregame.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline underline-offset-2 hover:text-primary transition-colors"
                >
                  Terracore
                </a>{" "}
                blockchain game. Self-host, fork, or run the hosted version.
              </p>

              {/* CTA buttons */}
              <div className="flex flex-wrap items-center gap-3 mt-6">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity"
                >
                  <ArrowRight className="size-3.5" />
                  Open Dashboard
                </Link>
                <a
                  href="https://github.com/rhiaji/multicore-app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
                >
                  <GithubIcon className="size-3.5" />
                  View Source
                </a>
                <a
                  href="https://github.com/rhiaji/multicore-app/fork"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
                >
                  <GitFork className="size-3.5" />
                  Fork
                </a>
              </div>
            </div>

            {/* ── Introduction ── */}
            <H2 id="introduction">Introduction</H2>
            <P>
              Multicore is a browser-based, open-source dashboard for managing multiple Terracore game
              accounts. It lets you monitor live stats, run automation scripts, and interact with the
              relic market — all from a single interface.
            </P>
            <P>
              Every automation script runs entirely in your browser. Private keys are never transmitted
              to any server. The full source code is available on GitHub for audit at any time.
            </P>

            {/* feature grid */}
            <div className="my-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SCRIPT_FEATURES.map((f) => (
                <div key={f.label} className="flex gap-3.5 p-4 rounded-xl border border-border bg-card hover:border-border/70 transition-colors">
                  <div className="size-9 rounded-lg bg-primary/8 border border-primary/15 flex items-center justify-center flex-shrink-0">
                    <f.icon className="size-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-1">{f.label}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ── How it works ── */}
            <H2 id="how-it-works">How it works</H2>
            <P>
              Accounts are stored in your browser as an encrypted list. When you run a script, the
              page decrypts the key locally, calls the Hive broadcast API directly, and streams
              progress events back to the UI — no backend round-trip for sensitive operations.
            </P>
            <P>
              The read-only dashboard and market data fetch from the Terracore and Hive public APIs on
              every page load — no caching layer, always live.
            </P>

            {/* ── Security ── */}
            <H2 id="security">Security</H2>
            <Callout icon={Shield}>
              Private keys are AES-encrypted in localStorage with a passphrase you set. They are
              decrypted only in memory at script runtime and are never sent to any server or
              third-party service.
            </Callout>
            <P>
              The self-hosted deployment path means you can run Multicore on your own server or even{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">localhost</code>{" "}
              — giving you full control over the environment where your keys exist.
            </P>
            <P>
              Because all automation code is open-source, you can audit exactly what happens when you
              click &quot;Run&quot; on any script page before entering a passphrase.
            </P>

            {/* ── Prerequisites ── */}
            <H2 id="prerequisites">Prerequisites</H2>
            <ul className="my-4 flex flex-col gap-2">
              {[
                "Node.js 20+",
                "pnpm (recommended) or npm",
                "A Hive account with posting key access",
                "Git",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <ChevronRight className="size-3.5 text-primary flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>

            {/* ── Installation ── */}
            <H2 id="installation">Installation</H2>
            <H3>Clone the repository</H3>
            <CodeBlock>{`git clone https://github.com/rhiaji/multicore-app.git
cd multicore-app`}</CodeBlock>

            <H3>Install dependencies</H3>
            <CodeBlock>{`pnpm install`}</CodeBlock>

            <H3>Run the development server</H3>
            <CodeBlock>{`pnpm dev`}</CodeBlock>
            <P>
              Open{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">http://localhost:3000</code>{" "}
              in your browser. The dashboard is available at{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">/dashboard</code>.
            </P>

            {/* ── Configuration ── */}
            <H2 id="configuration">Configuration</H2>
            <H3>Adding accounts</H3>
            <P>
              From the dashboard, click <strong className="text-foreground font-semibold">Add Account</strong>. Enter
              your Hive username and posting key. The key is encrypted with your chosen passphrase and
              stored in localStorage — it is never sent anywhere.
            </P>
            <H3>Encryption passphrase</H3>
            <P>
              You set a passphrase the first time you add an account. Every time you run a script you
              will be prompted to enter it to decrypt the key in memory for that session only.
            </P>
            <Callout icon={Lock}>
              Use a strong, unique passphrase. If you forget it, you will need to re-add your accounts
              — there is no recovery mechanism by design.
            </Callout>

            {/* ── Features ── */}
            <H2 id="feature-dashboard">Dashboard</H2>
            <P>
              The{" "}
              <Link href="/dashboard" className="text-primary hover:underline underline-offset-2 font-medium">
                dashboard
              </Link>{" "}
              shows a live table of all tracked accounts with SCRAP balance, mine rate, attack counts,
              RC percentage, and quest status. Data is fetched from the Terracore and Hive APIs on
              every load.
            </P>

            <H2 id="feature-auto-claim">Auto Claim &amp; Battle</H2>
            <P>
              Iterates over all accounts, attacks available targets up to the configured maximum, then
              claims the SCRAP stash. Progress is streamed live to the log panel. Accounts that have
              no attacks remaining or have already claimed are skipped automatically.
            </P>
            <CodeBlock lang="route">{`/scripts/auto-claim-battle`}</CodeBlock>

            <H2 id="feature-auto-quest">Auto Quest</H2>
            <P>
              Collects completed quests and starts new ones across all accounts in a single run.
              Handles cooldown detection and skips accounts that have no available quest slots.
            </P>
            <CodeBlock lang="route">{`/scripts/auto-quest`}</CodeBlock>

            <H2 id="feature-token-transfer">Token Transfer</H2>
            <P>
              Transfers tokens from multiple source accounts to a single recipient. Supports native Hive
              tokens (
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">HIVE</code>
              ,{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">HBD</code>
              ) as well as any Hive Engine token such as{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">SCRAP</code>{" "}
              — set the symbol in the UI and the script routes the transfer accordingly. Supports
              &quot;max balance&quot; mode or a fixed custom amount per account.
            </P>
            <CodeBlock lang="route">{`/scripts/token-transfer`}</CodeBlock>

            <H2 id="feature-relic-market">Relic Market</H2>
            <P>
              Two separate scripts handle buying and selling relics on the Terracore market. The sell
              script supports auto-floor pricing (undercut lowest listing) or fixed price per rarity.
              The buy script batches purchases from multiple seller accounts into a single transaction
              sequence.
            </P>
            <CodeBlock lang="route">{`/scripts/relic-market-sell
/scripts/relic-market-buy`}</CodeBlock>

            {/* ── Self-Hosting ── */}
            <H2 id="env">Environment</H2>
            <P>
              No required environment variables for basic operation — the app works out of the box.
              If you need to configure optional integrations, create a{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">.env.local</code>{" "}
              file in the project root.
            </P>

            <H2 id="deployment">Deployment</H2>
            <H3>Any Node.js host</H3>
            <P>
              Fork the repository on GitHub, clone it to your host, install dependencies, and run the
              build. No platform-specific configuration is required — any host that supports Node.js 20+
              and Next.js works.
            </P>
            <CodeBlock>{`pnpm build
pnpm start`}</CodeBlock>

            <H3>Docker / self-hosted</H3>
            <P>
              Build the Next.js output and serve it with{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">pnpm start</code>
              , or wrap it in a Dockerfile. The app has no server-side secrets so the image needs no special environment.
            </P>

            {/* ── Automations ── */}
            <H2 id="automations">Automations</H2>
            <P>
              All automation scripts run via{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">tsx</code>{" "}
              directly on your machine or server — no browser required. Each script reads account
              credentials and behaviour settings from two places: a{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">.env</code>{" "}
              file for secrets and runtime overrides, and a{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">settings.ts</code>{" "}
              file inside each automation folder for all bot behaviour options.
            </P>
            <Callout icon={Shield}>
              You <strong className="text-foreground font-semibold">must</strong> configure both your{" "}
              <code className="font-mono text-xs text-primary">.env</code>{" "}
              file and the relevant{" "}
              <code className="font-mono text-xs text-primary">settings.ts</code>{" "}
              before running any automation. Scripts will throw an error and exit if required env vars are missing.
            </Callout>

            {/* env vars shared by all automations */}
            <H3 id="automations-env">Required environment variables</H3>
            <P>
              All automations share a common set of environment variables. Copy{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">.env.example</code>{" "}
              to{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">.env</code>{" "}
              and fill in the values below before running any script.
            </P>
            <CodeBlock lang=".env">{`# Encrypted account list generated by the dashboard export tool.
# Contains every sub-account username + posting key (AES-encrypted).
TERRACORE_ACCOUNTS_ENC=<paste exported value here>

# The main / receiver account username (no @ sign).
# Used as the sweep target for SCRAP transfers and as the buyer for relic market.
TERRACORE_ACCOUNT_MAIN=yourmainaccount

# How often each automation loops (milliseconds). Defaults to 60 000 (1 min).
# POLL_INTERVAL=60000`}</CodeBlock>

            <H3 id="automations-claim">Auto Claim &amp; Battle</H3>
            <P>Attacks targets and claims the SCRAP stash for every configured account in one continuous loop.</P>
            <CodeBlock>{`pnpm auto:claim-battle`}</CodeBlock>
            <P>
              Behaviour is controlled by{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">
                server/automation/auto-claim-battle/config/settings.ts
              </code>
              . Open that file and adjust the values before your first run:
            </P>
            <CodeBlock lang="settings.ts">{`scrapRequirement: {
  enabled:    true,   // Skip claim if SCRAP balance < (minerate × multiplier)
  multiplier: 4,      // How many loop-cycles worth of SCRAP to wait for
},

manualClaim: {
  enabled: false,     // true = ignore scrapRequirement and always claim
},

attacks: {
  enabled:         true,  // Run attack sequence before claiming
  minimumRequired: 2,     // Skip attack if available attacks < this number
},

transfer: {
  enabled:        false,  // Sweep SCRAP to TERRACORE_ACCOUNT_MAIN after claim
  scrapAllowance: 200,    // SCRAP to leave in each sub-account after sweep
  memo:           "terracore auto-transfer",
},

delays: {
  betweenAttacks:   1500,  // ms between each attack broadcast
  betweenAccounts:  2000,  // ms between processing each account
  betweenLoops:     5000,  // ms between full loop cycles
  retryDelay:       1500,  // ms before a retry (multiplied by attempt #)
  claimPropagation: 3000,  // ms to wait after claim for HE balance to update
},`}</CodeBlock>

            <H3 id="automations-quest">Auto Quest</H3>
            <P>Collects completed quests and starts new available quests across all accounts.</P>
            <CodeBlock>{`pnpm auto:quest`}</CodeBlock>
            <P>
              Behaviour is controlled by{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">
                server/automation/auto-quest/config/settings.ts
              </code>
              :
            </P>
            <CodeBlock lang="settings.ts">{`quests: {
  maxStartsPerCycle: 3,  // Max board slots to start per account per cycle (1–3)
},

delays: {
  betweenActions:  1500,  // ms between collect/start broadcasts per account
  betweenAccounts: 2000,  // ms between accounts in one loop pass
  betweenLoops:    5000,  // ms between full loop cycles
  retryDelay:      1500,  // ms before a retry (multiplied by attempt #)
},

retry: {
  maxAttempts: 3,  // Max broadcast retries per account before giving up
},`}</CodeBlock>

            <H3 id="automations-transfer">Token Transfer</H3>
            <P>
              Sweeps tokens from all sub-accounts to your{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">TERRACORE_ACCOUNT_MAIN</code>.
              Supports native Hive tokens (
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">HIVE</code>
              ,{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">HBD</code>
              ) and any Hive Engine token such as{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">SCRAP</code>.
            </P>
            <CodeBlock>{`pnpm auto:token-transfer`}</CodeBlock>
            <P>
              Behaviour is controlled by{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">
                server/automation/auto-token-transfer/config/settings.ts
              </code>
              . The following env vars can also override settings at runtime:
            </P>
            <CodeBlock lang="settings.ts">{`tokenSymbol:    "HIVE",   // Token to sweep — HIVE / HBD or any HE token e.g. SCRAP
sendMaxBalance: true,     // true = full balance minus allowance; false = customAmount
customAmount:   0,        // Fixed amount per account when sendMaxBalance is false
allowance:      0,        // SCRAP to leave behind when sendMaxBalance is true
memo:           "Multicore bot token transfer consolidation",

delays: {
  betweenTransfers: 1500,
  betweenAccounts:  2000,
  betweenLoops:     60000,
  retryDelay:       1500,
},

retry: { maxAttempts: 3 },

runOnce: false,  // true = run once then exit (useful for cron setups)`}</CodeBlock>
            <P>
              Runtime env overrides (optional — override settings without editing the file):
            </P>
            <CodeBlock lang=".env">{`TOKEN_SYMBOL=SCRAP          # Override tokenSymbol
SEND_MAX_BALANCE=true       # Override sendMaxBalance
CUSTOM_AMOUNT=50            # Override customAmount
RUN_ONCE=true               # Override runOnce`}</CodeBlock>

            <H3 id="automations-relic">Relic Market</H3>
            <P>
              Runs the combined sell-then-buy cycle. Sub-accounts list their relics; the main account
              buys them back according to your pricing and filter rules.
            </P>
            <Callout icon={Shield}>
              The relic market automation requires{" "}
              <code className="font-mono text-xs text-primary">TERRACORE_ACCOUNT_MAIN</code>{" "}
              to have an <strong className="text-foreground font-semibold">active key</strong> loaded
              (not just a posting key) — the buy broadcast uses a custom_json that requires active authority.
            </Callout>
            <CodeBlock>{`pnpm auto:relic-market`}</CodeBlock>
            <P>
              Behaviour is controlled by{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">
                server/automation/auto-relic-market/config/settings.ts
              </code>
              :
            </P>
            <CodeBlock lang="settings.ts">{`sell: {
  pricingMode: "auto",  // "auto" = undercut floor | "fixed" = flat per-rarity price
  autoFloor:   0.1,     // Minimum total listing price in HIVE (marketplace minimum)

  // Used only when pricingMode is "fixed":
  fixedPrices: {
    common_relics:    0.001,
    uncommon_relics:  0.001,
    rare_relics:      0.001,
    epic_relics:      0.001,
    legendary_relics: 0.001,
  },
},

buy: {
  batchTrigger:    25,    // Cached listing count that triggers an immediate buy phase
  triggerDelay:    5000,  // ms to wait after trigger before fetching live market
  batchSize:       25,    // Max ops per Hive broadcast tx (keep ≤ 25)
  rarityFilter:    null,  // e.g. ["rare_relics","epic_relics"] or null for all
  maxPricePerUnit: null,  // Skip listings above this HIVE/unit; null = no limit
},

delays: {
  betweenAccounts: 1500,
  betweenBatches:  1500,
  betweenLoops:    5000,
  retryDelay:      1500,
},

retry: { maxAttempts: 4 },`}</CodeBlock>

            <H3 id="automations-terracore">Terracore (combined)</H3>
            <P>
              Runs claim, battle, quest, and SCRAP transfer in a single continuous process. This is the
              recommended command for fully hands-off Terracore operation.
            </P>
            <CodeBlock>{`pnpm auto:terracore`}</CodeBlock>
            <P>
              Behaviour is controlled by{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary">
                server/automation/terracore/config/settings.ts
              </code>
              . It combines the claim/battle, quest, and transfer settings in one file:
            </P>
            <CodeBlock lang="settings.ts">{`scrapRequirement: { enabled: true, multiplier: 4 },
manualClaim:      { enabled: false },
attacks:          { enabled: true, minimumRequired: 2 },
quests:           { maxStartsPerCycle: 3 },

transfer: {
  enabled:        true,   // Sweep SCRAP to TERRACORE_ACCOUNT_MAIN after each claim
  scrapAllowance: 200,    // SCRAP to leave in each sub-account
  memo:           "Multicore Bot consolidation",
},

delays: {
  betweenAttacks:   1500,
  betweenActions:   1500,  // Between quest collect/start broadcasts
  betweenAccounts:  2000,
  betweenLoops:     5000,
  retryDelay:       1500,
  claimPropagation: 3000,
},

retry: { maxAttempts: 3 },`}</CodeBlock>

            <H3>Cron example</H3>
            <P>
              You can chain automations or set up cron jobs for scheduled execution. Example that runs
              the combined Terracore bot every hour:
            </P>
            <CodeBlock lang="cron">{`0 * * * * cd /path/to/multicore-app && pnpm auto:terracore`}</CodeBlock>

            {/* ── Author ── */}
            <H2 id="author">Author</H2>
            <P>
              Multicore was built and is maintained by{" "}
              <a
                href="https://peakd.com/@rhiaji"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline underline-offset-2 font-semibold"
              >
                @rhiaji
              </a>
              . You can follow updates, posts, and future projects on their PeakD profile.
            </P>

            <div className="my-5 flex items-center gap-4 rounded-xl border border-border bg-card p-4 hover:border-border/80 transition-colors">
              <div className="size-10 rounded-full bg-muted border border-border flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-muted-foreground">rh</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-bold text-foreground">rhiaji</span>
                <a
                  href="https://peakd.com/@rhiaji"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline underline-offset-2"
                >
                  <ExternalLink className="size-3" />
                  peakd.com/@rhiaji
                </a>
              </div>
            </div>

            {/* bottom nav */}
            <div className="mt-16 pt-6 border-t border-border flex items-center justify-end">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline underline-offset-2"
              >
                Open the Dashboard
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </main>



      </div>

      {/* ── footer ── */}
      <footer className="border-t border-border bg-card/20">
        <div className="max-w-screen-2xl mx-auto px-5 sm:px-8 h-12 flex items-center justify-between gap-4">
          <span className="text-xs text-muted-foreground font-mono">
            multicore — MIT License — made by{" "}
            <a
              href="https://peakd.com/@rhiaji"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline underline-offset-2"
            >
              @rhiaji
            </a>
          </span>
          <a
            href="https://github.com/rhiaji/multicore-app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <GithubIcon className="size-3.5" />
            <span className="hidden sm:inline">rhiaji/multicore-app</span>
          </a>
        </div>
      </footer>
    </div>
  )
}
