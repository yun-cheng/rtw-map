// Enriches data/seed/cities.csv with coordinates, population, timezone and whether it's its country's capital (GeoNames'
// PPLC) from GeoNames (CC-BY 4.0), and adds the
// capital of every country with none of those (build-capitals.ts), marked `auto`: open data only, with the same plain
// defaults for what only a curated profile says (popularity, days, cost factor; no tags).
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { GEN, SEED, loadGeonames, normalize, readCsv, readJson, today, writeJson } from './lib.ts'

const seed = readCsv(join(SEED, 'cities.csv'))
const geo = await loadGeonames()

const missing: string[] = []
const cities = seed.map((s) => {
  const target = normalize(s.geoname || s.name)
  const matches = geo.filter(
    (g) =>
      g[8] === s.iso2 &&
      g[6] === 'P' &&
      (normalize(g[1]) === target || normalize(g[2]) === target || g[3].split(',').some((a) => normalize(a) === target)),
  )
  matches.sort((a, b) => Number(b[14]) - Number(a[14]))
  const g = matches[0]
  if (!g && !s.lat) missing.push(s.id)
  return {
    id: s.id,
    name: s.name,
    iso2: s.iso2,
    lat: s.lat ? Number(s.lat) : Number(g?.[4]),
    lon: s.lon ? Number(s.lon) : Number(g?.[5]),
    population: g ? Number(g[14]) : null,
    timezone: g?.[17] ?? null,
    geonameId: g ? Number(g[0]) : null,
    // (The prices a city is compared with: its country's capital's.)
    ...(g?.[7] === 'PPLC' && { capital: true }),
    tags: s.tags.split(';').filter(Boolean),
    popularity: Number(s.popularity),
    days: { min: Number(s.daysMin), ideal: Number(s.daysIdeal), max: Number(s.daysMax) },
    costFactor: Number(s.costFactor),
    longStay: s.longStay === '1',
    blurb: s.blurb,
  }
})

if (missing.length) {
  console.error(`No GeoNames match (add lat/lon or a geoname alias in cities.csv): ${missing.join(', ')}`)
  process.exit(1)
}

type Capital = { id: string; name: string; iso2: string; lat: number; lon: number; population: number | null; timezone: string | null; geonameId: number; blurb: string }
const capitalsPath = join(GEN, 'capitals.json')
const capitals = existsSync(capitalsPath) ? readJson<{ cities: Capital[] }>(capitalsPath).cities : []
const curated = new Set(cities.map((c) => c.iso2))
const auto = capitals.filter((c) => !curated.has(c.iso2)).map((c) => ({
  ...c,
  tags: [],
  popularity: 3,
  days: { min: 1, ideal: 2, max: 3 },
  costFactor: 1,
  longStay: false,
  blurb: c.blurb && c.blurb[0].toUpperCase() + c.blurb.slice(1),
  capital: true,
  auto: true,
}))

writeJson(join(GEN, 'cities.json'), {
  _meta: { source: 'GeoNames cities500 (CC-BY 4.0) + hand-curated profile; capitals elsewhere from GeoNames and Wikidata (CC0)', updatedAt: today() },
  cities: [...cities, ...auto],
})
