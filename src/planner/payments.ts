import type { Dataset } from './types'

export const CARD_LABELS: Record<number, { short: string; long: string }> = {
  5: { short: 'Cards everywhere', long: 'Cards and phone payments work almost everywhere' },
  4: { short: 'Mostly cards', long: 'Cards work in most places; keep some cash for small purchases' },
  3: { short: 'Mixed', long: 'Cards in hotels, supermarkets and city restaurants; cash for many small places' },
  2: { short: 'Mostly cash', long: 'Cash is king; cards only in bigger shops and hotels' },
  1: { short: 'Cash only', long: 'Plan to pay cash for everything' },
}

/**
 * How easy it is to pay by card in a city: a city-specific level if there is one; otherwise the
 * country level, one step easier in big or very touristy cities and one step harder in small towns.
 * Where foreign cards don't work at all (e.g. Russia), it's always cash only.
 */
export function cardLevel(ds: Dataset, cityId: string): { level: number; countryLevel: number; reason: string | null } {
  const city = ds.cities[cityId]
  const country = ds.payments.countries[city.iso2]
  const countryLevel = country?.cardLevel ?? 3
  if (country && !country.foreignCardsWork) return { level: 1, countryLevel, reason: 'foreign cards do not work in this country' }
  const override = ds.payments.cities[cityId]?.cardLevel
  if (override) return { level: override, countryLevel, reason: override === countryLevel ? null : 'local conditions' }
  if ((city.population ?? 0) >= 300_000 || city.popularity >= 5) {
    const level = Math.min(5, countryLevel + 1)
    return { level, countryLevel, reason: level === countryLevel ? null : 'big city or major tourist destination' }
  }
  if ((city.population ?? 0) < 30_000 && city.popularity <= 3) {
    const level = Math.max(1, countryLevel - 1)
    return { level, countryLevel, reason: level === countryLevel ? null : 'small town' }
  }
  return { level: countryLevel, countryLevel, reason: null }
}
