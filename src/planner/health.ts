import type { Dataset, TapWater, VaccineAdvice } from './types'

export const TAP_WATER_LABELS: Record<TapWater, { short: string; tone: 'ok' | 'info' | 'warn' }> = {
  safe: { short: 'Safe to drink', tone: 'ok' },
  safe_bottled: { short: 'Safe, but most people drink bottled', tone: 'info' },
  boil: { short: 'Boil or filter first', tone: 'warn' },
  bottled: { short: 'Drink bottled water', tone: 'warn' },
}

/**
 * Vaccines and medicines for a country: CDC's advice when we have it, otherwise our own list (each one to discuss
 * with a travel clinic). Routine vaccines, measles included, apply everywhere and aren't listed.
 */
export function vaccinesFor(ds: Dataset, iso2: string): { items: VaccineAdvice[]; source: 'cdc' | 'ours'; url?: string } {
  const cdc = ds.cdc[iso2]
  if (cdc) return { items: cdc.items, source: 'cdc', url: cdc.url }
  const ours = (ds.health.countries[iso2]?.vaccines ?? []).filter((v) => !/^Routine/.test(v))
  return { items: ours.map((name) => ({ name, advice: 'consider', note: '' })), source: 'ours' }
}

/** Tap water for a city: a city-specific note if there is one, otherwise the country's. */
export function tapWater(ds: Dataset, cityId: string) {
  return ds.health.cities[cityId]?.tapWater ?? ds.health.countries[ds.cities[cityId].iso2]?.tapWater ?? null
}

/**
 * Air quality bands for a monthly average PM2.5 (µg/m³), best first: the WHO's interim targets for long-term
 * exposure (35, 25, 15 and 10 µg/m³) as the steps. Used by the map's colours and legend as well.
 */
export const AIR_BANDS: { max: number; level: number; short: string }[] = [
  { max: 10, level: 5, short: 'Good' },
  { max: 15, level: 4, short: 'OK' },
  { max: 25, level: 3, short: 'Moderate' },
  { max: 35, level: 2, short: 'Poor' },
  { max: Infinity, level: 1, short: 'Very poor' },
]

/** The air quality band of a monthly average PM2.5: level 5 (good) … 1 (very poor). */
export function airBand(pm25: number): { level: number; short: string } {
  const { level, short } = AIR_BANDS.find((b) => pm25 <= b.max)!
  return { level, short }
}
