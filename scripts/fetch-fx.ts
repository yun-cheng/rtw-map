// Exchange rates (EUR base) from ExchangeRate-API's open endpoint. Attribution required.
import { join } from 'node:path'
import { GEN, SEED, readJson, today, writeJson } from './lib.ts'

const { countries } = readJson<{ countries: { currency: string }[] }>(join(SEED, 'countries.json'))
const res = await fetch('https://open.er-api.com/v6/latest/EUR')
if (!res.ok) throw new Error(`fx: ${res.status}`)
const d = await res.json()
// Local currencies of our countries + common home currencies users can display prices in.
const DISPLAY = ['EUR', 'USD', 'GBP', 'CAD', 'AUD', 'NZD', 'JPY', 'KRW', 'TWD', 'CNY', 'HKD', 'SGD', 'INR', 'CHF', 'SEK', 'NOK', 'DKK']
const wanted = new Set([...DISPLAY, ...countries.map((c) => c.currency)])
const rates = Object.fromEntries(Object.entries(d.rates as Record<string, number>).filter(([k]) => wanted.has(k)))

writeJson(join(GEN, 'fx.json'), {
  _meta: { source: 'Rates by Exchange Rate API (https://www.exchangerate-api.com)', updatedAt: today(), ratesAt: d.time_last_update_utc },
  base: 'EUR',
  display: DISPLAY,
  rates,
})
