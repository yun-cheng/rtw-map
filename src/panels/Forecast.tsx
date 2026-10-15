// The next 10 days' weather in a city (city panel, Weather tab), fetched live from Open-Meteo (the source of the
// climate averages), beside the averages: what's coming, not just what's usual.
import { lazy, Suspense, useEffect, useState } from 'react'
import { dataset as ds } from '../data/dataset'
import { localToday } from '../planner'
import { useTrip } from '../store/trip'

/** The chart uses Recharts, like the monthly ones (loaded with them). */
const ForecastChart = lazy(() => import('./ForecastChart').then((m) => ({ default: m.ForecastChart })))
const ForecastRain = lazy(() => import('./ForecastChart').then((m) => ({ default: m.ForecastRain })))

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

/** A city's forecast: `savedOn`, the day it was fetched, when it's the one kept on this device (the live one failed,
 *  offline), from today on; null when it's live. */
export type CityForecast = { days: ForecastDay[]; savedOn: number | null }

/** The last forecast fetched for each city, kept in the browser for when there's no connection. */
const SAVED_KEY = 'rtw-map-forecasts'
/** The cities kept, the latest fetched (a stop and the next one is two). */
const SAVED_CITIES = 12
type Saved = Record<string, { on: number; days: ForecastDay[] }>
const readSaved = (): Saved => {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? '{}') as Saved
  } catch {
    return {}
  }
}
function keep(cityId: string, days: ForecastDay[]) {
  const saved = { ...readSaved(), [cityId]: { on: Date.now(), days } }
  const latest = Object.entries(saved).sort(([, a], [, b]) => b.on - a.on).slice(0, SAVED_CITIES)
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(Object.fromEntries(latest)))
  } catch {
    // Storage unavailable or full: only means no forecast offline.
  }
}

// One request per city a day: kept for the session (a failed one is tried again next time).
const cache = new Map<string, Promise<CityForecast>>()

export function fetchForecast(cityId: string): Promise<CityForecast> {
  const key = `${cityId}:${new Date().toDateString()}`
  let req = cache.get(key)
  if (!req) {
    const { lat, lon } = ds.cities[cityId]
    const vars = 'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,relative_humidity_2m_mean'
    const live = fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&forecast_days=${DAYS}&daily=${vars}&timezone=auto`)
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
    req = live.then(
      (days) => {
        keep(cityId, days)
        return { days, savedOn: null }
      },
      (e: unknown) => {
        // No connection (or Open-Meteo down): the last one fetched, from today on (and tried again next time).
        cache.delete(key)
        const saved = readSaved()[cityId]
        const days = saved?.days.filter((day) => day.date >= localToday()) ?? []
        if (!days.length) throw e
        return { days, savedOn: saved.on }
      },
    )
    req.catch(() => cache.delete(key))
    cache.set(key, req)
  }
  return req
}

/** "Offline: the forecast as of 09:40 today" (or "from Sat 10 Oct"): a note with a forecast kept on this device. */
export function savedNote(on: number) {
  const d = new Date(on)
  return d.toDateString() === new Date().toDateString()
    ? `Offline: the forecast as of ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} today.`
    : `Offline: the forecast from ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}.`
}

/** "Next 10 days": the forecast charts (temperatures, then rain), today highlighted; a day's details on hover. */
export function Forecast({ cityId }: { cityId: string }) {
  const [forecast, setForecast] = useState<CityForecast | null | 'failed'>(null)
  const feels = useTrip((s) => s.tempFeels)

  useEffect(() => {
    let live = true
    setForecast(null)
    fetchForecast(cityId).then((f) => live && setForecast(f), () => live && setForecast('failed'))
    return () => { live = false }
  }, [cityId])

  const days = forecast && forecast !== 'failed' ? forecast.days : null
  // As the rest of the card: how it feels, when that's the setting (and known).
  const asFelt = feels && !!days && days.every((d) => d.feelsHigh != null && d.feelsLow != null)

  return (
    <div className="mt-3">
      <div className="mb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">Next {DAYS} days</div>
      {forecast === null && <div className="h-[222px] animate-pulse rounded-md bg-canvas" aria-label="Loading the forecast" />}
      {(forecast === 'failed' || (days && !days.length)) && <p className="text-[13px] text-muted">Couldn't load the forecast.</p>}
      {days && days.length > 0 && (
        <Suspense fallback={<div className="h-[367px]" />}>
          {forecast !== 'failed' && forecast?.savedOn && <p className="mb-1 text-[12px] text-muted">{savedNote(forecast.savedOn)}</p>}
          <ForecastChart days={days} asFelt={asFelt} />
          <SubHead title="Rain" unit="mm a day" />
          <ForecastRain days={days} />
        </Suspense>
      )}
    </div>
  )
}

/** A small heading over a chart in the Weather card ("Rain", "mm a day"), like its Sunshine one. */
export function SubHead({ title, unit }: { title: string; unit: string }) {
  return (
    <div className="mt-3 flex items-baseline justify-between text-[11px]">
      <span className="font-semibold tracking-wider text-muted uppercase">{title}</span>
      <span className="text-muted">{unit}</span>
    </div>
  )
}
