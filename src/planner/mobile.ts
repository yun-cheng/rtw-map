import type { Dataset } from './types'

/** Mobile internet by the typical download speed on phones in a city (Mbps), slowest first. */
export const MOBILE_BANDS: { max: number; level: number; short: string; long: string }[] = [
  { max: 25, level: 1, short: 'Slow', long: 'Fine for maps and messages; video calls may struggle' },
  { max: 50, level: 2, short: 'OK', long: 'Fine for maps, messages and most video calls' },
  { max: 100, level: 3, short: 'Good', long: 'Fine for video calls and streaming' },
  { max: 200, level: 4, short: 'Fast', long: 'Fast enough for anything, including big uploads' },
  { max: Infinity, level: 5, short: 'Very fast', long: 'Fast enough for anything, including big uploads' },
]

/** Mobile internet in a city: its band (level 1 slow … 5 very fast) and measured speeds, or null without data. */
export function mobileInternet(ds: Dataset, cityId: string) {
  const m = ds.mobile[cityId]
  if (!m) return null
  const band = MOBILE_BANDS.find((b) => m.downMbps < b.max)!
  return { ...m, level: band.level, short: band.short, long: band.long }
}
