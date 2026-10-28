// A trip's dates against today (planner/travel.ts): where it is in the itinerary (planning, travelling or finished), and a question before an edit by hand
// changes days that already happened (the assistant's own changes to them are refused instead).
import { useChat } from '../agent/chat'
import { pastText } from '../agent/tools'
import { daysBetween, localToday, travelDay, tripPhase } from '../planner'
import { onPastEdit, useTripState } from '../store/trip'
import { confirm } from '../ui/dialog'
import { cityName } from '../ui/format'

onPastEdit((changes) =>
  // (The assistant's own changes are checked by its tools.)
  useChat.getState().busy ||
  confirm('Change days that already happened?', { message: `Your trip is under way, and this changes ${pastText(changes)}.`, ok: 'Change them' }))

/** The trip's dates, nights and stops: "2026/09/01 – 2027/01/30 · 151 nights · 25 stops" (the Trip and Itinerary tabs). */
export function TripSummary() {
  const { input, plan } = useTripState('input', 'plan')
  if (!plan) return null
  const slash = (iso: string) => iso.replaceAll('-', '/')
  return (
    <span className="text-[12px] text-muted">
      <b className="text-ink">{slash(input.startDate)} – {slash(input.endDate)}</b> · <b className="text-ink">{plan.totalNights}</b> nights · <b className="text-ink">{plan.stops.length}</b> stops
    </span>
  )
}

/**
 * Where today is against the trip, as a chip by the itinerary's dates: "Planning · starts in 59 days", "Travelling ·
 * day 23 of 60 · Tirana" or "Finished"; nothing without dates.
 */
export function TripStatus() {
  const { input, plan } = useTripState('input', 'plan')
  const today = localToday()
  const phase = tripPhase(input, today)
  if (!phase) return null
  const chip = 'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap'
  if (phase === 'before') {
    const days = daysBetween(today, input.startDate)
    return (
      <span className={`${chip} bg-info-soft text-info`} title="Not under way yet: the whole itinerary can still change">
        Planning · starts {days === 1 ? 'tomorrow' : `in ${days} days`}
      </span>
    )
  }
  if (phase === 'after') {
    return <span className={`${chip} bg-canvas text-muted`} title="The trip's dates are over">Finished</span>
  }
  const { day, of, at } = travelDay(input, plan?.stops ?? [], today)
  return (
    <span
      className={`${chip} bg-accent text-on-accent`}
      title="The days up to today are what happened: the assistant changes only what comes after, and you're asked before changing them"
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-on-accent" />
      Travelling · day {day} of {of}{plan && at !== null && ` · ${cityName(plan.stops[at].cityId)}`}
    </span>
  )
}
