"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Send } from "lucide-react"
import { loadHiveUser } from "@/lib/hive-auth"
import { transferHive } from "@/lib/events/transfer-hive/action"

interface SendHiveModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  username: string        // the tracked account that is SENDING
  availableHive: number
}

export function SendHiveModal({ open, onOpenChange, username, availableHive }: SendHiveModalProps) {
  // Default recipient = the currently logged-in Keychain account
  const loggedInUser = loadHiveUser()
  const [recipient, setRecipient] = useState(loggedInUser?.username ?? "")
  const [amount, setAmount] = useState("")
  const [memo, setMemo] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  // Re-apply default recipient whenever the modal opens
  useEffect(() => {
    if (open) {
      const user = loadHiveUser()
      setRecipient(user?.username ?? "")
      setAmount("")
      setMemo("")
      setError("")
      setSuccess(false)
    }
  }, [open])

  const handleSend = () => {
    setError("")
    setSuccess(false)

    if (!recipient.trim()) {
      setError("Recipient username is required")
      return
    }
    if (!amount || isNaN(parseFloat(amount))) {
      setError("Please enter a valid amount")
      return
    }
    const sendAmount = parseFloat(amount)
    if (sendAmount <= 0) {
      setError("Amount must be greater than 0")
      return
    }
    if (sendAmount > availableHive) {
      setError(`Insufficient HIVE balance. Available: ${availableHive.toFixed(3)}`)
      return
    }

    setLoading(true)

    transferHive(
      {
        from:     username,
        to:       recipient.trim(),
        amount:   sendAmount.toFixed(3),
        memo:     memo.trim(),
        enforced: false,
      },
      (result) => {
        setLoading(false)
        if (result.success) {
          setSuccess(true)
          setTimeout(() => {
            onOpenChange(false)
            setSuccess(false)
          }, 1500)
        } else {
          setError(result.message)
        }
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send HIVE</DialogTitle>
          <DialogDescription>
            Transfer HIVE tokens from {username}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Available balance */}
          <div className="bg-muted/50 rounded-lg p-3 border border-border">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Available</p>
            <p className="text-lg font-bold text-foreground font-mono">{availableHive.toFixed(3)} HIVE</p>
          </div>

          {/* Recipient */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Recipient</p>
            <Input
              id="recipient"
              placeholder="Enter username"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              disabled={loading}
              className="text-sm"
            />
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Amount (HIVE)</p>
            <div className="flex gap-2">
              <Input
                id="amount"
                type="number"
                step="0.001"
                placeholder="0.000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={loading}
                className="text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAmount(availableHive.toFixed(3))}
                disabled={loading}
                className="text-xs"
              >
                Max
              </Button>
            </div>
          </div>

          {/* Memo */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Memo (optional)</p>
            <Input
              id="memo"
              placeholder="Add a message..."
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              disabled={loading}
              className="text-sm"
              maxLength={255}
            />
            <p className="text-[10px] text-muted-foreground">{memo.length}/255</p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-2.5">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2.5">
              <p className="text-xs text-green-400 font-semibold">HIVE sent successfully!</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={loading || !recipient || !amount}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="size-3 animate-spin mr-1.5" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="size-3 mr-1.5" />
                  Send
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
