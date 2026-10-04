import type { Dataset } from './types'

export const TRANSIT_LABELS: Record<number, { short: string; long: string }> = {
  5: { short: 'Excellent', long: 'Metro or tram network; easy to use without the local language' },
  4: { short: 'Good', long: 'Frequent trams or buses cover the city' },
  3: { short: 'OK', long: 'Buses cover the main areas; information may be in the local language only' },
  2: { short: 'Basic', long: 'A few bus routes; walking and taxis are often easier' },
  1: { short: 'Little or none', long: 'Walk, or take a taxi' },
}

/** Rough price of a 5 km taxi ride in EUR: metered/app price up to ~1.5× for street taxis and night rates. */
export function taxiEstimate(ds: Dataset, cityId: string): { min: number; max: number } | null {
  const taxi = ds.localTransport.countries[ds.cities[cityId].iso2]?.taxi
  if (!taxi) return null
  const base = taxi.flagFall + 5 * taxi.perKm
  return { min: base, max: base * 1.5 }
}
