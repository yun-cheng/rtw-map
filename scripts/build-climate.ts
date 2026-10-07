// Monthly climate averages per city from Open-Meteo's historical archive (ERA5 reanalysis, CC-BY 4.0).
// Responses are cached per city in .cache/climate, so the script can be re-run after a rate-limit stop. "Feels like"
// temperatures (apparent temperature: heat with humidity, cold with wind) are fetched separately (<id>.feels.json),
// so they could be added without downloading the rest again.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CACHE, GEN, readJson, sleep, today, writeJson } from './lib.ts'

const START = '2016-01-01'
const END = '2025-12-31'
const VARS = 'temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration,relative_humidity_2m_mean'
const FEELS_VARS = 'apparent_temperature_max,apparent_temperature_min'

type City = { id: string; lat: number; lon: number }
type Feels = { time: string[]; apparent_temperature_max: (number | null)[]; apparent_temperature_min: (number | null)[] }
type Daily = {
  time: string[]
  temperature_2m_max: (number | null)[]
  temperature_2m_min: (number | null)[]
  precipitation_sum: (number | null)[]
  sunshine_duration: (number | null)[]
  relative_humidity_2m_mean: (number | null)[]
}

const { cities } = readJson<{ cities: City[] }>(join(GEN, 'cities.json'))
const dir = join(CACHE, 'climate')
mkdirSync(dir, { recursive: true })

async function fetchCity<T>(c: City, vars: string, suffix = ''): Promise<T> {
  const path = join(dir, `${c.id}${suffix}.json`)
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'))
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${c.lat}&longitude=${c.lon}&start_date=${START}&end_date=${END}&daily=${vars}&timezone=GMT`
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url)
    // The free tier allows ~5,000 weighted calls per hour; one city is ~130. Wait for the window to reset.
    if (res.status === 429 && attempt < 30) {
      console.log(`  rate limited, retrying in 5 min`)
      await sleep(300_000)
      continue
    }
    if (!res.ok) throw new Error(`${res.status} for ${c.id}: ${await res.text()}`)
    const daily = (await res.json()).daily as T
    writeFileSync(path, JSON.stringify(daily))
    await sleep(8000)
    return daily
  }
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const r1 = (x: number) => Math.round(x * 10) / 10

/** 0–1: 1 = pleasant for sightseeing (highs 20–27°C, few rainy days). */
function comfort(tHigh: number, rainDays: number) {
  const temp = tHigh < 20 ? clamp01((tHigh - 5) / 15) : tHigh > 27 ? clamp01((38 - tHigh) / 11) : 1
  const rain = 1 - 0.6 * clamp01((rainDays - 4) / 12)
  return Math.round(temp * rain * 100) / 100
}

const out: Record<string, unknown[]> = {}
for (const [i, c] of cities.entries()) {
  console.log(`[${i + 1}/${cities.length}] ${c.id}`)
  const d = await fetchCity<Daily>(c, VARS)
  const f = await fetchCity<Feels>(c, FEELS_VARS, '.feels')
  const years = new Set(d.time.map((t) => t.slice(0, 4))).size
  out[c.id] = Array.from({ length: 12 }, (_, m) => {
    const idx = d.time.flatMap((t, j) => (Number(t.slice(5, 7)) === m + 1 ? [j] : []))
    const pick = (arr: (number | null)[]) => idx.map((j) => arr[j]).filter((v): v is number => v != null)
    const feelsIdx = f.time.flatMap((t, j) => (Number(t.slice(5, 7)) === m + 1 ? [j] : []))
    const pickFeels = (arr: (number | null)[]) => feelsIdx.map((j) => arr[j]).filter((v): v is number => v != null)
    const tHigh = avg(pick(d.temperature_2m_max))
    const precip = pick(d.precipitation_sum)
    const rainDays = precip.filter((p) => p >= 1).length / years
    return {
      month: m + 1,
      tHigh: r1(tHigh),
      tLow: r1(avg(pick(d.temperature_2m_min))),
      feelsHigh: r1(avg(pickFeels(f.apparent_temperature_max))),
      feelsLow: r1(avg(pickFeels(f.apparent_temperature_min))),
      rainMm: Math.round(precip.reduce((a, b) => a + b, 0) / years),
      rainDays: r1(rainDays),
      sunHours: r1(avg(pick(d.sunshine_duration)) / 3600),
      humidity: Math.round(avg(pick(d.relative_humidity_2m_mean))),
      comfort: comfort(tHigh, rainDays),
    }
  })
}

writeJson(join(GEN, 'climate.json'), {
  _meta: { source: `Open-Meteo historical archive (ERA5, CC-BY 4.0), daily ${START}…${END}, monthly averages`, updatedAt: today() },
  climate: out,
})
