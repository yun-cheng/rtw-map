// The map views' colour scales, shared by the map (MapView) and its legend (MapControls) so the legend shows
// exactly the bands the map colours by. Each has five bands from red (worst) to dark green (best), see LEVEL_COLORS.
import { dataset as ds } from '../data/dataset'
import { AIR_BANDS, MOBILE_BANDS, NEARBY_BANDS, dailyCost, type Budget } from '../planner'
import type { NearbyKind } from '../store/trip'
import { levelColor, money } from '../ui/format'

export type LegendItem = { color: string; label: string; title?: string }


/** Air: the PM2.5 ranges of each band, cleanest first, e.g. "10–15". */
export const airLegend = (): LegendItem[] =>
  AIR_BANDS.map((b, i) => {
    const from = i ? AIR_BANDS[i - 1].max : 0
    return { color: levelColor(b.level), label: b.max === Infinity ? `${from}+` : `${from}–${b.max}`, title: b.short }
  })

/** Mobile internet: the download speed range (Mbps) of each band, slowest first, e.g. "50–100". */
export const mobileLegend = (): LegendItem[] =>
  MOBILE_BANDS.map((b, i) => {
    const from = i ? MOBILE_BANDS[i - 1].max : 0
    return { color: levelColor(b.level), label: !i ? `<${b.max}` : b.max === Infinity ? `${from}+` : `${from}–${b.max}`, title: `${b.short}: ${b.long}` }
  })

/** Nearby: colour of a rough-scale level (0–4), red for none found to dark green for 50+. */
export const nearbyColor = (level: number) => levelColor(level + 1)
/** Names of the kinds of place the Nearby view shows. */
export const NEARBY_LABELS: Record<NearbyKind, string> = { supermarket: 'Supermarkets', pharmacy: 'Pharmacies', clinic: 'Clinics & doctors', atm: 'ATMs' }
export const nearbyLegend = (): LegendItem[] => NEARBY_BANDS.map((b, i) => ({ color: nearbyColor(i), label: b.label }))

const percentiles = new Map<Budget, number[]>()

/**
 * Where the cost bands split for a budget, in EUR a day: the 20th, 40th, 60th and 80th percentiles over all
 * cities, so each band holds about a fifth of them whatever the budget.
 */
function costSplits(budget: Budget): number[] {
  let splits = percentiles.get(budget)
  if (!splits) {
    const days = Object.keys(ds.cities).map((id) => dailyCost(ds, id, budget)).filter((d) => d > 0).sort((a, b) => a - b)
    splits = [0.2, 0.4, 0.6, 0.8].map((p) => days[Math.floor((days.length - 1) * p)])
    percentiles.set(budget, splits)
  }
  return splits
}

/** The cost bands for a budget, with the splits rounded to two digits in the display currency (e.g. €26, NT$910). */
export function costScale(budget: Budget, currency: string) {
  const rate = (currency === 'EUR' ? 1 : ds.fx.rates[currency]) || 1
  const splits = costSplits(budget)
    .map((eur) => Number((eur * rate).toPrecision(2)) / rate)
    .filter((s, i, all) => i === 0 || s > all[i - 1])
  const colorOf = (band: number) => levelColor(5 - (band * 4) / splits.length)
  // "€26–35": the currency symbol only once.
  const amount = (eur: number) => money(eur, currency).replace(/^[^\d]+/, '')
  return {
    /** Colour of a daily cost in EUR: green for the cheapest fifth of cities, red for the dearest. */
    color: (eur: number) => colorOf(splits.filter((s) => eur >= s).length),
    legend: [
      { color: colorOf(0), label: `<${money(splits[0], currency)}` },
      ...splits.slice(1).map((s, i) => ({ color: colorOf(i + 1), label: `${money(splits[i], currency)}–${amount(s)}` })),
      { color: colorOf(splits.length), label: `${money(splits.at(-1)!, currency)}+` },
    ] as LegendItem[],
  }
}
