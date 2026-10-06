// Mobile internet in each city: download speed and latency measured on phones in the city, averaged over the
// tests in the area (weighted by the number of tests). Source: Ookla Speedtest open data, mobile tiles
// (https://github.com/teamookla/ookla-open-data, CC BY-NC-SA 4.0): one file per quarter, ~185 MB, with test
// counts and averages for ~600 m squares. The file is cached in .cache; the newest quarter is used.
// New quarters come out a few months after they end, so this runs with data:build, not the weekly refresh.
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet'
import { CACHE, GEN, readJson, today, writeJson } from './lib.ts'

type City = { id: string; lat: number; lon: number; population: number }
const { cities } = readJson<{ cities: City[] }>(join(GEN, 'cities.json'))

/** Fewer tests than this in the area, and the city gets no figure. */
const MIN_TESTS = 10

const BASE = 'https://ookla-open-data.s3.amazonaws.com/parquet/performance/type=mobile'
const QUARTER_START = ['01-01', '04-01', '07-01', '10-01']

/** The newest quarterly file: tries this year's quarters, newest first, then last year's. */
async function latest(): Promise<{ url: string; period: string }> {
  const year = new Date().getUTCFullYear()
  for (const y of [year, year - 1]) {
    for (let q = 4; q >= 1; q--) {
      const url = `${BASE}/year=${y}/quarter=${q}/${y}-${QUARTER_START[q - 1]}_performance_mobile_tiles.parquet`
      if ((await fetch(url, { method: 'HEAD' })).ok) return { url, period: `${y} Q${q}` }
    }
  }
  throw new Error('No mobile speed file found')
}

const { url, period } = await latest()
const file = join(CACHE, `mobile-${period.replace(' ', '').toLowerCase()}.parquet`)
if (!existsSync(file)) {
  console.log(`downloading ${period} (~185 MB)…`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} for ${url}`)
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
}

/** Radius around the centre that counts as the city: 3 km, up to 8 km for the biggest. */
const radiusKm = (c: City) => 3 + Math.min(5, 3 * Math.sqrt((c.population || 0) / 1e6))
const kmBetween = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180)
  return 6371 * Math.hypot(dLat, dLon)
}

// Cities by 1° cell, so each square is only compared with the cities near it.
const cellKey = (lat: number, lon: number) => `${Math.floor(lat)},${Math.floor(lon)}`
const byCell = new Map<string, City[]>()
for (const c of cities) {
  for (const dLat of [-1, 0, 1]) for (const dLon of [-1, 0, 1]) {
    const key = cellKey(c.lat + dLat, c.lon + dLon)
    byCell.set(key, [...(byCell.get(key) ?? []), c])
  }
}

type Sum = { tests: number; down: number; up: number; latency: number }
const sums = new Map<string, Sum>(cities.map((c) => [c.id, { tests: 0, down: 0, up: 0, latency: 0 }]))
const rows = (await parquetReadObjects({
  file: await asyncBufferFromFile(file),
  columns: ['tile_x', 'tile_y', 'avg_d_kbps', 'avg_u_kbps', 'avg_lat_ms', 'tests'],
})) as { tile_x: number; tile_y: number; avg_d_kbps: bigint; avg_u_kbps: bigint; avg_lat_ms: bigint; tests: bigint }[]
for (const r of rows) {
  const near = byCell.get(cellKey(r.tile_y, r.tile_x))
  if (!near) continue
  for (const c of near) {
    if (kmBetween(c.lat, c.lon, r.tile_y, r.tile_x) > radiusKm(c)) continue
    const s = sums.get(c.id)!
    const n = Number(r.tests)
    s.tests += n
    s.down += Number(r.avg_d_kbps) * n
    s.up += Number(r.avg_u_kbps) * n
    s.latency += Number(r.avg_lat_ms) * n
  }
}

const mobile: Record<string, { downMbps: number; upMbps: number; latencyMs: number; tests: number }> = {}
const missing: string[] = []
for (const c of cities) {
  const s = sums.get(c.id)!
  if (s.tests < MIN_TESTS) { missing.push(`${c.id} (${s.tests} tests)`); continue }
  mobile[c.id] = {
    downMbps: Math.round(s.down / s.tests / 1000),
    upMbps: Math.round(s.up / s.tests / 1000),
    latencyMs: Math.round(s.latency / s.tests),
    tests: s.tests,
  }
}
if (missing.length) console.warn(`Too few tests for: ${missing.join(', ')}`)
writeJson(join(GEN, 'mobile.json'), {
  _meta: { source: 'Ookla Speedtest open data, mobile (CC BY-NC-SA 4.0)', period, updatedAt: today() },
  mobile,
})
