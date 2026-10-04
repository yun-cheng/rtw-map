// Enriches data/seed/cities.csv with coordinates, population and timezone from GeoNames (CC-BY 4.0).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CACHE, GEN, SEED, normalize, readCsv, today, writeJson } from './lib.ts'

const ZIP_URL = 'https://download.geonames.org/export/dump/cities500.zip'

async function loadGeonames(): Promise<string[][]> {
  const txt = join(CACHE, 'cities500.txt')
  if (!existsSync(txt)) {
    mkdirSync(CACHE, { recursive: true })
    const zip = join(CACHE, 'cities500.zip')
    const res = await fetch(ZIP_URL)
    if (!res.ok) throw new Error(`GeoNames download failed: ${res.status}`)
    writeFileSync(zip, Buffer.from(await res.arrayBuffer()))
    execFileSync('unzip', ['-o', zip, '-d', CACHE])
  }
  return readFileSync(txt, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'))
}

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

writeJson(join(GEN, 'cities.json'), {
  _meta: { source: 'GeoNames cities500 (CC-BY 4.0) + hand-curated profile', updatedAt: today() },
  cities,
})
