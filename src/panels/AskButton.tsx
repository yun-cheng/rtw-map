import { Sparkles } from 'lucide-react'
import { useTrip } from '../store/trip'

/** "Ask AI" in a city or journey panel's header: opens the Assistant, which already sees what the panel shows. */
export function AskButton() {
  const askAssistant = useTrip((s) => s.askAssistant)
  return (
    <button
      onClick={askAssistant}
      title="Ask the assistant about this"
      className="flex h-7 shrink-0 items-center gap-1 rounded-full border border-accent/50 px-2.5 text-[12px] font-medium text-accent hover:bg-accent-soft"
    >
      <Sparkles size={14} />
      Ask AI
    </button>
  )
}
