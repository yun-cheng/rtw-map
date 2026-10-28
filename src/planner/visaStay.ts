// How long a passport may stay in a country, and the plan's days there against it (the plan's checks, index.ts).
import { daysBetween } from './dates'
import type { Dataset, ScheduledStop, VisaRule } from './types'

/** Entry kinds that come with a stay limit to plan around (a visa arranged in advance has its own). */
const LIMITED = new Set(['visa_free', 'eta', 'e_visa', 'visa_on_arrival'])

/** The stay a rule allows, in days: the Passport Index's (visa-free only) and Wikipedia's, the shorter where they
 *  differ by more than a few days, with both then in `differs`. Null where there's no limit or neither says. */
export function allowedStay(rule: VisaRule | undefined): { days: number; differs?: [number, number] } | null {
  if (!rule || !LIMITED.has(rule.req)) return null
  const index = rule.req === 'visa_free' ? rule.days : undefined
  const wiki = rule.stay?.days
  if (index && wiki && Math.abs(index - wiki) > 5) return { days: Math.min(index, wiki), differs: [index, wiki] }
  const days = index ?? wiki
  return days ? { days } : null
}

/** Days in the country, counted as a border does (arrival and departure days both), as stretches of the trip. */
function stretches(ds: Dataset, sched: ScheduledStop[], iso2: string): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = []
  sched.forEach((s, i) => {
    if (ds.cities[s.cityId].iso2 !== iso2) return
    const prev = sched[i - 1]
    if (prev && ds.cities[prev.cityId].iso2 === iso2) out[out.length - 1].to = s.depart
    else out.push({ from: s.arrive, to: s.depart })
  })
  return out
}

const length = (s: { from: string; to: string }) => daysBetween(s.from, s.to) + 1

/**
 * The plan's days in a country over what the rule allows: the most days in any period where the limit counts that
 * way (90 in 180), the longest stay where it's per entry, else all the days there. Null where it fits.
 */
export function overStay(ds: Dataset, sched: ScheduledStop[], iso2: string, rule: VisaRule | undefined):
  { planned: number; allowed: number; window?: number; differs?: [number, number] } | null {
  const allowed = allowedStay(rule)
  if (!allowed || ds.countries[iso2]?.schengen) return null
  const parts = stretches(ds, sched, iso2)
  if (!parts.length) return null
  const window = rule!.stay?.window
  if (window) {
    // Each day of the trip in the country or not, and the most of them in any `window.in` days.
    const start = parts[0].from
    const inside = new Uint8Array(daysBetween(start, parts.at(-1)!.to) + 1)
    for (const p of parts) for (let d = daysBetween(start, p.from); d <= daysBetween(start, p.to); d++) inside[d] = 1
    let most = 0
    for (let d = 0, count = 0; d < inside.length; d++) {
      count += inside[d] - (d >= window.in ? inside[d - window.in] : 0)
      most = Math.max(most, count)
    }
    if (most > window.days) return { planned: most, allowed: window.days, window: window.in }
  }
  const planned = rule!.stay?.perEntry || window ? Math.max(...parts.map(length)) : parts.reduce((t, p) => t + length(p), 0)
  return planned > allowed.days ? { planned, allowed: allowed.days, ...(allowed.differs && { differs: allowed.differs }) } : null
}
