import type { CountryMode, Dataset, TripGroup } from '../planner/types'

/** Region presets the user can add as trip groups. */
export const REGION_PRESETS: { name: string; countries: string[] }[] = [
  { name: 'Balkans', countries: ['AL', 'ME', 'BA', 'RS', 'XK', 'MK', 'HR', 'SI', 'GR'] },
  { name: 'Eastern Europe', countries: ['BG', 'RO', 'MD', 'HU', 'SK', 'CZ', 'UA', 'BY'] },
  { name: 'Poland', countries: ['PL'] },
  { name: 'Baltic States', countries: ['LT', 'LV', 'EE'] },
  { name: 'Russia', countries: ['RU'] },
  { name: 'East Asia', countries: ['TW', 'JP'] },
  { name: 'Southeast Asia', countries: ['TH', 'VN', 'MY', 'SG', 'KH'] },
]

/** Countries with a "do not travel" advisory start as excluded; everything else as must-visit. */
export function defaultMode(ds: Dataset, iso2: string): CountryMode {
  return ds.advisories[iso2]?.excludedByDefault ? 'excluded' : 'must'
}

let nextId = 1
export function makeGroup(ds: Dataset, name: string, countries: string[], longer = false): TripGroup {
  return {
    id: `g${Date.now().toString(36)}${nextId++}`,
    name,
    countries: countries.map((iso2) => ({ iso2, mode: defaultMode(ds, iso2) })),
    longer,
  }
}

export const INTERESTS = ['history', 'culture', 'food', 'nature', 'hiking', 'beach', 'city', 'nightlife']
