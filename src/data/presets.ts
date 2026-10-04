import type { CountryMode, Dataset, TripGroup } from '../planner/types'

/** Region presets the user can add as trip groups. */
export const REGION_PRESETS: { name: string; countries: string[] }[] = [
  { name: 'Balkans', countries: ['AL', 'ME', 'BA', 'RS', 'XK', 'MK', 'HR', 'SI', 'GR'] },
  { name: 'Central & Eastern Europe', countries: ['BG', 'RO', 'MD', 'HU', 'SK', 'CZ', 'AT', 'UA', 'BY'] },
  { name: 'Poland', countries: ['PL'] },
  { name: 'Baltic States', countries: ['LT', 'LV', 'EE'] },
  { name: 'Russia', countries: ['RU'] },
  { name: 'East Asia', countries: ['TW', 'JP'] },
  { name: 'Southeast Asia', countries: ['TH', 'VN', 'MY', 'SG', 'KH'] },
]

/**
 * Countries with a "do not travel" advisory start as excluded. A country added on its own starts as
 * must-visit; countries added as part of a region start as optional, so the planner picks the best of them.
 */
export function defaultMode(ds: Dataset, iso2: string, single: boolean): CountryMode {
  if (ds.advisories[iso2]?.excludedByDefault) return 'excluded'
  return single ? 'must' : 'optional'
}

let nextId = 1
export function makeGroup(ds: Dataset, name: string, countries: string[], longer = false): TripGroup {
  return {
    id: `g${Date.now().toString(36)}${nextId++}`,
    name,
    countries: countries.map((iso2) => ({ iso2, mode: defaultMode(ds, iso2, countries.length === 1) })),
    longer,
  }
}

export const INTERESTS = ['history', 'culture', 'food', 'nature', 'hiking', 'beach', 'city', 'nightlife']
