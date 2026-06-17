"use client"

import { useState, useEffect } from "react"
import { HiveLoginButton } from "@/components/market/hive-login-button"
import type { HiveUser } from "@/lib/hive-auth"
import { loadHiveUser, saveHiveUser, clearHiveUser } from "@/lib/hive-auth"

/**
 * Self-contained Hive login control for use in top navbars.
 * Manages its own user state and persistence so any page can drop it in
 * without wiring up login handlers. Mirrors the market page behaviour.
 */
export function HiveLoginNav() {
  const [hiveUser, setHiveUser] = useState<HiveUser | null>(null)

  // Rehydrate from localStorage on first render (client-side only)
  useEffect(() => {
    const saved = loadHiveUser()
    if (saved) setHiveUser(saved)
  }, [])

  function handleLogin(user: HiveUser) {
    saveHiveUser(user)
    setHiveUser(user)
  }

  function handleLogout() {
    clearHiveUser()
    setHiveUser(null)
  }

  return (
    <HiveLoginButton user={hiveUser} onLogin={handleLogin} onLogout={handleLogout} />
  )
}
