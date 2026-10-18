// A city's time zone and its time now, for the city panel's header (CityDrawer.tsx).
import { useEffect, useState } from 'react'
import type { Dataset } from '../planner/types'

/** The city's time zone (IANA, from GeoNames); for a city without one, its country's where all its cities share one. */
export function cityTimezone(ds: Pick<Dataset, 'cities'>, cityId: string): string | null {
  const city = ds.cities[cityId]
  if (!city) return null
  if (city.timezone) return city.timezone
  const zones = new Set(Object.values(ds.cities).filter((c) => c.iso2 === city.iso2 && c.timezone).map((c) => c.timezone))
  return zones.size === 1 ? [...zones][0] : null
}

/** Minutes the time zone is ahead of UTC at that moment (its summer time included). */
export function offsetMin(timeZone: string, at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      .formatToParts(at).map((p) => [p.type, Number(p.value)]),
  )
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
  return Math.round((wall - Math.floor(at.getTime() / 60000) * 60000) / 60000)
}

/** "UTC+2", "UTC+5:30", "UTC-3", "UTC". */
export function utcText(min: number): string {
  if (min === 0) return 'UTC'
  const h = Math.floor(Math.abs(min) / 60)
  const m = Math.abs(min) % 60
  return `UTC${min < 0 ? '-' : '+'}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`
}

/** How far the city's clock is from the traveller's: "same time as you", "6 h ahead of you", "5 h 30 min behind you". */
export function diffText(min: number): string {
  if (min === 0) return 'same time as you'
  const h = Math.floor(Math.abs(min) / 60)
  const m = Math.abs(min) % 60
  return `${[h && `${h} h`, m && `${m} min`].filter(Boolean).join(' ')} ${min > 0 ? 'ahead of' : 'behind'} you`
}

/** The city's time now: its weekday and time ("Sat 14:32"), its offset, the zone's name ("Central European Summer
 *  Time"; none where it has only an offset for one) and how far it is from this device's clock. */
export function localTime(timeZone: string, at: Date, hereMin = -at.getTimezoneOffset()) {
  const min = offsetMin(timeZone, at)
  const name = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'long' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value
  return {
    time: new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(at).replace(',', ''),
    utc: utcText(min),
    name: name && !/^(GMT|UTC)/.test(name) ? name : null,
    diff: diffText(min - hereMin),
  }
}

/** Now, again at the start of each minute. */
export function useMinute(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      setNow(new Date())
      timer = setTimeout(tick, 60000 - (Date.now() % 60000))
    }
    timer = setTimeout(tick, 60000 - (Date.now() % 60000))
    return () => clearTimeout(timer)
  }, [])
  return now
}
