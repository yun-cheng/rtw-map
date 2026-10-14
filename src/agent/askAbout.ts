// "Ask AI" in a city or journey panel (AskButton.tsx): a question and the app's own answer put in the chat, as the
// cards' "Update with AI" does (AiHelp.tsx), saying what the assistant can do there, with questions to click about that
// city or journey (the open tab's first). No model call until the user picks one or writes their own; the model sees
// both in the conversation.
import { dataset as ds } from '../data/dataset'
import { useTrip, type CityTab } from '../store/trip'

/** Questions offered at most. */
const SHOWN = 4

/** A question about what the open tab shows (`c`: the city's name, `k`: its country's); the rest have none. */
const TAB_QUESTIONS: Partial<Record<CityTab, (c: string, k: string) => string>> = {
  transport: (c) => `How do I get around ${c}?`,
  weather: (c) => `What's the weather like in ${c} during my trip?`,
  holidays: (c) => `Are there any holidays in ${c} during my trip?`,
  costs: (c) => `How much should I budget for a day in ${c}?`,
  daily: (c) => `How easy is ${c} without the local language?`,
  phrases: (c) => `Which phrases will I need most in ${c}?`,
  health: (c) => `Any vaccines or health tips for ${c}?`,
  safety: (c) => `Is ${c} safe? Anything to watch out for?`,
  entry: (_, k) => `Do I need a visa for ${k} on my passport?`,
}

export type AskAbout = { ask: string; answer: string; choices: string[] }

/** For the open city or journey panel; null for none. */
export function askAbout(): AskAbout | null {
  const { selected, cityTab, plan } = useTrip.getState()
  const name = (id: string) => ds.cities[id]?.name ?? id
  if (selected?.type === 'leg') {
    const leg = plan?.legs[selected.index]
    if (!leg) return null
    const [a, b] = [name(leg.from), name(leg.to)]
    return {
      ask: `What can you help me with for the journey from ${a} to ${b}?`,
      answer: `I can see this journey and your whole trip. **Ask me about the ways to go**, or tell me what to change, e.g. a stop on the way.\n\nFor example:`,
      choices: [
        `What are my options from ${a} to ${b}?`,
        `Is there a cheaper way from ${a} to ${b}?`,
        `Could I break up the journey from ${a} to ${b} with a stop on the way?`,
      ],
    }
  }
  if (selected?.type !== 'city' || !ds.cities[selected.id]) return null
  const city = ds.cities[selected.id]
  const c = city.name
  const country = ds.countries[city.iso2]?.name ?? city.iso2
  const i = plan?.stops.findIndex((s) => s.cityId === city.id) ?? -1
  const stop = i >= 0 ? plan!.stops[i] : null
  const next = stop && plan!.stops[i + 1]
  const tab = TAB_QUESTIONS[cityTab]?.(c, country)
  const more = stop
    ? [`Is ${stop.nights} night${stop.nights > 1 ? 's' : ''} in ${c} the right amount?`, next && `What's the best way from ${c} to ${name(next.cityId)}?`, `What should I know before I get to ${c}?`]
    : plan
      ? [`Is ${c} worth adding to my trip?`, `Add ${c} to my trip where it fits best`]
      : [`Is ${c} worth a visit, and for how long?`]
  return {
    ask: `What can you help me with in ${c}?`,
    answer: stop
      ? `I can see ${c}'s panel and your whole trip. **Ask me anything about ${c}**, or tell me what to change: its nights, the stops around it, where you stay.\n\nFor example:`
      : `I can see ${c}'s panel and your whole trip. **Ask me anything about ${c}**${plan ? ', or whether to add it to your trip' : ''}.\n\nFor example:`,
    choices: [tab, ...more].filter((q): q is string => !!q).slice(0, SHOWN),
  }
}
