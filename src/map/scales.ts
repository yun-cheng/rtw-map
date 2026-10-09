// The map views' colour scales, shared by the map (MapView) and its legend (MapControls) so the legend shows
// exactly the bands the map colours by. Each has five bands from red (worst) to dark green (best), see LEVEL_COLORS.
import { dataset as ds } from '../data/dataset'
import { AIR_BANDS, MOBILE_BANDS, NEARBY_BANDS, costOf, prefsDay, type CostInput, type CostKind } from '../planner'
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

/** Names of the kinds of cost the Cost view shows, and what each price is for (after the amount: "€12/night"). */
export const COST_LABELS: Record<CostKind, { label: string; per: string }> = {
  day: { label: 'Per day', per: '/day' },
  dorm: { label: 'Dorm bed', per: '/night' },
  private: { label: 'Private room', per: '/night' },
  meal: { label: 'Local meal', per: '/meal' },
  restaurant: { label: 'Restaurant', per: '/dinner' },
  coffee: { label: 'Café', per: '/coffee' },
  beer: { label: 'Bar', per: '/beer' },
  groceries: { label: 'Groceries', per: '/day' },
  transport: { label: 'Transport', per: '/day' },
  taxi: { label: 'Taxi', per: '/ride' },
  car: { label: 'Car rental', per: '/day' },
  scooter: { label: 'Scooter rental', per: '/day' },
}

/** The Cost view's buttons: a group, then the kinds in it (Per day is a group of its own). */
export const COST_GROUPS: { label: string; kinds: CostKind[] }[] = [
  { label: 'Per day', kinds: ['day'] },
  { label: 'Stay', kinds: ['dorm', 'private'] },
  { label: 'Food & drink', kinds: ['meal', 'restaurant', 'coffee', 'beer', 'groceries'] },
  { label: 'Getting around', kinds: ['transport', 'taxi', 'car', 'scooter'] },
]

const percentiles = new Map<string, number[]>()

/**
 * Where the cost bands split for a kind of cost (a day: on these choices), in EUR: the 20th, 40th, 60th and 80th percentiles over
 * all cities, so each band holds about a fifth of them.
 */
function costSplits(kind: CostKind, input: CostInput): number[] {
  const key = kind === 'day' ? `day:${JSON.stringify([prefsDay(input.prefs), input.cityCosts])}` : kind
  let splits = percentiles.get(key)
  if (!splits) {
    const days = Object.keys(ds.cities).map((id) => costOf(ds, id, kind, input)).filter((d) => d > 0).sort((a, b) => a - b)
    splits = [0.2, 0.4, 0.6, 0.8].map((p) => days[Math.floor((days.length - 1) * p)])
    percentiles.set(key, splits)
  }
  return splits
}

/**
 * The bands for a kind of cost, with the splits rounded to two digits in the display currency (e.g. €26, NT$910;
 * small amounts keep their cents, e.g. €2.50).
 */
export function costScale(kind: CostKind, input: CostInput, currency: string) {
  const rate = (currency === 'EUR' ? 1 : ds.fx.rates[currency]) || 1
  const splits = costSplits(kind, input)
    .map((eur) => Number((eur * rate).toPrecision(2)) / rate)
    .filter((s, i, all) => i === 0 || s > all[i - 1])
  const colorOf = (band: number) => levelColor(5 - (band * 4) / splits.length)
  const precise = splits[0] * rate < 10
  const fmt = (eur: number) => money(eur, currency, precise)
  // "€26–35": the currency symbol only once.
  const amount = (eur: number) => fmt(eur).replace(/^[^\d]+/, '')
  return {
    /** Colour of a cost in EUR: green for the cheapest fifth of cities, red for the dearest. */
    color: (eur: number) => colorOf(splits.filter((s) => eur >= s).length),
    legend: [
      { color: colorOf(0), label: `<${fmt(splits[0])}` },
      ...splits.slice(1).map((s, i) => ({ color: colorOf(i + 1), label: `${fmt(splits[i])}–${amount(s)}` })),
      { color: colorOf(splits.length), label: `${fmt(splits.at(-1)!)}+` },
    ] as LegendItem[],
  }
}
