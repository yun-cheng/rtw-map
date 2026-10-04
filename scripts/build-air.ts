// Monthly air quality (fine particles, PM2.5) per city from the Open-Meteo Air Quality API
// (Copernicus CAMS European model data, CC-BY 4.0). Cached per city in .cache/air, so it can resume.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CACHE, GEN, readJson, sleep, today, writeJson } from './lib.ts'

const START = '2023-01-01'
const END = '2024-12-31'
/** WHO 2021 guideline for the 24-hour mean of PM2.5 (µg/m³). */
const WHO_DAILY = 15

type City = { id: string; lat: number; lon: number }
type Hourly = { time: string[]; pm2_5: (number | null)[] }

const { cities } = readJson<{ cities: City[] }>(join(GEN, 'cities.json'))
const dir = join(CACHE, 'air')
mkdirSync(dir, { recursive: true })

async function fetchCity(c: City): Promise<Hourly> {
  const path = join(dir, `${c.id}.json`)
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'))
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${c.lat}&longitude=${c.lon}&hourly=pm2_5&start_date=${START}&end_date=${END}&timezone=GMT`
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url)
    if (res.status === 429 && attempt < 30) {
      console.log('  rate limited, retrying in 5 min')
      await sleep(300_000)
      continue
    }
    if (!res.ok) throw new Error(`${res.status} for ${c.id}: ${await res.text()}`)
    const hourly = (await res.json()).hourly as Hourly
    writeFileSync(path, JSON.stringify(hourly))
    await sleep(5000)
    return hourly
  }
}

const out: Record<string, { month: number; pm25: number; daysOverWho: number }[]> = {}
for (const [i, c] of cities.entries()) {
  console.log(`[${i + 1}/${cities.length}] ${c.id}`)
  const h = await fetchCity(c)
  // Daily means first, so we can count days above the WHO 24-hour guideline.
  const days = new Map<string, number[]>()
  h.time.forEach((t, k) => {
    const v = h.pm2_5[k]
    if (v == null) return
    const d = t.slice(0, 10)
    if (!days.has(d)) days.set(d, [])
    days.get(d)!.push(v)
  })
  const years = new Set([...days.keys()].map((d) => d.slice(0, 4))).size
  out[c.id] = Array.from({ length: 12 }, (_, m) => {
    const means = [...days.entries()]
      .filter(([d]) => Number(d.slice(5, 7)) === m + 1)
      .map(([, vs]) => vs.reduce((a, b) => a + b, 0) / vs.length)
    return {
      month: m + 1,
      pm25: Math.round((means.reduce((a, b) => a + b, 0) / Math.max(1, means.length)) * 10) / 10,
      daysOverWho: Math.round((means.filter((v) => v > WHO_DAILY).length / years) * 10) / 10,
    }
  })
}

writeJson(join(GEN, 'air.json'), {
  _meta: {
    source: `Open-Meteo Air Quality API (Copernicus CAMS European model, CC-BY 4.0), hourly PM2.5 ${START}…${END}, monthly averages`,
    updatedAt: today(),
  },
  whoDaily: WHO_DAILY,
  air: out,
})
