// "Update with AI" beside the title of a card the assistant can fill in or change (My visit, a city's costs, a
// journey's notes, the trip's preferences): opens the Assistant with a question about that card and the app's own
// answer, saying what to send it (a booking, a receipt, a screenshot, a few words). No model call until the user
// replies; the model sees both in the conversation, so the reply makes sense to it.
import { Sparkles } from 'lucide-react'
import { useChat } from '../agent/chat'
import { SHARED_TOKEN } from '../store/shareLink'
import { useTrip } from '../store/trip'

/** `choices`: replies to click instead of typing (examples to start from). */
type Help = { ask: (place: string) => string; answer: (place: string) => string; choices?: string[] }

const HELP = {
  stay: {
    ask: (c) => `How do I update where I stay in ${c} with AI?`,
    answer: (c) => `**Send me your booking**, any way you like:\n- Paste the confirmation email\n- Attach a screenshot or PDF (📎 below)\n- Or just type it: *"Hostel Mostel, 20–23 May, €45"*\n\nI'll save it as your stay in ${c}.`,
  },
  album: {
    ask: (c) => `How do I add photo albums for ${c} with AI?`,
    answer: (c) => `**Paste an album's share link** (Google Photos, iCloud…) and say what's in it, e.g. *"Day 2, old town"*.\n\nI'll add it to Photos for ${c}.`,
  },
  link: {
    ask: (c) => `How do I add links for ${c} with AI?`,
    answer: (c) => `**Paste the links** you want to keep: tours, tickets, restaurants, posts, videos. Several at once is fine.\n\nI'll add them to Links for ${c}, each with a short title.`,
  },
  note: {
    ask: (c) => `How do I update my notes for ${c} with AI?`,
    answer: (c) => `**Tell me what to remember**, or paste text or a screenshot:\n- Places to try\n- A friend's number\n- A to-do list (with boxes to tick)\n\nI'll add it to your notes for ${c}.`,
  },
  journeyNote: {
    ask: (j) => `How do I update my notes for the journey ${j} with AI?`,
    answer: () => `**Send me your ticket**, any way you like:\n- Paste the booking\n- Attach a screenshot or PDF (📎 below)\n- Or type a reminder: *"Buy the ticket at the station"*\n\nI'll note the times, where it leaves from, your seat and the booking reference.`,
  },
  dailyCost: {
    ask: (c) => `How do I update the daily cost in ${c} with AI?`,
    answer: (c) => `**Tell me what you paid**, or attach a receipt (📎 below):\n- A meal, a coffee, a beer\n- A bus day pass, a taxi ride\n- Or a whole day, all in\n\nAny currency is fine. Your prices replace ours for ${c}.`,
  },
  stayPrices: {
    ask: (c) => `How do I update the prices for a night in ${c} with AI?`,
    answer: (c) => `**Paste your booking**, or attach a screenshot (📎 below).\n\nI'll work out the price per night and put it in as the dorm bed or private room price for ${c}.`,
  },
  foodPrices: {
    ask: (c) => `How do I update food and drink prices in ${c} with AI?`,
    answer: (c) => `**Attach a photo** of a menu, a receipt or a supermarket shelf (📎 below), or just tell me what you paid.\n\nI'll fill in the prices for ${c}. Any currency is fine.`,
  },
  phrases: {
    ask: (c) => `How do I add my own phrases for ${c} with AI?`,
    answer: (c) => `**Tell me the phrases you need**, e.g.:\n- *"I'm vegetarian"*\n- *"Where's the toilet?"*\n- *"The bill, please"*\n\nI'll translate them, with how to say them, for ${c} or for every country on your trip.`,
    choices: ["I'm vegetarian", "Where's the toilet?", 'The bill, please'],
  },
  who: {
    ask: () => 'How do I update Who with AI?',
    answer: () => `**Just tell me**, e.g. *"Taiwanese passport, starting from Taipei and flying back there."*\n\nI'll set your passport and home city.`,
  },
  goals: {
    ask: () => 'How do I update Trip goals with AI?',
    answer: () => `**Tell me what matters most**:\n- Many countries, or just the highlights?\n- Expensive places: stay shorter, skip them, or don't mind?\n\nI'll set your trip goals.`,
  },
  dailyCostPrefs: {
    ask: () => 'How do I update my Daily cost preferences with AI?',
    answer: () => `**Describe a normal day**, e.g. *"$40 a day, dorms, cook breakfast, eat out at night, one coffee."*\n\nI'll set your budget and what every city's day counts.`,
  },
  around: {
    ask: () => 'How do I update Get around with AI?',
    answer: () => `**Tell me how you like to move**, e.g. *"Slow pace, no flights, at most 5 hours a day, night trains OK."*\n\nI'll set it for you.`,
  },
  interests: {
    ask: () => 'How do I update Interests with AI?',
    answer: () => `**Tell me what you love**: food, history, hiking, beaches, nightlife…\n\nI'll pick the interests, and the planner favours places that match.`,
  },
  comfort: {
    ask: () => 'How do I update Comfort with AI?',
    answer: () => `**Tell me the weather you like**, e.g. *"Below 15°C is cold, above 30°C too hot, skip rainy months."*\n\nI'll set your temperature bands and months to avoid.`,
  },
} satisfies Record<string, Help>

export type AiTopic = keyof typeof HELP

/** The button: `place`, the city (or the journey, "from Kraków to Vienna") the card is about. Not on someone
 *  else's shared trip; `hidden` for a card the assistant can't change now (preferences on a read-only trip). */
export function AiHelp({ topic, place = '', hidden }: { topic: AiTopic; place?: string; hidden?: boolean }) {
  const askAssistant = useTrip((s) => s.askAssistant)
  const busy = useChat((s) => s.busy)
  if (SHARED_TOKEN || hidden) return null
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
