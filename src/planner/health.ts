import type { Dataset, TapWater } from './types'

export const TAP_WATER_LABELS: Record<TapWater, { short: string; tone: 'ok' | 'info' | 'warn' }> = {
  safe: { short: 'Safe to drink', tone: 'ok' },
  safe_bottled: { short: 'Safe, but most people drink bottled', tone: 'info' },
  boil: { short: 'Boil or filter first', tone: 'warn' },
  bottled: { short: 'Drink bottled water', tone: 'warn' },
}

/** Tap water for a city: a city-specific note if there is one, otherwise the country's. */
export function tapWater(ds: Dataset, cityId: string) {
  return ds.health.cities[cityId]?.tapWater ?? ds.health.countries[ds.cities[cityId].iso2]?.tapWater ?? null
}

/** Air quality band for a monthly average PM2.5 (µg/m³), measured against the WHO 24-hour guideline of 15. */
export function airBand(pm25: number): { level: number; short: string } {
  if (pm25 <= 10) return { level: 5, short: 'Good' }
  if (pm25 <= 15) return { level: 4, short: 'OK' }
  if (pm25 <= 25) return { level: 3, short: 'Moderate' }
  if (pm25 <= 35) return { level: 2, short: 'Poor' }
  return { level: 1, short: 'Very poor' }
}
