// Country population from the World Bank API (CC-BY 4.0), latest available year;
// IMF World Economic Outlook where the World Bank has none (e.g. Taiwan).
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { GEN, SEED, fetchImf, readJson, today, writeJson } from './lib.ts'

const { countries } = readJson<{ countries: { iso2: string }[] }>(join(SEED, 'countries.json'))
const codes = countries.map((c) => c.iso2).join(';')
const res = await fetch(`https://api.worldbank.org/v2/country/${codes}/indicator/SP.POP.TOTL?format=json&mrv=1&per_page=100`)
if (!res.ok) throw new Error(`World Bank: ${res.status}`)
const [, rows] = (await res.json()) as [unknown, { country: { id: string }; date: string; value: number | null }[]]

const population: Record<string, { value: number; year: number; source?: string }> = Object.fromEntries(
  rows.filter((r) => r.value != null).map((r) => [r.country.id, { value: r.value!, year: Number(r.date) }]),
)

const missing = countries.map((c) => c.iso2).filter((c) => !population[c])
if (missing.length) {
  const ISO3: Record<string, string> = { TW: 'TWN' }
  const imf = await fetchImf('LP')
  const outPath = join(GEN, 'population.json')
  const previous = existsSync(outPath) ? readJson<{ population: typeof population }>(outPath).population : {}
  const year = String(new Date().getFullYear() - 1)
  for (const iso2 of missing) {
    const millions = imf?.[ISO3[iso2]]?.[year]
    if (millions) population[iso2] = { value: Math.round(millions * 1e6), year: Number(year), source: 'IMF' }
    else if (previous[iso2]) population[iso2] = previous[iso2]
    else console.error(`no population for ${iso2}`)
  }
}

writeJson(join(GEN, 'population.json'), {
  _meta: { source: 'World Bank, SP.POP.TOTL (CC-BY 4.0); IMF where missing', updatedAt: today() },
  population,
})
