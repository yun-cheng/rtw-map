// What a city looks like in the current map view: its colour, hover box and the value on its circle. Shared by the
// map and the timeline, so a stop has the same colour and hover box in both.
import { dataset as ds } from '../data/dataset'
import { airBand, costOf, likelyMonth, mobileInternet, nearby, nearbyLevel, roughCount, tripDay, type ScheduledStop } from '../planner'
import type { useTrip } from '../store/trip'
import { WEATHER_STYLE, levelColor, money, rainShare, shownTemps, tempKind, tempRange, tempValue } from '../ui/format'
import { COST_LABELS, NEARBY_LABELS, costScale, nearbyColor } from './scales'

/** An amount in EUR rounded to two significant digits in the display currency (6.57 → 6.6), back in EUR. */
function roundTo2(eur: number, currency: string): number {
  const rate = (currency === 'EUR' ? 1 : ds.fx.rates[currency]) || 1
  return Number((eur * rate).toPrecision(2)) / rate
}

/** A city's colour on a map view that has no data for it. */
export const NO_DATA = '#a8a29e'

/** `lines`: the view's value for the hover box, short, one per line ("15–24°C", "5 rain days"; "~NT$2,439/day"). */
export type Metric = { color?: string; lines?: string[]; rain?: number; value?: string }

/** A hover box's content: a bold title (optional), a grey subtitle, then lines (the first normal, the rest grey). */
export type TipContent = { title?: string; sub?: string; lines?: string[] }

type TripState = ReturnType<typeof useTrip.getState>
type MetricState = Pick<TripState, 'plan' | 'input' | 'layer' | 'layerMonth' | 'nearbyKind' | 'costKind' | 'weatherBy' | 'currency' | 'tempUnit' | 'tempFeels'>

/**
 * The colour (and hover text) of each city in the current map view; for weather also the share of rainy days, and
 * for weather, air and mobile the number shown in the stop's circle. Route view: no colour (stops keep theirs).
 */
export function cityMetrics(s: MetricState): (cityId: string) => Metric {
  const { plan, input, layer, layerMonth, nearbyKind, costKind, weatherBy, currency, tempUnit, tempFeels } = s
  const costs = layer === 'cost' ? costScale(costKind, input, currency) : null
  /** Month for the weather and air views: the chosen one, or (by default) when you're there on this trip. */
  const monthFor = (cityId: string) => layerMonth || likelyMonth(ds, plan, input, cityId)

  return (cityId) => {
    if (layer === 'climate') {
      const month = monthFor(cityId)
      const m = ds.climate[cityId]?.[month - 1]
      if (!m) return {}
      // Coloured and numbered by the high (days) or the low (nights), as picked in the legend, as it feels or as
      // measured (the shared setting).
      const shown = shownTemps(m, tempFeels)
      const t = weatherBy === 'low' ? shown.low : shown.high
      return {
        color: WEATHER_STYLE[tempKind(t, input.prefs.tempBreaks)].color, rain: rainShare(m.rainDays, month), value: String(tempValue(t, tempUnit)),
        lines: [tempRange(shown.low, shown.high, tempUnit), `${Math.round(m.rainDays)} rain days`],
      }
    }
    if (layer === 'air') {
      const month = monthFor(cityId)
      const a = ds.air.byCity[cityId]?.[month - 1]
      if (!a) return {}
      const band = airBand(a.pm25)
      return { color: levelColor(band.level), value: String(Math.round(a.pm25)), lines: [band.short, `${Math.round(a.pm25)} µg/m³`] }
    }
    if (layer === 'schengen') {
      const inside = !!ds.countries[ds.cities[cityId]?.iso2]?.schengen
      return { color: inside ? '#2563eb' : '#d97706', lines: [inside ? 'Schengen area' : 'Outside Schengen'] }
    }
    if (layer === 'mobile') {
      const m = mobileInternet(ds, cityId)
      if (!m) return { color: NO_DATA, lines: ['No data'] }
      return { color: levelColor(m.level), value: String(m.downMbps), lines: [m.short, `${m.downMbps} Mbps`] }
    }
    if (layer === 'nearby') {
      const n = nearby(ds, cityId)?.[nearbyKind]
      if (n === undefined) return { color: NO_DATA, lines: ['No data'] }
      const what = NEARBY_LABELS[nearbyKind].toLowerCase()
      return { color: nearbyColor(nearbyLevel(n)), lines: [n ? `${roughCount(n)} ${what}` : `No ${what} found`] }
    }
    if (costs) {
      const d = costOf(ds, cityId, costKind, input)
      // No rental price where that rental isn't usual in the city; for other costs, no data.
      if (!d) return { color: NO_DATA, lines: [costKind === 'car' || costKind === 'scooter' ? `No ${COST_LABELS[costKind].label.toLowerCase()} here` : 'No data'] }
      // Small amounts to two digits with their cents ("~€6.60/meal"), others whole ("~€62/day").
      return { color: costs.color(d), lines: [`~${money(roundTo2(d, currency), currency, costKind !== 'day')}${COST_LABELS[costKind].per}`] }
    }
    return {}
  }
}

/** A stop's hover box: its name, then the view's value; in the Route view (no value) "Day 12 · 4 nights". */
export const stopTip = (startDate: string, stop: ScheduledStop, metric: Metric): TipContent => ({
  title: ds.cities[stop.cityId].name,
  ...(metric.lines
    ? { lines: metric.lines }
    : { sub: `Day ${tripDay(startDate, stop.arrive)} · ${stop.nights} night${stop.nights === 1 ? '' : 's'}` }),
})

/** Another city's hover box: its name and the view's details, or how to see more. */
export const cityTip = (cityId: string, metric: Metric): TipContent =>
  ({ title: ds.cities[cityId].name, ...(metric.lines ? { lines: metric.lines } : { sub: 'Click for details' }) })

/** The same as plain text, e.g. for screen readers. */
export const tipText = (t: TipContent) => [t.title, t.sub, ...(t.lines ?? [])].filter(Boolean).join(' · ')
