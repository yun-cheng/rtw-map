import type { Dataset, RentalKind } from './types'

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

/** What each rental option is, and what you need to know before renting. */
export const RENTAL_INFO: Record<RentalKind, { icon: string; label: string; tip: string }> = {
  bikeShare: { icon: '🚲', label: 'Bike share', tip: 'Docked or app-based city bikes; usually a short sign-up in the app.' },
  eScooter: { icon: '🛴', label: 'E-scooters', tip: 'Pay per minute in the app; usually 18+. Many cities ban riding on pavements or with two people.' },
  bike: { icon: '🚵', label: 'Bike rental', tip: 'Rental shops and many guesthouses rent bikes by the day.' },
  car: { icon: '🚗', label: 'Car rental', tip: 'Usually needs a credit card in the driver’s name, age 21+ (extra fee under 25) and sometimes an International Driving Permit. Check whether you may cross borders.' },
  moto: { icon: '🛵', label: 'Scooter / motorbike rental', tip: 'You need the right licence category for the engine size, or insurance may not cover you. Wear a helmet.' },
}
