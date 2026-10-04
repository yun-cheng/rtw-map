// Driving times between nearby cities from the OSRM demo server (OpenStreetMap data, ODbL).
// The planner uses these to estimate legs that have no curated connection.
// The demo server accepts at most ~100 points per request, so cities are split into groups of
// neighbours and large groups are queried block by block.
import { join } from 'node:path'
import { GEN, readJson, sleep, today, writeJson } from './lib.ts'

type City = { id: string; lat: number; lon: number }
const { cities } = readJson<{ cities: City[] }>(join(GEN, 'cities.json'))
const MAX_KM = 800
const BLOCK = 45 // two blocks per request stay under the server limit

function km(a: City, b: City) {
  const r = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

// Groups of cities connected by chains of neighbours within MAX_KM (straight line).
const parent = cities.map((_, i) => i)
const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
for (let i = 0; i < cities.length; i++) {
  for (let j = i + 1; j < cities.length; j++) if (km(cities[i], cities[j]) <= MAX_KM) parent[find(i)] = find(j)
}
const groups = new Map<number, City[]>()
cities.forEach((c, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), c]))

async function table(sources: City[], destinations: City[]) {
  const all = [...sources, ...destinations]
  const coords = all.map((c) => `${c.lon},${c.lat}`).join(';')
  const src = sources.map((_, i) => i).join(';')
  const dst = destinations.map((_, i) => sources.length + i).join(';')
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?sources=${src}&destinations=${dst}&annotations=duration,distance`)
    const d = await res.json().catch(() => ({ code: `HTTP ${res.status}` }))
    if (d.code === 'Ok') return d as { durations: (number | null)[][]; distances: (number | null)[][] }
    if (attempt >= 3) throw new Error(`OSRM: ${d.code} ${d.message ?? ''}`)
    await sleep(5000)
  }
}

const seen = new Set<string>()
const roads: { a: string; b: string; driveMin: number; km: number }[] = []
for (const group of groups.values()) {
  if (group.length < 2) continue
  const blocks = Array.from({ length: Math.ceil(group.length / BLOCK) }, (_, k) => group.slice(k * BLOCK, (k + 1) * BLOCK))
  for (let x = 0; x < blocks.length; x++) {
    for (let y = x; y < blocks.length; y++) {
      const t = await table(blocks[x], blocks[y])
      blocks[x].forEach((a, i) => blocks[y].forEach((b, j) => {
        const key = [a.id, b.id].sort().join('|')
        const sec = t.durations[i][j]
        const m = t.distances[i][j]
        if (a.id === b.id || seen.has(key) || sec == null || m == null || m / 1000 > MAX_KM) return
        seen.add(key)
        roads.push({ a: a.id, b: b.id, driveMin: Math.round(sec / 60), km: Math.round(m / 1000) })
      }))
      await sleep(1000)
    }
  }
  console.log(`group of ${group.length} cities done`)
}

writeJson(join(GEN, 'roads.json'), {
  _meta: { source: 'OSRM (project-osrm.org) on OpenStreetMap data (ODbL); car driving times', updatedAt: today() },
  roads,
})
