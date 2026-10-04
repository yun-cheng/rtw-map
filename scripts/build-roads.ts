// Driving times between nearby cities from the OSRM demo server (OpenStreetMap data, ODbL).
// The planner uses these to estimate legs that have no curated connection.
import { join } from 'node:path'
import { GEN, readJson, today, writeJson } from './lib.ts'

type City = { id: string; lat: number; lon: number }
const { cities } = readJson<{ cities: City[] }>(join(GEN, 'cities.json'))
const MAX_KM = 800

const coords = cities.map((c) => `${c.lon},${c.lat}`).join(';')
const res = await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration,distance`)
const d = await res.json()
if (d.code !== 'Ok') throw new Error(`OSRM: ${d.code} ${d.message}`)

const roads: { a: string; b: string; driveMin: number; km: number }[] = []
for (let i = 0; i < cities.length; i++) {
  for (let j = i + 1; j < cities.length; j++) {
    const sec = d.durations[i][j]
    const m = d.distances[i][j]
    if (sec == null || m == null || m / 1000 > MAX_KM) continue
    roads.push({ a: cities[i].id, b: cities[j].id, driveMin: Math.round(sec / 60), km: Math.round(m / 1000) })
  }
}

writeJson(join(GEN, 'roads.json'), {
  _meta: { source: 'OSRM (project-osrm.org) on OpenStreetMap data (ODbL); car driving times', updatedAt: today() },
  roads,
})
