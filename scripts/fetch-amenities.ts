// Shops and health services near each city centre, counted from OpenStreetMap via the Overpass API (ODbL).
// Cached per city in .cache/amenities, so it can resume.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CACHE, GEN, readJson, sleep, today, writeJson } from './lib.ts'

const RADIUS_M = 1500
const HOSPITAL_SEARCH_M = [15_000, 50_000]
const ENDPOINT = 'https://overpass-api.de/api/interpreter'

const COUNTS = {
  supermarket: 'nwr["shop"="supermarket"]',
  convenience: 'nwr["shop"="convenience"]',
  pharmacy: 'nwr["amenity"="pharmacy"]',
  clinic: 'nwr["amenity"~"^(clinic|doctors)$"]',
  atm: 'nwr["amenity"="atm"]',
} as const

type City = { id: string; lat: number; lon: number }
type Result = Record<keyof typeof COUNTS, number> & { nearestHospitalKm: number | null }

const { cities } = readJson<{ cities: City[] }>(join(GEN, 'cities.json'))
const dir = join(CACHE, 'amenities')
mkdirSync(dir, { recursive: true })

function km(aLat: number, aLon: number, bLat: number, bLon: number) {
  const r = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLon - aLon) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

async function query(q: string) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'User-Agent': 'rtw-map/0.1 (personal trip planner)', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: q }),
    })
    if ((res.status === 429 || res.status === 504) && attempt < 30) {
      console.log(`  Overpass busy (${res.status}), retrying in 60s`)
      await sleep(60_000)
      continue
    }
    if (!res.ok) throw new Error(`Overpass ${res.status}: ${(await res.text()).slice(0, 200)}`)
    return (await res.json()).elements as { type: string; tags?: Record<string, string>; lat?: number; lon?: number; center?: { lat: number; lon: number } }[]
  }
}

async function fetchCity(c: City): Promise<Result> {
  const path = join(dir, `${c.id}.json`)
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'))
  // Light query first: one "out count" per category near the centre.
  const around = `(around:${RADIUS_M},${c.lat},${c.lon})`
  const countEls = await query(`[out:json][timeout:60];${Object.values(COUNTS).map((sel) => `${sel}${around};out count;`).join('')}`)
  const counts = countEls.filter((e) => e.type === 'count').map((e) => Number(e.tags?.total ?? 0))

  // Then the nearest hospital: search close by first, widen only if nothing is found.
  // OSM sometimes tags dental practices as hospitals; leave those out.
  const isDental = (t: Record<string, string> = {}) => t.healthcare === 'dentist' || /dent|stomat/i.test(t.name ?? '')
  let hospitals: number[] = []
  for (const radius of HOSPITAL_SEARCH_M) {
    const els = await query(`[out:json][timeout:60];nwr["amenity"="hospital"](around:${radius},${c.lat},${c.lon});out center;`)
    hospitals = els
      .filter((e) => !isDental(e.tags))
      .map((e) => (e.center ?? (e.lat != null ? { lat: e.lat, lon: e.lon! } : null)))
      .filter((p): p is { lat: number; lon: number } => !!p)
      .map((p) => km(c.lat, c.lon, p.lat, p.lon))
    if (hospitals.length) break
  }
  const result = Object.fromEntries(Object.keys(COUNTS).map((k, i) => [k, counts[i] ?? 0])) as Result
  result.nearestHospitalKm = hospitals.length ? Math.round(Math.min(...hospitals) * 10) / 10 : null
  writeFileSync(path, JSON.stringify(result))
  await sleep(10_000)
  return result
}

const amenities: Record<string, Result> = {}
for (const [i, c] of cities.entries()) {
  console.log(`[${i + 1}/${cities.length}] ${c.id}`)
  amenities[c.id] = await fetchCity(c)
}

writeJson(join(GEN, 'amenities.json'), {
  _meta: {
    source: `OpenStreetMap contributors (ODbL), via Overpass API. Counts within ${RADIUS_M / 1000} km of the city centre; nearest hospital within ${HOSPITAL_SEARCH_M.at(-1)! / 1000} km.`,
    updatedAt: today(),
  },
  radiusKm: RADIUS_M / 1000,
  amenities,
})
