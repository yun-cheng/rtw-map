// Shops and health services near each city centre, counted from OpenStreetMap via the Overpass API (ODbL).
// One request per city (counts and the hospitals within 15 km together; a wider search only if there are none).
// The public servers are shared and refuse requests when busy, so a busy server is skipped for the next mirror.
// Cached per city in .cache/amenities, and the output is rewritten after every city, so a stopped run resumes and
// still leaves the cities it got.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CACHE, GEN, readJson, sleep, today, writeJson } from './lib.ts'

const RADIUS_M = 1500
const HOSPITAL_SEARCH_M = [15_000, 50_000]
/** Public Overpass servers with the same data, tried in turn when one is busy. */
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]
let endpoint = 0

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

type Element = { type: string; tags?: Record<string, string>; lat?: number; lon?: number; center?: { lat: number; lon: number } }

async function query(q: string): Promise<Element[]> {
  for (let attempt = 1; ; attempt++) {
    const url = ENDPOINTS[endpoint]
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'User-Agent': 'rtw-map/0.1 (personal trip planner)', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: q }),
      signal: AbortSignal.timeout(90_000),
    }).catch(() => null)
    // Some servers answer a busy moment with an HTML page instead of an error status.
    const data = res?.ok ? await res.json().catch(() => null) : null
    if (data) return data.elements
    if (attempt >= 4 * ENDPOINTS.length) throw new Error(`Overpass: no server answered (last: ${res?.status ?? 'no response'})`)
    console.log(`  ${new URL(url).host} ${res ? `busy (${res.status})` : 'not answering'}; trying the next server`)
    endpoint = (endpoint + 1) % ENDPOINTS.length
    // After every server has been tried once, wait a little before going round again.
    if (attempt % ENDPOINTS.length === 0) await sleep(30_000)
  }
}

async function fetchCity(c: City): Promise<Result> {
  const path = join(dir, `${c.id}.json`)
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'))
  // One "out count" per category near the centre, then the hospitals close by; a wider search only if there are
  // none. OSM sometimes tags dental practices as hospitals; leave those out.
  const around = `(around:${RADIUS_M},${c.lat},${c.lon})`
  const hospitalsWithin = (radius: number) => `nwr["amenity"="hospital"](around:${radius},${c.lat},${c.lon});out tags center;`
  const els = await query(`[out:json][timeout:90];${Object.values(COUNTS).map((sel) => `${sel}${around};out count;`).join('')}${hospitalsWithin(HOSPITAL_SEARCH_M[0])}`)
  const counts = els.filter((e) => e.type === 'count').map((e) => Number(e.tags?.total ?? 0))

  const isDental = (t: Record<string, string> = {}) => t.healthcare === 'dentist' || /dent|stomat/i.test(t.name ?? '')
  let hospitals: number[] = []
  for (const [i, radius] of HOSPITAL_SEARCH_M.entries()) {
    const found = i === 0 ? els.filter((e) => e.type !== 'count') : await query(`[out:json][timeout:90];${hospitalsWithin(radius)}`)
    hospitals = found
      .filter((e) => !isDental(e.tags))
      .map((e) => (e.center ?? (e.lat != null ? { lat: e.lat, lon: e.lon! } : null)))
      .filter((p): p is { lat: number; lon: number } => !!p)
      .map((p) => km(c.lat, c.lon, p.lat, p.lon))
    if (hospitals.length) break
  }
  const result = Object.fromEntries(Object.keys(COUNTS).map((k, i) => [k, counts[i] ?? 0])) as Result
  result.nearestHospitalKm = hospitals.length ? Math.round(Math.min(...hospitals) * 10) / 10 : null
  writeFileSync(path, JSON.stringify(result))
  await sleep(2_000)
  return result
}

const save = (amenities: Record<string, Result>) =>
  writeJson(join(GEN, 'amenities.json'), {
    _meta: {
      source: `OpenStreetMap contributors (ODbL), via Overpass API. Counts within ${RADIUS_M / 1000} km of the city centre; nearest hospital within ${HOSPITAL_SEARCH_M.at(-1)! / 1000} km.`,
      updatedAt: today(),
    },
    radiusKm: RADIUS_M / 1000,
    amenities,
  })

const amenities: Record<string, Result> = {}
const failed: string[] = []
for (const [i, c] of cities.entries()) {
  const cached = existsSync(join(dir, `${c.id}.json`))
  if (!cached) console.log(`[${i + 1}/${cities.length}] ${c.id}`)
  try {
    amenities[c.id] = await fetchCity(c)
    if (!cached) save(amenities)
  } catch (e) {
    console.error(`  ${c.id}: ${(e as Error).message}`)
    failed.push(c.id)
  }
}
save(amenities)
if (failed.length) {
  console.error(`No data for ${failed.join(', ')}: run again to retry them.`)
  process.exitCode = 1
}
