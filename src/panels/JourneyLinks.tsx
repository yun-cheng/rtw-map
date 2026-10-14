// Links to check a journey elsewhere, always current (our times and prices are estimates): Google Maps' directions by
// public transport, Rome2Rio's every way there, and Google Flights where flying is likely (a flight in the journey, no
// route by land, or 8 hours or more), on the day of the journey unless it's past. In the journey panel and on Today.
import { localToday, type Leg } from '../planner'
import { flightsUrl, rome2rioUrl, transitUrl } from '../ui/format'

/** (A journey this long or longer gets a Google Flights link.) */
const FLIGHTS_FROM_MIN = 8 * 60

export function JourneyLinks({ leg, date }: { leg: Leg; date: string }) {
  const flights = !leg.reachable || leg.durationMin >= FLIGHTS_FROM_MIN || leg.hops.some((h) => h.mode === 'flight')
  const link = (href: string, label: string) => <a href={href} target="_blank" rel="noreferrer" className="text-accent hover:underline">{label} ↗</a>
  return (
    <>
      {link(transitUrl(leg.from, leg.to), 'Google Maps')}
      {link(rome2rioUrl(leg.from, leg.to), 'Rome2Rio')}
      {flights && link(flightsUrl(leg.from, leg.to, date >= localToday() ? date : undefined), 'Google Flights')}
    </>
  )
}
