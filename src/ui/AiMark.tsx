// The mark on something the user keeps (a stay, a ticket, a receipt, a link, a note) that an AI assistant filled in,
// all or in part (store/itemsCore.ts, `ai`).
import { Sparkles } from 'lucide-react'

export function AiMark({ on, size = 12 }: { on?: boolean; size?: number }) {
  if (!on) return null
  return (
    <span title="Filled in with AI: check it against your booking" aria-label="Filled in with AI" role="img" className="inline-flex shrink-0 text-accent">
      <Sparkles size={size} />
    </span>
  )
}
