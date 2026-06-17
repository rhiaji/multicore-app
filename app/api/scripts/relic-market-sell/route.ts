import { NextRequest } from "next/server"
import { runRelicMarketSell } from "@/lib/server-events/relic-market-sell/action"

export const runtime     = "nodejs"
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const body    = await req.json()
  const encoder = new TextEncoder()

  const signal = req.signal

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const evt of runRelicMarketSell(body, signal)) {
          if (signal.aborted) break
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`))
        }
      } catch (err) {
        if (!signal.aborted) {
          const errEvt = { type: "error", message: err instanceof Error ? err.message : "Unexpected error" }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errEvt)}\n\n`))
        }
      } finally {
        controller.close()
      }
    },
    cancel() { /* client disconnected — nothing extra needed */ },
  })

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
