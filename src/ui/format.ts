import { dataset as ds } from '../data/dataset'

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const formatters = new Map<string, Intl.NumberFormat>()

/**
 * Formats an amount stored in EUR in the display currency, e.g. "NT$1,540" or "€43".
 * `precise` keeps two decimals for amounts under 10 (supermarket prices in EUR, USD, …).
 */
export function money(nEur: number, currency: string, precise = false): string {
  const rate = currency === 'EUR' ? 1 : ds.fx.rates[currency]
  if (!rate) return money(nEur, 'EUR', precise)
  const v = nEur * rate
  const digits = precise && v < 10 ? 2 : 0
  const key = `${currency}:${digits}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat('en', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits })
    formatters.set(key, f)
  }
  return f.format(v)
}

/** The amount in the country's local currency, e.g. "≈ 1,170 RSD", unless that's already the display currency. */
export function local(nEur: number, currency: string, displayCurrency: string): string | null {
  if (currency === displayCurrency) return null
  const rate = currency === 'EUR' ? 1 : ds.fx.rates[currency]
  if (!rate) return null
  const v = nEur * rate
  return `≈ ${v >= 100 ? Math.round(v).toLocaleString('en') : v.toFixed(1)} ${currency}`
}

export function duration(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`
}

export function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

export const compact = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n)

export const MODE_ICON: Record<string, string> = {
  train: '🚆', bus: '🚌', minibus: '🚐', ferry: '⛴️', flight: '✈️',
  metro: '🚇', tram: '🚊', trolleybus: '🚎', funicular: '🚞', cablecar: '🚡',
}
/** Colour of the stops on the map and in the itinerary list (other map views colour them by their own measure). */
export const STOP_COLOR = '#0f766e'
export const MODE_COLOR: Record<string, string> = { train: '#7c3aed', bus: '#d97706', minibus: '#d97706', ferry: '#0891b2', flight: '#db2777' }

export const cityName = (id: string) => ds.cities[id]?.name ?? id

/** ISO country code → flag emoji. */
export const flag = (iso2: string) =>
  iso2 === 'XK' ? '🇽🇰' : String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)))

/**
 * Colours of the five-level scales (air, mobile internet, cost, nearby places, card and English level bars), worst
 * first: red, orange, yellow, light green, dark green. Fixed steps rather than a blend, with the two greens far
 * apart in lightness, so neighbouring levels are easy to tell apart on the map.
 */
export const LEVEL_COLORS = ['#dc2626', '#f97316', '#eab308', '#84cc16', '#15803d'] as const

/** Colour of a level from 1 (worst) to 5 (best). */
export const levelColor = (level: number) => LEVEL_COLORS[Math.max(1, Math.min(5, Math.round(level))) - 1]

/** Exchange rate between two currencies, written so the number is ≥ 1, e.g. "1 EUR = 117.48 RSD". */
export function rateText(from: string, to: string): string | null {
  const a = from === 'EUR' ? 1 : ds.fx.rates[from]
  const b = to === 'EUR' ? 1 : ds.fx.rates[to]
  if (!a || !b || from === to) return null
  const r = b / a
  return r >= 1 ? `1 ${from} = ${r.toFixed(2)} ${to}` : `1 ${to} = ${(1 / r).toFixed(2)} ${from}`
}

export type WeatherKind = 'cold' | 'cool' | 'pleasant' | 'warm' | 'hot' | 'wet'

/** Temperature-style colours: blue for cold, green for pleasant, orange/red for heat, grey for rainy months. */
export const WEATHER_STYLE: Record<WeatherKind, { color: string }> = {
  cold: { color: '#1d4ed8' },
  cool: { color: '#38bdf8' },
  pleasant: { color: '#16a34a' },
  warm: { color: '#f59e0b' },
  hot: { color: '#dc2626' },
  wet: { color: '#94a3b8' },
}

export type TempUnit = 'C' | 'F'

/** A temperature (the data is in °C) as a whole number in the user's unit. */
export const tempValue = (c: number, unit: TempUnit) => Math.round(unit === 'F' ? (c * 9) / 5 + 32 : c)
/** "25°C" / "77°F". */
export const temp = (c: number, unit: TempUnit) => `${tempValue(c, unit)}°${unit}`
/** "12–25°C" / "54–77°F". */
/** "18–28°C"; "-24 to -15°C" when a value is below zero, where a dash would read as a minus. */
export function tempRange(lo: number, hi: number, unit: TempUnit): string {
  const [a, b] = [tempValue(lo, unit), tempValue(hi, unit)]
  return `${a}${a < 0 || b < 0 ? ' to ' : '–'}${b}°${unit}`
}

/** Each temperature class as its range, e.g. "18–28°C" (thresholds as in tempKind; the same for highs and lows). */
export function tempBand(kind: Exclude<WeatherKind, 'wet'>, unit: TempUnit): string {
  const t = (c: number) => tempValue(c, unit)
  const u = `°${unit}`
  return { cold: `<${t(12)}${u}`, cool: `${t(12)}–${t(18)}${u}`, pleasant: `${t(18)}–${t(28)}${u}`, warm: `${t(28)}–${t(32)}${u}`, hot: `${t(32)}${u}+` }[kind]
}

/** A warning's text, with the temperature (hot/cold warnings) in the given unit. */
export const warningTitle = (w: { title: string; tempC?: number; tempIsLow?: boolean }, unit: TempUnit) =>
  w.tempC === undefined ? w.title : `${w.title} (avg ${w.tempIsLow ? 'low' : 'high'} ${temp(w.tempC, unit)})`

/** Classifies a month by its average high, using the same thresholds as the weather warnings. */
export function weatherKind(m: { tHigh: number; rainDays: number }): WeatherKind {
  const t = temperatureKind(m)
  return t === 'pleasant' && m.rainDays >= 14 ? 'wet' : t
}

/** How a temperature (°C) feels, on one scale for any temperature (a day's high or a night's low):
 *  cold < 12, cool 12–18, pleasant 18–28, warm 28–32, hot 32+. */
export function tempKind(c: number): Exclude<WeatherKind, 'wet'> {
  if (c < 12) return 'cold'
  if (c < 18) return 'cool'
  if (c >= 32) return 'hot'
  if (c >= 28) return 'warm'
  return 'pleasant'
}

/** A month by its average high, for the map, where rain is shown separately (a ring around each stop). */
export const temperatureKind = (m: { tHigh: number }) => tempKind(m.tHigh)

/** Share of the days in a month (1–12) with rain, 0–1. */
export const rainShare = (rainDays: number, month: number) => Math.min(1, Math.max(0, rainDays / new Date(Date.UTC(2027, month, 0)).getUTCDate()))

/** A temperature axis around [min, max] (in the unit shown): a gridline every 5°C (10°F), a little room above and
 *  below so the lines don't touch the edges, and labels on every line, or every other one when there are many. */
export function tempScale(min: number, max: number, unit: 'C' | 'F'): { lo: number; hi: number; step: number; labelStep: number } {
  const room = unit === 'F' ? 3 : 2
  const step = unit === 'F' ? 10 : 5
  const lo = Math.floor((min - room) / step) * step
  const hi = Math.ceil((max + room) / step) * step
  return { lo, hi, step, labelStep: (hi - lo) / step > 8 ? step * 2 : step }
}
