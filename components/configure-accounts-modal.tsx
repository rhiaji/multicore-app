"use client"

import { useState } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { encryptAccounts, generateEncryptionKey } from "@/lib/encryption"
import { Copy, Check, AlertCircle, Key } from "lucide-react"

interface ConfigureAccountsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ConfigureAccountsModal({ open, onOpenChange }: ConfigureAccountsModalProps) {
  const [jsonInput, setJsonInput] = useState("")
  const [encryptedConfig, setEncryptedConfig] = useState("")
  const [generatedKey, setGeneratedKey] = useState("")
  const [copied, setCopied] = useState<"key" | "config" | null>(null)
  const [error, setError] = useState("")
  const [step, setStep] = useState<"input" | "result">("input")

  const handlePasteJson = async () => {
    try {
      const text = await navigator.clipboard.readText()
      setJsonInput(text)
      setError("")
    } catch {
      setError("Failed to read clipboard")
    }
  }

  const handleEncrypt = () => {
    try {
      setError("")
      const parsed = JSON.parse(jsonInput)

      if (!Array.isArray(parsed)) {
        setError("Input must be a JSON array")
        return
      }

      if (parsed.length === 0) {
        setError("Array cannot be empty")
        return
      }

      // Validate each account has required fields
      parsed.forEach((acc, idx) => {
        if (!acc.username || typeof acc.username !== "string") {
          throw new Error(`Account ${idx}: missing or invalid username`)
        }
        if (!acc.active_key || typeof acc.active_key !== "string") {
          throw new Error(`Account ${idx}: missing or invalid active_key`)
        }
        if (!acc.posting_key || typeof acc.posting_key !== "string") {
          throw new Error(`Account ${idx}: missing or invalid posting_key`)
        }
      })

      // Generate random encryption key
      const key = generateEncryptionKey()

      // Encrypt accounts
      const encrypted = encryptAccounts(parsed, key)

      setGeneratedKey(key)
      setEncryptedConfig(JSON.stringify(encrypted, null, 2))
      setStep("result")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Encryption failed")
    }
  }

  const handleCopy = (text: string, type: "key" | "config") => {
    navigator.clipboard.writeText(text)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleReset = () => {
    setJsonInput("")
    setEncryptedConfig("")
    setGeneratedKey("")
    setError("")
    setStep("input")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Key className="size-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Encrypt Account Keys</h2>
          </div>

          {/* Step 1: Paste JSON */}
          {step === "input" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Step 1: Paste Account JSON
                </label>
                <p className="text-xs text-muted-foreground">
                  Paste the exported JSON array with active_key and posting_key filled in
                </p>
              </div>

              <textarea
                value={jsonInput}
                onChange={(e) => {
                  setJsonInput(e.target.value)
                  setError("")
                }}
                placeholder={`[
  {
    "username": "dvpm01",
    "active_key": "...",
    "posting_key": "..."
  },
  {
    "username": "dvpm02",
    "active_key": "...",
    "posting_key": "..."
  }
]`}
                className="w-full h-48 p-3 text-xs font-mono bg-muted border border-border rounded-lg focus:outline-none focus:border-primary resize-none"
              />

              {error && (
                <div className="flex gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                  <AlertCircle className="size-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-600">{error}</p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handlePasteJson}
                  className="flex-1 px-3 py-2 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                >
                  Paste from Clipboard
                </button>
                <button
                  onClick={handleEncrypt}
                  disabled={!jsonInput}
                  className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  Encrypt Accounts
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Result */}
          {step === "result" && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                <p className="text-xs text-green-600 font-semibold">
                  ✓ Encryption successful! Copy both outputs below.
                </p>
              </div>

              {/* Encryption Key */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Encryption Key (32-byte random hex)
                </label>
                <div className="flex gap-2">
                  <code className="flex-1 p-3 rounded-lg bg-muted border border-border text-[10px] font-mono text-foreground overflow-x-auto break-all">
                    {generatedKey}
                  </code>
                  <button
                    onClick={() => handleCopy(generatedKey, "key")}
                    className="px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    {copied === "key" ? (
                      <>
                        <Check className="size-3 text-primary" />
                        <span className="text-xs font-semibold">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="size-3" />
                        <span className="text-xs font-semibold">Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Set as env var: <code className="bg-muted px-1 py-0.5 rounded text-foreground">TERRACORE_ENCRYPTION_KEY</code>
                </p>
              </div>

              {/* Encrypted Config */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Encrypted Accounts Config
                </label>
                <div className="flex gap-2">
                  <textarea
                    value={encryptedConfig}
                    readOnly
                    className="flex-1 p-3 rounded-lg bg-muted border border-border text-[10px] font-mono text-foreground h-40 resize-none focus:outline-none"
                  />
                  <button
                    onClick={() => handleCopy(encryptedConfig, "config")}
                    className="px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors flex items-center gap-1.5 h-fit whitespace-nowrap"
                  >
                    {copied === "config" ? (
                      <>
                        <Check className="size-3 text-primary" />
                        <span className="text-xs font-semibold">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="size-3" />
                        <span className="text-xs font-semibold">Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Set as env var: <code className="bg-muted px-1 py-0.5 rounded text-foreground">TERRACORE_ACCOUNTS_ENC</code>
                </p>
              </div>

              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <p className="text-[10px] text-muted-foreground">
                  <strong>Setup:</strong> Copy the encryption key and encrypted config to your server&apos;s environment variables. The server will automatically decrypt accounts on startup.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleReset}
                  className="flex-1 px-3 py-2 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
