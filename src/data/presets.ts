import type { CountryMode, Dataset, TripGroup } from '../planner/types'

/**
 * Countries with a "do not travel" advisory start as excluded. A country added on its own starts as
 * must-visit; countries added as part of a region start as optional, so the planner picks the best of them.
 */
export function defaultMode(ds: Dataset, iso2: string, single: boolean): CountryMode {
  if (ds.advisories[iso2]?.excludedByDefault) return 'excluded'
  return single ? 'must' : 'optional'
}

let nextId = 1
export function makeGroup(ds: Dataset, name: string, countries: string[]): TripGroup {
  return {
    id: `g${Date.now().toString(36)}${nextId++}`,
    name,
    countries: countries.map((iso2) => ({ iso2, mode: defaultMode(ds, iso2, countries.length === 1) })),
  }
}

export const INTERESTS = ['history', 'culture', 'food', 'nature', 'hiking', 'beach', 'city', 'nightlife']
