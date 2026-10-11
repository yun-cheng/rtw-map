import { addDays, daysBetween } from './dates'
import type { Dataset, ScheduledStop, SchengenSummary } from './types'

export const SCHENGEN_LIMIT = 90
const WINDOW = 180

/** Does the 90/180 rule apply to this passport? (Not for EU/EEA/Swiss citizens.) */
export function schengenApplies(ds: Dataset, passport: string): boolean {
  const pl = ds.visa.rules[passport]?.PL
  return pl?.req !== 'free_movement'
}

/**
 * Counts Schengen days the way the EU does: every calendar day you are in the area counts,
 * including the entry and exit days. Days spent in Schengen before the trip are assumed to fall
 * right before the start date (worst case).
 */
/** The trip's days in the Schengen area (1) or not (0), from the first stop's arrival to the last one's departure. */
function areaDays(ds: Dataset, stops: ScheduledStop[]): { start: string; inS: Uint8Array } {
  const start = stops[0].arrive
  const end = stops[stops.length - 1].depart
  const len = daysBetween(start, end) + 1
  const inS = new Uint8Array(len)
  stops.forEach((s, i) => {
    if (!ds.countries[ds.cities[s.cityId].iso2]?.schengen) return
    const from = daysBetween(start, s.arrive)
    // Leaving on an overnight leg to another Schengen stop keeps you inside the area overnight.
    const nextIn = stops[i + 1] && ds.countries[ds.cities[stops[i + 1].cityId].iso2]?.schengen
    const to = daysBetween(start, nextIn ? stops[i + 1].arrive : s.depart)
    for (let d = from; d <= to && d < len; d++) inS[d] = 1
  })
  return { start, inS }
}

/** Schengen days counted on trip day `d` (0 = the first stop's arrival): those in the 180 days up to it. */
function countOn(inS: Uint8Array, d: number, daysBefore: number) {
  let count = 0
  for (let k = Math.max(0, d - WINDOW + 1); k <= Math.min(d, inS.length - 1); k++) count += inS[k]
  return count + Math.max(0, Math.min(daysBefore, WINDOW - 1 - d))
}

/**
 * Counts Schengen days the way the EU does: every calendar day you are in the area counts,
 * including the entry and exit days. Days spent in Schengen before the trip are assumed to fall
 * right before the start date (worst case).
 */
export function schengenSummary(
  ds: Dataset,
  stops: ScheduledStop[],
  passport: string,
  daysBefore: number,
): SchengenSummary {
  const applies = schengenApplies(ds, passport)
  if (!stops.length) return { applies, maxInWindow: 0, limit: SCHENGEN_LIMIT, firstViolation: null, days: 0 }
  const { start, inS } = areaDays(ds, stops)

  let maxInWindow = 0
  let firstViolation: string | null = null
  let total = 0
  for (let d = 0; d < inS.length; d++) {
    if (!inS[d]) continue
    total++
    const count = countOn(inS, d, daysBefore)
    if (count > maxInWindow) maxInWindow = count
    if (applies && count > SCHENGEN_LIMIT && !firstViolation) firstViolation = addDays(start, d)
  }
  return { applies, maxInWindow, limit: SCHENGEN_LIMIT, firstViolation, days: total }
}

/** Schengen days used by `date` on the trip (the days in the area in the 180 days up to it, as schengenSummary counts
 *  them), and whether the trip goes there at all. */
export function schengenUsed(ds: Dataset, stops: ScheduledStop[], daysBefore: number, date: string): { used: number; visits: boolean } {
  if (!stops.length) return { used: 0, visits: false }
  const { start, inS } = areaDays(ds, stops)
  const d = daysBetween(start, date)
  return { used: d < 0 ? Math.min(daysBefore, SCHENGEN_LIMIT) : countOn(inS, d, daysBefore), visits: inS.includes(1) }
}
