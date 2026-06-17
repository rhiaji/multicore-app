import type { Metadata } from "next"
import { RelicsMarket } from "@/components/market/relics-market"

export const metadata: Metadata = {
  title: "Relic Market — Multicore",
  description: "Browse active relic listings on the Terracore marketplace, sorted by price.",
}

export default function RelicsMarketPage() {
  return <RelicsMarket />
}
