"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Loader2, LogOut, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"
import { loginWithKeychain, fetchHiveAccount, parseHiveUser } from "@/lib/hive-auth"
import type { HiveUser } from "@/lib/hive-auth"

interface HiveLoginButtonProps {
  user: HiveUser | null
  onLogin: (user: HiveUser) => void
  onLogout: () => void
  forceOpen?: boolean
  onForceOpenHandled?: () => void
}

export function HiveLoginButton({ user, onLogin, onLogout, forceOpen, onForceOpenHandled }: HiveLoginButtonProps) {
  const [open, setOpen] = useState(false)
  const [usernameInput, setUsernameInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Allow parent to open the modal programmatically
  if (forceOpen && !open) {
    setOpen(true)
    onForceOpenHandled?.()
  }

  function handleLogin() {
    const u = usernameInput.trim().toLowerCase().replace(/^@/, "")
    if (!u) { setError("Enter a username."); return }
    setLoading(true)
    setError(null)
    loginWithKeychain(
      u,
      (hiveUser) => {
        setLoading(false)
        setOpen(false)
        setUsernameInput("")
        onLogin(hiveUser)
      },
      (msg) => {
        setLoading(false)
        setError(msg)
      }
    )
  }

  // Refresh balance for already-logged-in user
  async function refreshBalance() {
    if (!user) return
    const account = await fetchHiveAccount(user.username)
    if (account) onLogin(parseHiveUser(account))
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        {/* Avatar + balance pill */}
        <button
          onClick={refreshBalance}
          className="flex items-center gap-2 border border-border rounded-lg px-3 py-1.5 bg-card hover:bg-muted/40 transition-colors group"
          title="Click to refresh balance"
        >
          <img
            src={`https://images.hive.blog/u/${user.username}/avatar/small`}
            alt={user.username}
            className="size-5 rounded-full object-cover"
            onError={(e) => { e.currentTarget.style.display = "none" }}
          />
          <span className="text-[11px] font-semibold text-foreground">{user.username}</span>
          <span className="text-[10px] text-muted-foreground font-mono">
            {user.hiveBalance.toFixed(3)} HIVE
          </span>
        </button>

        {/* Logout */}
        <button
          onClick={onLogout}
          className="size-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10 transition-colors"
          title="Sign out"
        >
          <LogOut className="size-3.5" />
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => { setError(null); setOpen(true) }}
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary border border-primary/40 rounded-md px-2.5 py-1 hover:bg-primary/10 transition-colors"
      >
        <Wallet className="size-3" />
        Login
      </button>

      <Dialog open={open} onOpenChange={(v) => { if (!loading) setOpen(v) }}>
        <DialogContent className="max-w-sm w-full bg-card border-border">
          <DialogTitle className="text-sm font-bold uppercase tracking-widest text-foreground">
            Connect Hive Account
          </DialogTitle>

          <div className="flex flex-col gap-4 mt-1">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Sign in with Hive Keychain to view your HIVE balance and purchase relics from the marketplace.
            </p>

            {/* Username input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Hive Username
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">@</span>
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    placeholder="username"
                    disabled={loading}
                    className="w-full bg-background border border-border rounded-lg pl-7 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 disabled:opacity-50"
                  />
                </div>
                <button
                  onClick={handleLogin}
                  disabled={loading || !usernameInput.trim()}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-colors",
                    "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {loading ? <Loader2 className="size-3.5 animate-spin" /> : "Sign In"}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Keychain install hint */}
            <p className="text-[10px] text-muted-foreground">
              Don&apos;t have Keychain?{" "}
              <a
                href="https://hive-keychain.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Install it here
              </a>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
