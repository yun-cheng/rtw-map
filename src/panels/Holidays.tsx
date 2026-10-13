// A country's public holidays (city panel, Holidays tab), from Google Calendar, from 2021 to about five years ahead
// (scripts/fetch-holidays.ts; past years are kept, for past trips), those of some of its states or provinces too, with
// their names (for the whole country: cities don't say which they're in), one year at a time, stepped through with
// arrows (the stay's first, else this year's; this year's already past faded). Today and a stop's arrival and
// departure are lines of the list on their days (today first, then arriving, the day's holidays, leaving), with the
// stay's days highlighted; a day's date is on its first line only. The list is loaded only when the tab is first opened.
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { localToday } from '../planner'
import { dayDate } from '../ui/format'
import { Section } from '../ui/kit'

/** (regions: the states or provinces it's a holiday in; none: all of the country.) */
export type Holiday = { date: string; name: string; regions?: string[] }
type HolidayData = {
  /** (The years a country has: some set their holidays late.) */
  countries: Record<string, { years: number[]; days: Holiday[] }>
}

let loaded: HolidayData | null = null
const load = () => import('../../data/gen/holidays.json').then((m) => (loaded = m.default as unknown as HolidayData))

/** Regions named under a holiday before "and N more" (which shows the rest). */
const REGIONS_SHOWN = 3

/**
 * "Fri  1 Jan": weekday, day and month each in a column of its own, so the dates of a list line up; the weekday smaller
 * and fainter than the date.
 */
function DayDate({ date }: { date: string }) {
  const [weekday, day, month] = dayDate(date).split(' ')
  return <><span className="w-7 text-[11px] text-muted">{weekday}</span><span className="w-5 text-right">{day}</span><span>{month}</span></>
}

/** A line of the list: a holiday, or today, arriving or leaving (`first`: the day's first line, which has its date). */
type Line = { date: string; holiday?: Holiday; mark?: 'Today' | 'Arrive' | 'Leave'; first?: boolean }
/** (On a day: today, arriving, its holidays, leaving.) */
const ORDER = (l: Line) => (l.mark === 'Today' ? 0 : l.mark === 'Arrive' ? 1 : l.mark === 'Leave' ? 3 : 2)

function HolidayRow({ line, past }: { line: Line; past?: boolean }) {
  const [allRegions, setAllRegions] = useState(false)
  const h = line.holiday
  const regions = h?.regions
  return (
    <li className={`flex items-baseline gap-3 py-1 text-[13px] ${past ? 'opacity-50' : ''}`}>
      <span className="flex w-24 shrink-0 items-baseline gap-1 tabular-nums">{line.first && <DayDate date={line.date} />}</span>
      <span className="min-w-0 flex-1">
        {line.mark && (
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${line.mark === 'Today' ? 'border-accent text-accent' : 'border-accent bg-accent text-on-accent'}`}>{line.mark}</span>
        )}
        {h?.name}
        {regions && (
          <span className="block text-[11px] font-normal text-muted">
            In {allRegions || regions.length <= REGIONS_SHOWN + 1 ? regions.join(', ') : (
              <>{regions.slice(0, REGIONS_SHOWN).join(', ')} <button onClick={() => setAllRegions(true)} className="text-accent hover:underline">and {regions.length - REGIONS_SHOWN} more</button></>
            )}
          </span>
        )}
      </span>
    </li>
  )
}

export function Holidays({ iso2, countryName, stay }: { iso2: string; countryName: string; stay: { arrive: string; depart: string } | null }) {
  const [data, setData] = useState(loaded)
  const [picked, setPicked] = useState<number | null>(null)
  useEffect(() => { if (!data) load().then(setData) }, [data])
  if (!data) return <Section title="Public holidays"><p className="text-[13px] text-muted">Loading…</p></Section>

  const country = data.countries[iso2]
  if (!country) return <Section title="Public holidays"><p className="text-[13px] text-muted">No holiday dates for {countryName} yet.</p></Section>

  const { years } = country
  const today = localToday()
  const thisYear = +today.slice(0, 4)
  const [arriveYear, leaveYear] = stay ? [+stay.arrive.slice(0, 4), +stay.depart.slice(0, 4)] : [0, 0]
  // The year shown: the one picked, else the stay's, else this year (or the last there is); the button goes back to it.
  const home = stay ? arriveYear : thisYear
  const year = [picked, home, thisYear].find((y) => y && years.includes(y)) ?? years[years.length - 1]
  const at = years.indexOf(year)
  const step = (by: number, label: string) => (
    <button
      onClick={() => setPicked(years[at + by])}
      disabled={!years[at + by]}
      aria-label={label}
      className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-canvas hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {by < 0 ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
    </button>
  )

  // The year's holidays, and today, arriving and leaving where they're in it; those during the stay apart (in the
  // highlighted days).
  const lines: Line[] = country.days.filter((h) => h.date.startsWith(`${year}-`)).map((h) => ({ date: h.date, holiday: h }))
  if (year === thisYear) lines.push({ date: today, mark: 'Today' })
  if (stay) {
    if (arriveYear === year) lines.push({ date: stay.arrive, mark: 'Arrive' })
    if (leaveYear === year) lines.push({ date: stay.depart, mark: 'Leave' })
  }
  lines.sort((a, b) => a.date.localeCompare(b.date) || ORDER(a) - ORDER(b))
  lines.forEach((l, i) => { l.first = l.date !== lines[i - 1]?.date })
  const stayHere = !!stay && arriveYear <= year && year <= leaveYear
  const row = (l: Line) => <HolidayRow key={l.date + (l.holiday?.name ?? l.mark)} line={l} past={year === thisYear && l.date < today} />

  return (
    <Section
      title="Public holidays"
      aside={
        <span className="flex items-center">
          {year !== home && years.includes(home) && (
            <button onClick={() => setPicked(home)} className="mr-1 rounded-md px-2 py-1 text-[12px] font-medium text-accent hover:bg-accent-soft">
              {stay ? 'Your stay' : 'Today'}
            </button>
          )}
          {step(-1, 'Year before')}
          <b className="w-11 text-center text-[13px] tabular-nums">{year}</b>
          {step(1, 'Year after')}
        </span>
      }
    >
      <ul className="flex flex-col">
        {(stayHere ? lines.filter((l) => l.date < stay.arrive) : lines).map(row)}
        {stayHere && (
          <li>
            <ul className="-mx-2 flex flex-col rounded-lg bg-accent-soft px-2">
              {lines.filter((l) => l.date >= stay.arrive && l.date <= stay.depart).map(row)}
            </ul>
          </li>
        )}
        {stayHere && lines.filter((l) => l.date > stay.depart).map(row)}
      </ul>
    </Section>
  )
}
