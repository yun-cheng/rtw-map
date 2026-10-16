// "Update with AI" beside the title of a card the assistant can fill in from something sent to it (where you stay, a
// city's prices, phrases; not the preferences, photos, links or notes, quicker done by hand): opens the Assistant
// with a question about that card and the app's own answer, saying what to send it (a booking, a receipt, a
// screenshot, a few words). No model call until the user replies; the model sees both in the conversation, so the
// reply makes sense to it.
import { Sparkles } from 'lucide-react'
import { useChat } from '../agent/chat'
import { SHARED_TOKEN } from '../store/shareLink'
import { askAssistant } from '../ui/assistantPanel'

/** `choices`: replies to click instead of typing (examples to start from). */
type Help = { ask: (place: string) => string; answer: (place: string) => string; choices?: string[] }

const HELP = {
  stay: {
    ask: (c) => `How do I update where I stay in ${c} with AI?`,
    answer: (c) => `**Send me your booking**, any way you like:\n- Paste the confirmation email\n- Attach a screenshot or PDF (+ below)\n- Or just type it: *"Hostel Mostel, 20–23 May, €45"*\n\nI'll save it as your stay in ${c}.`,
  },
  dailyCost: {
    ask: (c) => `How do I update the daily cost in ${c} with AI?`,
    answer: (c) => `**Tell me what you paid**, or attach a receipt (+ below):\n- A meal, a coffee, a beer\n- A bus day pass, a taxi ride\n- Or a whole day, all in\n\nAny currency is fine. Your prices replace ours for ${c}.`,
  },
  stayPrices: {
    ask: (c) => `How do I update the prices for a night in ${c} with AI?`,
    answer: (c) => `**Paste your booking**, or attach a screenshot (+ below).\n\nI'll work out the price per night and put it in as the dorm bed or private room price for ${c}.`,
  },
  foodPrices: {
    ask: (c) => `How do I update food and drink prices in ${c} with AI?`,
    answer: (c) => `**Attach a photo** of a menu, a receipt or a supermarket shelf (+ below), or just tell me what you paid.\n\nI'll fill in the prices for ${c}. Any currency is fine.`,
  },
  phrases: {
    ask: (c) => `How do I add my own phrases for ${c} with AI?`,
    answer: (c) => `**Tell me the phrases you need**, e.g.:\n- *"I'm vegetarian"*\n- *"Where's the toilet?"*\n- *"The bill, please"*\n\nI'll translate them, with how to say them, for ${c} or for every country on your trip.`,
    choices: ["I'm vegetarian", "Where's the toilet?", 'The bill, please'],
  },
} satisfies Record<string, Help>

export type AiTopic = keyof typeof HELP

/** The button: `place`, the city (or the journey, "from Kraków to Vienna") the card is about. Not on someone
 *  else's shared trip. */
export function AiHelp({ topic, place = '' }: { topic: AiTopic; place?: string }) {
  const busy = useChat((s) => s.busy)
  if (SHARED_TOKEN) return null
  const open = () => {
    // (While the assistant is answering, it just opens: the question can wait.)
    const help: Help = HELP[topic]
    if (!busy) useChat.getState().preset(help.ask(place), help.answer(place), help.choices)
    askAssistant()
  }
  return (
    <button
      onClick={open} title="Ask the assistant to fill this in for you"
      className="flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium text-accent hover:bg-accent-soft"
    >
      <Sparkles size={12} />
      Update with AI
    </button>
  )
}
