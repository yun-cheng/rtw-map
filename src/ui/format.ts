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
export const MODE_COLOR: Record<string, string> = { train: '#2563eb', bus: '#d97706', minibus: '#d97706', ferry: '#0891b2', flight: '#7c3aed' }

export const cityName = (id: string) => ds.cities[id]?.name ?? id

/** ISO country code → flag emoji. */
export const flag = (iso2: string) =>
  iso2 === 'XK' ? '🇽🇰' : String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)))

/** 0 = bad (red) … 1 = good (green). */
export function ramp(v: number): string {
  const stops = [[0, [220, 38, 38]], [0.5, [234, 179, 8]], [1, [22, 163, 74]]] as const
  const x = Math.max(0, Math.min(1, v))
  const [a, b] = x <= 0.5 ? [stops[0], stops[1]] : [stops[1], stops[2]]
  const t = (x - a[0]) / (b[0] - a[0])
  const c = a[1].map((av, i) => Math.round(av + (b[1][i] - av) * t))
  return `rgb(${c.join(',')})`
}

/** Exchange rate between two currencies, written so the number is ≥ 1, e.g. "1 EUR = 117.48 RSD". */
export function rateText(from: string, to: string): string | null {
  const a = from === 'EUR' ? 1 : ds.fx.rates[from]
  const b = to === 'EUR' ? 1 : ds.fx.rates[to]
  if (!a || !b || from === to) return null
  const r = b / a
  return r >= 1 ? `1 ${from} = ${r.toFixed(2)} ${to}` : `1 ${to} = ${(1 / r).toFixed(2)} ${from}`
}
