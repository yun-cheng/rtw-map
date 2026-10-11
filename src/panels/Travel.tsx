// A trip under way (planner/travel.ts): where it is today in the itinerary, and a question before an edit by hand
// changes days that already happened (the assistant's own changes to them are refused instead).
import { useChat } from '../agent/chat'
import { pastText } from '../agent/tools'
import { isTravelling, localToday, travelDay } from '../planner'
import { onPastEdit, useTrip } from '../store/trip'
import { cityName } from '../ui/format'

onPastEdit((changes) =>
  // (The assistant's own changes are checked by its tools.)
  useChat.getState().busy ||
  window.confirm(`Your trip is under way, and this changes days that already happened: ${pastText(changes)}.\n\nChange them anyway?`))

/** Today on a trip under way, for the itinerary: "Travelling · day 23 of 60 · in Tirana"; nothing otherwise. */
export function TravelLine() {
  const { input, plan } = useTrip()
  const today = localToday()
  if (!plan || !isTravelling(input, today)) return null
  const { day, of, at } = travelDay(input, plan.stops, today)
  return (
    <p className="px-4 pb-2 text-[12px]" title="The days up to today are what happened: the assistant changes only what comes after, and you're asked before changing them">
      <span className="font-semibold text-accent">Travelling</span>
      <span className="text-muted"> · day {day} of {of}{at !== null && ` · in ${cityName(plan.stops[at].cityId)}`}</span>
    </p>
  )
}
