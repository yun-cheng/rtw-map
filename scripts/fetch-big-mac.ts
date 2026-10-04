// Big Mac prices from The Economist's Big Mac index (github.com/TheEconomist/big-mac-data, MIT).
// Latest local price per country, plus the euro-area average for euro countries without their own entry.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CACHE, GEN, SEED, readCsv, readJson, today, writeJson } from './lib.ts'

const URL = 'https://raw.githubusercontent.com/TheEconomist/big-mac-data/master/output-data/big-mac-full-index.csv'
const res = await fetch(URL)
if (!res.ok) throw new Error(`Big Mac data: ${res.status}`)
mkdirSync(CACHE, { recursive: true })
const path = join(CACHE, 'big-mac.csv')
writeFileSync(path, await res.text())
const rows = readCsv(path)
const latest = rows.reduce((d, r) => (r.date > d ? r.date : d), '')
const current = rows.filter((r) => r.date === latest)

const wbCountries = (await (await fetch('https://api.worldbank.org/v2/country?format=json&per_page=400')).json())[1] as { id: string; iso2Code: string }[]
const iso2Of = Object.fromEntries(wbCountries.map((c) => [c.id, c.iso2Code]))
iso2Of.TWN = 'TW'

const prices: Record<string, { localPrice: number; currency: string }> = {}
let euroArea: { localPrice: number; currency: string } | null = null
for (const r of current) {
  const entry = { localPrice: Number(r.local_price), currency: r.currency_code }
  if (r.iso_a3 === 'EUZ') euroArea = entry
  else if (iso2Of[r.iso_a3]) prices[iso2Of[r.iso_a3]] = entry
}

const { countries } = readJson<{ countries: { iso2: string; name: string }[] }>(join(SEED, 'countries.json'))
console.log(`Big Mac ${latest}: ${Object.keys(prices).length} countries; ours: ${countries.filter((c) => prices[c.iso2]).map((c) => c.iso2).join(', ')}`)

writeJson(join(GEN, 'big-mac.json'), {
  _meta: { source: `The Economist's Big Mac index (MIT), ${latest}`, updatedAt: today() },
  date: latest,
  euroArea,
  prices,
})
