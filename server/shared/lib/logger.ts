// Shared ANSI terminal logger for all server automations and scripts

const c = {
  reset:   "\x1b[0m",
  bright:  "\x1b[1m",
  dim:     "\x1b[2m",
  red:     "\x1b[31m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  blue:    "\x1b[34m",
  magenta: "\x1b[35m",
  cyan:    "\x1b[36m",
  white:   "\x1b[37m",
  gray:    "\x1b[90m",
}

function timestamp(): string {
  return `${c.gray}${new Date().toLocaleTimeString()}${c.reset}`
}

function padCenter(text: string, width: number): string {
  const padding = Math.max(0, width - text.length)
  const left    = Math.floor(padding / 2)
  const right   = padding - left
  return " ".repeat(left) + text + " ".repeat(right)
}

export function logHeader(title: string): void {
  const line = c.cyan + "═".repeat(60) + c.reset
  console.log(`\n${line}`)
  console.log(`${timestamp()} ${c.bright}${c.cyan}${padCenter(title, 60)}${c.reset}`)
  console.log(line)
}

export function logInfo(msg: string): void {
  console.log(`${timestamp()} ${c.blue}i${c.reset} ${msg}`)
}

export function logSuccess(msg: string): void {
  console.log(`${timestamp()} ${c.green}+${c.reset} ${msg}`)
}

export function logWarning(msg: string): void {
  console.log(`${timestamp()} ${c.yellow}!${c.reset} ${msg}`)
}

export function logError(msg: string): void {
  console.error(`${timestamp()} ${c.red}x${c.reset} ${msg}`)
}

export function logAction(msg: string): void {
  console.log(`${timestamp()} ${c.magenta}>${c.reset} ${msg}`)
}

export function logSkip(msg: string): void {
  console.log(`${timestamp()} ${c.gray}-${c.reset} ${msg}`)
}

export function logProgress(current: number, total: number, username: string): void {
  console.log(
    `${timestamp()} ${c.white}${current}/${total}${c.reset} ${c.gray}|${c.reset} ${c.bright}${username}${c.reset}`,
  )
}

export interface SummaryStats {
  [label: string]: number
}

// ── Loop stats (shared by both automations) ───────────────────────────────────

export interface LoopStats {
  claimed:     number   // claim-battle: claims completed
  collected:   number   // auto-quest / terracore: quests collected
  started:     number   // auto-quest / terracore: quests started
  transferred: number   // terracore: SCRAP sweeps performed
  skipped:     number
  errors:      number
  total:       number
}

// ── Quest-specific helpers ────────────────────────────────────────────────────

export function logQuestStatus(
  username: string,
  inProgress: number,
  readyToCollect: number,
  available: number,
): void {
  console.log(
    `${timestamp()} ${c.blue}i${c.reset} ${c.bright}${username}${c.reset} ${c.gray}|${c.reset}` +
    ` In Progress: ${inProgress}  Ready: ${readyToCollect}  Available: ${available}`,
  )
}

export function logQuestAction(
  action:    "collect" | "start",
  username:  string,
  questName: string,
  result:    "success" | "failed",
  detail?:   string,
): void {
  const label  = action === "collect" ? "Collected" : "Started"
  const symbol = result === "success" ? "+" : "x"
  const color  = result === "success" ? c.green : c.red
  const msg    = `${label} | ${username} | ${questName}${detail ? ` | ${detail}` : ""}`
  console.log(`${timestamp()} ${color}${symbol}${c.reset} ${msg}`)
}

// ── Claim / battle / transfer helpers ────────────────────────────────────────

export function logAttack(msg: string): void {
  console.log(`${timestamp()} ${c.red}x${c.reset} ${msg}`)
}

export function logClaim(msg: string): void {
  console.log(`${timestamp()} ${c.green}$${c.reset} ${msg}`)
}

export function logTransfer(username: string, to: string, amount: number): void {
  console.log(
    `${timestamp()} ${c.cyan}>${c.reset} Transfer | ${c.bright}${username}${c.reset}` +
    ` → ${c.bright}${to}${c.reset} | ${c.yellow}${amount.toFixed(3)} SCRAP${c.reset}`,
  )
}

export function logAccountProgress(
  current:       number,
  total:         number,
  username:      string,
  minerate:      number,
  claims:        number,
  scrap:         number,
  requiredScrap: number,
): void {
  console.log(
    `${timestamp()} ${c.bright}${current}/${total}${c.reset} ${c.gray}|${c.reset}` +
    ` ${c.bright}${username}${c.reset} ${c.gray}|${c.reset}` +
    ` minerate: ${c.cyan}${minerate.toFixed(1)}${c.reset}` +
    ` ${c.gray}|${c.reset} claims: ${c.yellow}${claims}${c.reset}` +
    ` ${c.gray}|${c.reset} scrap: ${c.green}${scrap.toFixed(2)}${c.reset}` +
    ` ${c.gray}/ need: ${requiredScrap.toFixed(2)}${c.reset}`,
  )
}

export function logSummary(title: string, stats: SummaryStats): void {
  const w    = 52
  const line = `${c.gray}+${"─".repeat(w)}+${c.reset}`
  console.log(`\n${line}`)
  console.log(`${c.gray}|${c.reset} ${c.bright}${c.white}${padCenter(title, w)}${c.reset}${c.gray}|${c.reset}`)
  console.log(line)
  for (const [label, value] of Object.entries(stats)) {
    const row = ` ${label}: ${String(value)}`
    console.log(`${c.gray}|${c.reset}${row.padEnd(w)} ${c.gray}|${c.reset}`)
  }
  console.log(line)
}
