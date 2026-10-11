// A trip under way (today is within its dates): the days up to today are what happened, so the plan changes only from
// tomorrow on. The assistant's changes that touch those days are refused (agent/tools.ts), and the user is asked
// before an edit by hand does (store/trip.ts).
import { daysBetween } from './dates'
import type { ScheduledStop } from './types'

const pad = (n: number) => String(n).padStart(2, '0')
/** Today where the traveller is (this device's time zone), as an ISO date. */
export const localToday = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

/** Today is one of the trip's days. */
export const isTravelling = (input: { startDate: string; endDate: string }, today: string) =>
  !!input.startDate && input.startDate <= today && today <= input.endDate

/** Where the trip is today: its day (1 = the first), and the stop it's at (the last one begun by today), if any. */
export function travelDay(input: { startDate: string; endDate: string }, stops: ScheduledStop[], today: string) {
  const at = stops.findLastIndex((s) => s.arrive <= today)
  return { day: daysBetween(input.startDate, today) + 1, of: daysBetween(input.startDate, input.endDate), at: at >= 0 ? at : null }
}

/** A stop's days so far: `done` (left by today), `now` (there tonight) or `ahead`. */
export const stopTime = (s: ScheduledStop, today: string): 'done' | 'now' | 'ahead' =>
  s.arrive > today ? 'ahead' : s.depart <= today ? 'done' : 'now'

type Scheduled = { input: { startDate: string }; stops: ScheduledStop[] }
export type PastChange = { kind: 'start' } | { kind: 'stop'; cityId: string; change: 'gone' | 'moved' | 'dates' | 'nights' }

/**
 * What a change (before → after) did to the days up to today: the start date, a stop begun by today taken out, moved
 * or another put before it, its dates moved, or the nights of a stop already left. The stop of tonight may get more or fewer nights, as
 * long as it still ends tomorrow or later. Empty when those days are as they were.
 */
export function pastChanges(before: Scheduled, after: Scheduled, today: string): PastChange[] {
  const out: PastChange[] = []
  if (after.input.startDate !== before.input.startDate) out.push({ kind: 'start' })
  before.stops.forEach((s, i) => {
    if (s.arrive > today) return
    const now = after.stops[i]
    if (now?.cityId !== s.cityId) {
      out.push({ kind: 'stop', cityId: s.cityId, change: after.stops.some((x) => x.cityId === s.cityId) ? 'moved' : 'gone' })
    } else if (now.arrive !== s.arrive) {
      out.push({ kind: 'stop', cityId: s.cityId, change: 'dates' })
    } else if (s.depart <= today ? now.depart !== s.depart : now.depart <= today) {
      out.push({ kind: 'stop', cityId: s.cityId, change: 'nights' })
    }
  })
  return out
}
