import type { Dataset } from './types'

export const ENGLISH_LABELS: Record<number, { short: string; long: string }> = {
  5: { short: 'Easy', long: 'Easy almost everywhere' },
  4: { short: 'Good', long: 'Easy in cities and tourist areas' },
  3: { short: 'Mixed', long: 'Fine with younger people and in tourist spots; harder elsewhere' },
  2: { short: 'Limited', long: 'Learn a few phrases and keep a translator app handy' },
  1: { short: 'Hard', long: 'Translator app essential' },
}

/**
 * How easy it is to get by in English in a city: the country estimate, one step easier in big or
 * very touristy cities, one step harder in small, less-visited towns. Null where the country has no estimate.
 */
export function englishLevel(ds: Dataset, cityId: string): { level: number; countryLevel: number; reason: string | null } | null {
  const city = ds.cities[cityId]
  // No estimate for a country with only its capital from open data (auto): none made up.
  const countryLevel = ds.countries[city.iso2]?.english?.level
  if (countryLevel === undefined) return null
  let level = countryLevel
  let reason: string | null = null
  if ((city.population ?? 0) >= 300_000 || city.popularity >= 5) {
    level = Math.min(5, countryLevel + 1)
    reason = 'big city or major tourist destination'
  } else if ((city.population ?? 0) < 30_000 && city.popularity <= 3) {
    level = Math.max(1, countryLevel - 1)
    reason = 'small town with fewer foreign visitors'
  }
  return { level, countryLevel, reason: level === countryLevel ? null : reason }
}
