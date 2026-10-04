// Country population from the World Bank API (CC-BY 4.0), latest available year.
import { join } from 'node:path'
import { GEN, SEED, readJson, today, writeJson } from './lib.ts'

const { countries } = readJson<{ countries: { iso2: string }[] }>(join(SEED, 'countries.json'))
const codes = countries.map((c) => c.iso2).join(';')
const res = await fetch(`https://api.worldbank.org/v2/country/${codes}/indicator/SP.POP.TOTL?format=json&mrv=1&per_page=100`)
if (!res.ok) throw new Error(`World Bank: ${res.status}`)
const [, rows] = (await res.json()) as [unknown, { country: { id: string }; date: string; value: number | null }[]]

const population = Object.fromEntries(
  rows.filter((r) => r.value != null).map((r) => [r.country.id, { value: r.value, year: Number(r.date) }]),
)

writeJson(join(GEN, 'population.json'), {
  _meta: { source: 'World Bank, SP.POP.TOTL (CC-BY 4.0)', updatedAt: today() },
  population,
})
