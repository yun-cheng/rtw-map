// National price levels: how far money goes in a country compared with the United States (= 1.00).
// price level = PPP conversion factor (local currency per international $) ÷ market rate (local currency per US$).
// PPP from the World Bank (CC-BY 4.0, indicator PA.NUS.PPP); IMF (PPPEX) only where the World Bank has no value
// (e.g. Taiwan). Market rates come from our own fx.json, so currencies always match (e.g. Bulgaria now in euros).
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { GEN, SEED, fetchImf, readJson, today, writeJson } from './lib.ts'

/** Countries a user can compare prices with ("about 35% cheaper than …"). */
const COMPARE: { iso2: string; name: string; currency: string }[] = [
  { iso2: 'US', name: 'United States', currency: 'USD' }, { iso2: 'GB', name: 'United Kingdom', currency: 'GBP' },
  { iso2: 'DE', name: 'Germany', currency: 'EUR' }, { iso2: 'FR', name: 'France', currency: 'EUR' },
  { iso2: 'NL', name: 'Netherlands', currency: 'EUR' }, { iso2: 'IT', name: 'Italy', currency: 'EUR' },
  { iso2: 'ES', name: 'Spain', currency: 'EUR' }, { iso2: 'CH', name: 'Switzerland', currency: 'CHF' },
  { iso2: 'SE', name: 'Sweden', currency: 'SEK' }, { iso2: 'NO', name: 'Norway', currency: 'NOK' },
  { iso2: 'DK', name: 'Denmark', currency: 'DKK' }, { iso2: 'CA', name: 'Canada', currency: 'CAD' },
  { iso2: 'AU', name: 'Australia', currency: 'AUD' }, { iso2: 'NZ', name: 'New Zealand', currency: 'NZD' },
  { iso2: 'JP', name: 'Japan', currency: 'JPY' }, { iso2: 'KR', name: 'South Korea', currency: 'KRW' },
  { iso2: 'TW', name: 'Taiwan', currency: 'TWD' }, { iso2: 'HK', name: 'Hong Kong', currency: 'HKD' },
  { iso2: 'SG', name: 'Singapore', currency: 'SGD' }, { iso2: 'CN', name: 'China', currency: 'CNY' },
  { iso2: 'IN', name: 'India', currency: 'INR' },
]

const { countries } = readJson<{ countries: { iso2: string; currency: string }[] }>(join(SEED, 'countries.json'))
const fx = readJson<{ rates: Record<string, number> }>(join(GEN, 'fx.json'))
const wanted = [...countries.map((c) => ({ iso2: c.iso2, currency: c.currency })), ...COMPARE]

// ISO2 ↔ ISO3 from the World Bank country list (Taiwan isn't a World Bank member, so add it by hand).
const wbCountries = (await (await fetch('https://api.worldbank.org/v2/country?format=json&per_page=400')).json())[1] as { id: string; iso2Code: string }[]
const iso3 = Object.fromEntries(wbCountries.map((c) => [c.iso2Code, c.id]))
iso3.TW = 'TWN'

const wb = (await (await fetch('https://api.worldbank.org/v2/country/all/indicator/PA.NUS.PPP?format=json&mrv=1&per_page=400')).json())[1] as
  { countryiso3code: string; country: { id: string }; date: string; value: number | null }[]
const wbPpp = new Map(wb.filter((r) => r.value).map((r) => [r.country.id, { value: r.value!, year: Number(r.date) }]))

const imf = await fetchImf('PPPEX')
const outPath = join(GEN, 'price-levels.json')
const previous = existsSync(outPath) ? readJson<{ levels: Record<string, { level: number; year: number; source: string }> }>(outPath).levels : {}
const imfYear = String(new Date().getFullYear() - 1)

const usdPer = (currency: string) => (fx.rates[currency] ?? (currency === 'EUR' ? 1 : NaN)) / fx.rates.USD

const levels: Record<string, { level: number; year: number; source: string }> = {}
for (const { iso2, currency } of wanted) {
  if (levels[iso2]) continue
  const lcuPerUsd = usdPer(currency)
  const fromWb = wbPpp.get(iso2)
  const fromImf = imf?.[iso3[iso2]]?.[imfYear]
  const ppp = fromWb ? { value: fromWb.value, year: fromWb.year, source: 'World Bank' } : fromImf ? { value: fromImf, year: Number(imfYear), source: 'IMF' } : null
  if (!ppp && !imf && previous[iso2]) { levels[iso2] = previous[iso2]; continue } // IMF unreachable: keep last year's figure
  if (!ppp || !lcuPerUsd) { console.error(`no price level for ${iso2}`); continue }
  levels[iso2] = { level: Math.round((ppp.value / lcuPerUsd) * 100) / 100, year: ppp.year, source: ppp.source }
  console.log(`${iso2} ${levels[iso2].level} (${ppp.source} ${ppp.year})`)
}

writeJson(outPath, {
  _meta: {
    source: 'World Bank PPP conversion factors (CC-BY 4.0), IMF where missing; divided by market exchange rates. United States = 1.00',
    updatedAt: today(),
  },
  compare: COMPARE,
  levels,
})
