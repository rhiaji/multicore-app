"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { PlusCircle } from "lucide-react"

interface AddAccountProps {
  onAdd: (username: string) => void
  existingUsernames: string[]
}

export function AddAccount({ onAdd, existingUsernames }: AddAccountProps) {
  const [value, setValue] = useState("")
  const [error, setError] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim().toLowerCase()
    if (!trimmed) {
      setError("Please enter a username.")
      return
    }
    if (existingUsernames.includes(trimmed)) {
      setError("This account is already added.")
      return
    }
    setError("")
    onAdd(trimmed)
    setValue("")
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-start gap-2">
      <div className="flex flex-col gap-1 flex-1 max-w-xs">
        <Input
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError("")
          }}
          placeholder="Enter username..."
          className="bg-muted border-border text-foreground placeholder:text-muted-foreground h-9 text-sm"
          aria-label="Hive username"
        />
        {error && (
          <p className="text-[11px] text-destructive">{error}</p>
        )}
      </div>
      <Button
        type="submit"
        size="sm"
        className="h-9 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-1.5"
      >
        <PlusCircle className="size-4" data-icon="inline-start" />
        Add Account
      </Button>
    </form>
  )
}
