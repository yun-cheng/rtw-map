// Country population from the World Bank API (CC-BY 4.0), latest available year.
// Countries the World Bank has no data for use their own official statistics:
// - Taiwan: Ministry of the Interior household registration open data (Government Open Data License v1), end of year.
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { GEN, SEED, readJson, today, writeJson } from './lib.ts'

type Population = { value: number; year: number; source?: string }

const { countries } = readJson<{ countries: { iso2: string }[] }>(join(SEED, 'countries.json'))
const codes = countries.map((c) => c.iso2).join(';')
const res = await fetch(`https://api.worldbank.org/v2/country/${codes}/indicator/SP.POP.TOTL?format=json&mrv=1&per_page=100`)
if (!res.ok) throw new Error(`World Bank: ${res.status}`)
const [, rows] = (await res.json()) as [unknown, { country: { id: string }; date: string; value: number | null }[]]

const population: Record<string, Population> = Object.fromEntries(
  rows.filter((r) => r.value != null).map((r) => [r.country.id, { value: r.value!, year: Number(r.date) }]),
)

/** Registered population at the end of the latest year published, summed over all villages. */
async function taiwan(): Promise<Population | null> {
  const thisYear = new Date().getFullYear()
  for (const year of [thisYear - 1, thisYear - 2]) {
    const rocYear = year - 1911 // the registry uses the Republic of China calendar (2025 = 114)
    let total = 0
    for (let page = 1, pages = 1; page <= pages; page++) {
      const r = await fetch(`https://www.ris.gov.tw/rs-opendata/api/v1/datastore/ODRP019/${rocYear}?page=${page}`)
      if (!r.ok) throw new Error(`Taiwan household registry: ${r.status}`)
      const d = (await r.json()) as { totalPage?: string; responseData?: Record<string, string>[] }
      pages = Number(d.totalPage ?? 0)
      for (const row of d.responseData ?? []) {
        for (const [k, v] of Object.entries(row)) if (/^household_.*_[mf]$/.test(k)) total += Number(v)
      }
    }
    if (total) return { value: total, year, source: 'Taiwan Ministry of the Interior' }
  }
  return null
}

const OFFICIAL: Record<string, () => Promise<Population | null>> = { TW: taiwan }

const outPath = join(GEN, 'population.json')
const previous = existsSync(outPath) ? readJson<{ population: typeof population }>(outPath).population : {}
for (const iso2 of countries.map((c) => c.iso2).filter((c) => !population[c])) {
  const official = await OFFICIAL[iso2]?.().catch((e: Error) => {
    console.warn(`${iso2} official population unavailable (${e.message}); keeping the previous value`)
    return null
  })
  if (official) population[iso2] = official
  else if (previous[iso2]) population[iso2] = previous[iso2]
  else console.error(`no population for ${iso2}`)
}

writeJson(outPath, {
  _meta: { source: 'World Bank, SP.POP.TOTL (CC-BY 4.0); national statistics where missing (Taiwan: Ministry of the Interior)', updatedAt: today() },
  population,
})
