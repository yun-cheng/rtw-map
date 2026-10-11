// The next 10 days' weather in a city (city panel, Weather tab), fetched live from Open-Meteo (the source of the
// climate averages), beside the averages: what's coming, not just what's usual.
import { lazy, Suspense, useEffect, useState } from 'react'
import { dataset as ds } from '../data/dataset'
import { useTrip } from '../store/trip'

/** The chart uses Recharts, like the monthly ones (loaded with them). */
const ForecastChart = lazy(() => import('./ForecastChart').then((m) => ({ default: m.ForecastChart })))

const DAYS = 10
export type ForecastDay = {
  date: string
  code: number
  high: number
  low: number
  feelsHigh: number | null
  feelsLow: number | null
  rainMm: number
  /** The chance of rain (precipitation), %. */
  rainChance: number | null
  /** Relative humidity, the day's mean, % (as in the climate averages). */
  humidity: number | null
}

/** WMO weather codes (Open-Meteo's `weather_code`) as an icon and words. */
export function sky(code: number): [string, string] {
  if (code === 0) return ['☀️', 'Clear']
  if (code === 1) return ['🌤️', 'Mainly clear']
  if (code === 2) return ['⛅', 'Partly cloudy']
  if (code === 3) return ['☁️', 'Overcast']
  if (code === 45 || code === 48) return ['🌫️', 'Fog']
  if (code >= 51 && code <= 57) return ['🌦️', 'Drizzle']
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return ['🌧️', code >= 80 ? 'Showers' : 'Rain']
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['🌨️', 'Snow']
  if (code >= 95) return ['⛈️', 'Thunderstorm']
  return ['', 'Unknown']
}

// One request per city a day: kept for the session (a failed one is tried again next time).
const cache = new Map<string, Promise<ForecastDay[]>>()

function fetchForecast(cityId: string): Promise<ForecastDay[]> {
  const key = `${cityId}:${new Date().toDateString()}`
  let req = cache.get(key)
  if (!req) {
    const { lat, lon } = ds.cities[cityId]
    const vars = 'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,relative_humidity_2m_mean'
    req = fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&forecast_days=${DAYS}&daily=${vars}&timezone=auto`)
      .then((res) => {
        if (!res.ok) throw new Error(`Open-Meteo: ${res.status}`)
        return res.json()
      })
      .then(({ daily: d }) =>
        (d.time as string[])
          .map((date, i) => ({
            date,
            code: d.weather_code[i],
            high: d.temperature_2m_max[i],
            low: d.temperature_2m_min[i],
            feelsHigh: d.apparent_temperature_max[i],
            feelsLow: d.apparent_temperature_min[i],
            rainMm: d.precipitation_sum[i] ?? 0,
            rainChance: d.precipitation_probability_max[i],
            humidity: d.relative_humidity_2m_mean?.[i] ?? null,
          }))
          .filter((day) => day.high != null && day.low != null),
      )
    req.catch(() => cache.delete(key))
    cache.set(key, req)
  }
  return req
}

/** "Next 10 days": the forecast chart, the days of the stay highlighted (`stay`, ISO dates); a day's details on hover. */
export function Forecast({ cityId, stay }: { cityId: string; stay: Set<string> }) {
  const [days, setDays] = useState<ForecastDay[] | null | 'failed'>(null)
  const feels = useTrip((s) => s.tempFeels)

  useEffect(() => {
    let live = true
    setDays(null)
    fetchForecast(cityId).then((d) => live && setDays(d), () => live && setDays('failed'))
    return () => { live = false }
  }, [cityId])

  // As the rest of the card: how it feels, when that's the setting (and known).
  const asFelt = feels && Array.isArray(days) && days.every((d) => d.feelsHigh != null && d.feelsLow != null)

  return (
    <div className="mt-3">
      <div className="mb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">Next {DAYS} days</div>
      {days === null && <div className="h-[210px] animate-pulse rounded-md bg-canvas" aria-label="Loading the forecast" />}
      {(days === 'failed' || (Array.isArray(days) && !days.length)) && <p className="text-[13px] text-muted">Couldn't load the forecast.</p>}
      {Array.isArray(days) && days.length > 0 && (
        <Suspense fallback={<div className="h-[210px]" />}>
          <ForecastChart days={days} asFelt={asFelt} highlight={stay} />
        </Suspense>
      )}
    </div>
  )
}
