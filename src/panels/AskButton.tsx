import { Sparkles } from 'lucide-react'
import { askAbout } from '../agent/askAbout'
import { useChat } from '../agent/chat'
import { SHARED_TOKEN } from '../store/shareLink'
import { useTrip } from '../store/trip'

/** "Ask AI" in a city or journey panel's header: opens the Assistant, which already sees what the panel shows, with a
 *  question and the app's answer about it (agent/askAbout.ts): what the assistant can do there, and questions to click.
 *  Not twice in a row for the same questions, nor while the assistant is answering (it just opens). */
export function AskButton() {
  const askAssistant = useTrip((s) => s.askAssistant)
  if (SHARED_TOKEN) return null
  const open = () => {
    const about = askAbout()
    const { busy, messages, preset } = useChat.getState()
    const [asked, answered] = messages.slice(-2)
    const again = asked?.text === about?.ask && answered?.role === 'assistant' && answered.choices?.join() === about?.choices.join()
    if (about && !busy && !again) preset(about.ask, about.answer, about.choices)
    askAssistant()
  }
  return (
    <button
      onClick={open}
      title="Ask the assistant about this"
      className="flex h-7 shrink-0 items-center gap-1 rounded-full border border-accent/50 px-2.5 text-[12px] font-medium text-accent hover:bg-accent-soft"
    >
      <Sparkles size={14} />
      Ask AI
    </button>
  )
}
