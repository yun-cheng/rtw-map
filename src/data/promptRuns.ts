// What the data prompts' runs (prompts/*.md, scripts/prompts.ts) and the review page that compares them share.

/** The costs prompt's prices asked in every city: rooms, meals, drinks out, public transport and taxis. */
export const CITY_KEYS = [
  'dormBed', 'privateRoom', 'hotelMid', 'hotelUpscale', 'apartment', 'mealLocal', 'mealDinner', 'coffee', 'beerBar',
  'localTransportDay', 'taxiStart', 'taxiPerKm',
] as const
/** The prices asked once per country, in its capital (capitalOf): rentals and the supermarket. */
export const NATIONAL_KEYS = [
  'carDay', 'scooterDay', 'water15', 'coke05', 'beer05', 'bread', 'eggs10', 'milk1l', 'pasta500g', 'bananas1kg', 'tomatoes1kg', 'chicken500g',
] as const
/** All of them: costs.csv's, the taxis and rentals local-transport.json has (in EUR), and the hotels and the
 *  apartment (hotelMid, hotelUpscale, apartment), only in the runs until the app has a use for them. */
export const COST_KEYS = [...CITY_KEYS, ...NATIONAL_KEYS]
/** Prices the app scales from the country's by a city's cost factor (cityPrices); the others are the country's. */
export const CITY_SCALED: readonly string[] = ['dormBed', 'privateRoom', 'hotelMid', 'hotelUpscale', 'apartment', 'mealLocal', 'mealDinner', 'coffee', 'beerBar']

type City = { id: string; name: string; iso2: string; costFactor: number; population: number | null; capital?: true }

/** The city a country's national prices (NATIONAL_KEYS) are asked in, and whose prices its other cities' can be
 *  switched to: its capital (GeoNames), or its biggest city where GeoNames marks none. */
export const capitalOf = <C extends City>(cities: C[], iso2: string): C | undefined => {
  const own = cities.filter((c) => c.iso2 === iso2)
  return own.find((c) => c.capital) ?? own.sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0]
}

/** One value of a run's answer. */
export type RunValue = {
  value: number | null
  source: string | null
  seen: string | null
  /** Where the source gives another currency than the country's (not converted). */
  currency?: string
  confidence: 'high' | 'medium' | 'low'
  /** Worked out from the city's own prices rather than found on a page, and how. */
  estimated?: true
  /** The city has no such thing (no metered taxis…): no value, and none to fill in. */
  none?: true
  basis?: string
  note?: string
}
/** A kept run (data/runs/<dataset>/v<version>/<month>/<model>/<name>.json): each city's answer, by city id (a prompt
 *  per country has "countries" instead). */
export type RunFile = {
  dataset: string
  version: number
  model: string
  month: string
  keptAt: string
  asked: string[]
  problems: string[]
  cities: Record<string, { city: string; currency: string; values: Record<string, RunValue> }>
}

/** A place in a places run's answer (prompts/places.md). */
export type RunPlace = {
  name: string
  local?: string
  rank: number
  tier: 'must' | 'worth' | 'extra'
  kind: string
  minutes: number
  dayTrip: boolean
  km?: number
  getThere?: string
  wikipedia: string | null
  why: string
  sure: 'high' | 'medium' | 'low'
  note?: string
}

/** A place to stay in a destinations run's answer (prompts/destinations.md). */
export type RunDestination = {
  name: string
  local?: string
  rank: number
  /** Within its country (v1 and v2). */
  tier?: 'must' | 'worth' | 'extra'
  /** How it compares with places to stay worldwide, 1 to 5 (v3 on). */
  world?: number
  kind: string
  days: { min: number; ideal: number; max: number }
  tags: string[]
  wikipedia: string | null
  /** For an area (a park, a bay…), the town visitors stay in (v2 on). */
  base?: { name: string; local?: string; wikipedia: string | null }
  why: string
  sure: 'high' | 'medium' | 'low'
  note?: string
}

/** A name to match places by: no accents, case or punctuation ("Hội An" and "hoian" match). */
export const nameKey = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '')
